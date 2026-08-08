import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORC_CODES, orcError } from './errors.js';
import {
  campaignIdFor,
  executionIdFor,
  nowIso,
  ensureDir
} from './utils.js';
import { StepEngine } from './workflow/engine.js';
import { ApprovalStore } from './approval/store.js';
import { PolicyGate } from './policy/gate.js';
import { OrchestratorEvents, ORC_EVENTS } from './observability/events.js';
import { AuditLog } from './observability/audit.js';
import { CheckpointStore } from './execution/checkpoint.js';
import { TraceCollector } from './execution/trace.js';
import { LockManager } from './concurrency/lock.js';
import { CampaignManager } from './campaign/index.js';
import { RecoveryManager } from './recovery/resume.js';
import { ValidationService } from './integrations/validation.js';
import { DiscoveryAdapter } from './integrations/discovery.js';
import { BrainAdapter } from './integrations/brain.js';
import { DossierAdapter } from './integrations/dossier.js';
import { PipelineAdapter } from './integrations/pipeline.js';
import { WebsiteAdapter } from './integrations/website.js';
import { DeliveryAdapter } from './integrations/delivery.js';
import { MemoryAdapter } from './integrations/memory.js';
import { ArtifactAdapter } from './integrations/artifacts.js';
import { SchedulerAdapter } from './integrations/scheduler.js';
import { killSwitch } from './safety/killswitch.js';

export const ORCHESTRATOR_API_VERSION = '1.0';
export { ORC_EVENTS, ORC_CODES };
export { AUTONOMY_LEVELS, AUTONOMY_CONFIG } from './policy/gate.js';
export { ORC_STATES, ORC_CAMPAIGN_STATES, TERMINAL_STATES, RETRYABLE_STATES } from './state/machine.js';
export { WORKFLOW_VERSION, STEP_IDS } from './workflow/steps.js';
export { FAILURE_CLASSES } from './errors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class OrchestratorSystem {
  constructor({
    root = ROOT,
    discovery = null,
    brain = null,
    dossier = null,
    pipeline = null,
    website = null,
    delivery = null,
    memory = null,
    artifacts = null,
    scheduler = null,
    bus = null,
    vault = null,
    autoAllowed = false,
    lockTtlMs = 300000,
    hardCap = 4,
    logger = null
  } = {}) {
    this.root = path.resolve(root);
    this.logger = logger;
    this.vault = vault || null;
    this.autoAllowed = Boolean(autoAllowed);
    this.hardCap = Math.max(1, Math.floor(hardCap));
    this.storageRoot = path.join(this.root, 'storage', 'orchestrator-engine');
    ensureDir(this.storageRoot);

    this.events = new OrchestratorEvents(bus);
    this.audit = new AuditLog({ root: this.root, vault: this.vault });
    this.validation = new ValidationService({ root: path.resolve(path.dirname(fileURLToPath(import.meta.url))) });
    this.killSwitch = killSwitch({ root: this.storageRoot });
    this.checkpoint = new CheckpointStore({ root: this.storageRoot });
    this.approvals = new ApprovalStore({ root: this.storageRoot });
    this.locks = new LockManager({ root: this.storageRoot, ttlMs: lockTtlMs });
    this.policy = new PolicyGate();

    this.adapters = {
      discovery: new DiscoveryAdapter({ discovery }),
      brain: new BrainAdapter({ brain }),
      dossier: new DossierAdapter({ dossier }),
      pipeline: new PipelineAdapter({ pipeline }),
      website: new WebsiteAdapter({ website }),
      delivery: new DeliveryAdapter({ delivery }),
      memory: new MemoryAdapter({ memory }),
      artifacts: new ArtifactAdapter({ artifacts }),
      scheduler: new SchedulerAdapter({ scheduler }),
      validation: this.validation
    };

    this.engine = new StepEngine({
      root: this.storageRoot,
      approvals: this.approvals,
      policy: this.policy,
      events: this.events,
      audit: this.audit,
      checkpoint: this.checkpoint,
      locks: this.locks,
      killSwitch: this.killSwitch
    });

    this.campaigns = new CampaignManager({
      root: this.storageRoot,
      engine: this.engine,
      approvals: this.approvals,
      budget: null,
      policy: this.policy,
      events: this.events,
      audit: this.audit,
      checkpoint: this.checkpoint,
      locks: this.locks,
      killSwitch: this.killSwitch,
      adapters: this.adapters,
      validation: this.validation,
      hardCap: this.hardCap,
      deliveryAutoAllowed: this.autoAllowed
    });

    this.recovery = new RecoveryManager({
      checkpoint: this.checkpoint,
      locks: this.locks,
      audit: this.audit,
      events: this.events,
      campaigns: this.campaigns
    });

    this._booted = false;
  }

  async boot() {
    if (this._booted) return this._bootSummary;
    this._bootSummary = await this.recovery.boot();
    this._booted = true;
    return this._bootSummary;
  }

  startCampaign(spec, opts = {}) {
    return this.campaigns.startCampaign(spec, opts);
  }

  async runCampaign(campaignId, opts = {}) {
    return this.campaigns.run(campaignId, opts);
  }

  startCampaignAndRun(spec, opts = {}) {
    const started = this.campaigns.startCampaign(spec, opts);
    if (started.note && started.note.startsWith('campaign already finished') && !opts.force) return started;
    return this.campaigns.run(started.campaignId, opts);
  }

  async pauseCampaign(campaignId) {
    return this.campaigns.pauseCampaign(campaignId);
  }

  async stopCampaign(campaignId) {
    return this.campaigns.stopCampaign(campaignId);
  }

  async resumeCampaign(campaignId) {
    return this.campaigns.resumeCampaign(campaignId);
  }

  approve(approvalId, opts = {}) {
    return this.campaigns.approve(approvalId, opts);
  }

  deny(approvalId, opts = {}) {
    return this.campaigns.deny(approvalId, opts);
  }

  requestQaOverride(executionId, opts = {}) {
    return this.campaigns.requestQaOverride(executionId, opts);
  }

  retryExecution(executionId, opts = {}) {
    return this.campaigns.retryExecution(executionId, opts);
  }

  rollback(executionId, opts = {}) {
    return this.campaigns.rollback(executionId, opts);
  }

  getExecution(executionId) {
    return this.campaigns.getExecution(executionId);
  }

  getTrace(executionId) {
    return this.campaigns.getTrace(executionId);
  }

  status(campaignId = null) {
    if (campaignId) return this.campaigns.summary(campaignId);
    return this.campaigns.listCampaigns();
  }

  history() {
    return this.campaigns.history();
  }

  pendingApprovals(executionId = null) {
    return this.approvals.pending(executionId);
  }

  getApproval(approvalId) {
    return this.approvals.get(approvalId);
  }

  registerProvider(id, provider) {
    this.adapters.delivery.delivery.registerProvider(id, provider);
    return this;
  }

  attachScheduler() {
    this.adapters.scheduler.registerHandler('orchestrator.campaign', (job) => {
      const input = (job && job.input) || {};
      if (input.action === 'resume' && input.campaignId) {
        return this.resumeCampaign(input.campaignId);
      }
      if (input.campaignId) return this.runCampaign(input.campaignId);
      return { status: 'noop' };
    });
    return this;
  }

  on(event, cb) {
    this.events.on(event, cb);
    return this;
  }

  off(event, cb) {
    this.events.off(event, cb);
    return this;
  }

  emit(event, payload = {}) {
    this.events.emit(event, payload);
    return this;
  }

  stats() {
    return {
      storageRoot: this.storageRoot,
      pendingApprovals: this.approvals.pending().length,
      campaigns: this.campaigns.listCampaigns(),
      locks: this.locks.snapshot(),
      killSwitch: this.killSwitch.isActive()
    };
  }

  close() {
    this.events.clear();
  }
}

export function createOrchestratorSystem(opts = {}) {
  return new OrchestratorSystem(opts);
}

export {
  campaignIdFor,
  executionIdFor,
  nowIso,
  TraceCollector,
  ApprovalStore,
  PolicyGate,
  CheckpointStore,
  LockManager,
  StepEngine,
  CampaignManager,
  RecoveryManager,
  ValidationService
};
