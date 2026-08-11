import fs from 'node:fs';
import path from 'node:path';
import {
  campaignIdFor,
  executionIdFor,
  canonicalSpec,
  campaignFile,
  ensureDir,
  atomicWrite,
  readJson,
  writeJson,
  nowIso,
  instanceRoot
} from '../utils.js';
import { orcError, ORC_CODES } from '../errors.js';
import {
  applyCampaignTransition,
  applyOrcTransition,
  canTransition,
  TERMINAL_CAMPAIGN_STATES,
  isTerminal
} from '../state/machine.js';
import { classifyError } from '../failures/classifier.js';
import { CandidateQueue } from './queue.js';
import { BoundedPool } from '../concurrency/pool.js';
import { TraceCollector } from '../execution/trace.js';
import { resolveLimits, isExhausted, limitKeyFor } from '../limits/budget.js';
import { WORKFLOW_VERSION, STEP_INDEX, entryStateFor } from '../workflow/steps.js';

function newExecution({ campaignId, businessId, workflowVersion }) {
  return {
    schema: 'https://agency.os/orchestrator/workflow-instance',
    executionId: executionIdFor(campaignId, businessId, workflowVersion),
    campaignId,
    businessId,
    workflowVersion,
    status: 'CREATED',
    stepIndex: 0,
    attempts: {},
    outputs: { artifactIds: [] },
    error: null,
    outcome: null,
    timeline: [],
    startedAt: nowIso()
  };
}

function qualifyCandidate(record, filters) {
  const opportunity = record.scores && record.scores.opportunity ? record.scores.opportunity.value : 0;
  const hasWebsite = !!record.website;
  const weak = !hasWebsite || (record.probe && record.probe.ok === false) || (record.probe && record.probe.timeMs > 2500);
  const belowMin = typeof filters.minOpportunityScore === 'number' && opportunity < filters.minOpportunityScore;
  const blocked = filters.requireNoWebsiteOrWeak === true && !weak;
  return { opportunity, weak, belowMin, blocked };
}

export class CampaignManager {
  constructor({
    root = null,
    engine = null,
    approvals = null,
    budget = null,
    policy = null,
    events = null,
    audit = null,
    checkpoint = null,
    locks = null,
    killSwitch = null,
    adapters = null,
    validation = null,
    hardCap = 4,
    deliveryAutoAllowed = false
  } = {}) {
    this.root = root;
    this.engine = engine;
    this.approvals = approvals;
    this.budget = budget;
    this.policy = policy;
    this.events = events;
    this.audit = audit;
    this.checkpoint = checkpoint;
    this.locks = locks;
    this.killSwitch = killSwitch;
    this.adapters = adapters;
    this.validation = validation;
    this.hardCap = Math.max(1, Math.floor(hardCap));
    this.deliveryAutoAllowed = Boolean(deliveryAutoAllowed);
    this.campaignsDir = root ? path.join(root, 'campaigns') : null;
    this._discoveryLock = Promise.resolve();
    this._activePools = new Map();
    this._mutex = Promise.resolve();
    this._live = new Map();
  }

  _campaign(campaignId) {
    return this._live.get(campaignId) || this.load(campaignId);
  }

  _withDiscoveryLock(fn) {
    const run = this._discoveryLock.then(fn, fn);
    this._discoveryLock = run.then(() => {}, () => {});
    return run;
  }

  _serialized(fn) {
    const run = this._mutex.then(fn, fn);
    this._mutex = run.then(() => {}, () => {});
    return run;
  }

  _file(campaignId) {
    return campaignFile(this.root, campaignId);
  }

  load(campaignId) {
    if (!this.campaignsDir) return null;
    return readJson(this._file(campaignId), null);
  }

  _save(campaign) {
    if (!this.campaignsDir) return;
    ensureDir(this.campaignsDir);
    campaign.updatedAt = nowIso();
    atomicWrite(this._file(campaign.id), JSON.stringify(campaign, null, 2));
  }

  _budgetFor(campaign) {
    const ledger = campaign.budget;
    const limits = ledger.limits;
    const consume = (kind, n = 1) => {
      const limit = limits[limitKeyFor(kind)];
      if (limit === undefined) return true;
      const next = (ledger.counters[kind] || 0) + n;
      if (next > limit) {
        if (!ledger.reached.includes(kind)) ledger.reached.push(kind);
        return false;
      }
      ledger.counters[kind] = next;
      return true;
    };
    return {
      limits,
      markStep: () => {
        ledger.counters.steps = (ledger.counters.steps || 0) + 1;
      },
      markRetry: () => {
        ledger.counters.retries = (ledger.counters.retries || 0) + 1;
      },
      markDeployment: () => consume('deployments', 1),
      markProviderCall: () => consume('providerCalls', 1),
      tryConsume: (kind, n = 1) => consume(kind, n),
      checkDuration: ({ executionStartedAt = null, now = null } = {}) => {
        const t = now || Date.now();
        const out = [];
        if (limits.maxCampaignDurationMs && ledger.startedAt) {
          if (t - Date.parse(ledger.startedAt) > limits.maxCampaignDurationMs) out.push('maxCampaignDurationMs');
        }
        if (executionStartedAt && limits.maxExecutionDurationMs) {
          if (t - Date.parse(executionStartedAt) > limits.maxExecutionDurationMs) out.push('maxExecutionDurationMs');
        }
        for (const kind of out) {
          if (!ledger.reached.includes(kind)) ledger.reached.push(kind);
        }
        return out;
      }
    };
  }

  _executionMeta(campaign, executionId) {
    return (campaign.executions || []).find((e) => e.executionId === executionId);
  }

  _updateExecutionMeta(campaign, execution) {
    let meta = this._executionMeta(campaign, execution.executionId);
    if (!meta) {
      meta = { executionId: execution.executionId, businessId: execution.businessId, status: execution.status, outcome: null };
      campaign.executions.push(meta);
    }
    meta.status = execution.status;
    meta.outcome = execution.outcome || null;
    meta.links = {
      dossierVersion: execution.outputs.dossierVersion || null,
      pipelineRunId: execution.outputs.pipelineRunId || null,
      buildId: execution.outputs.buildId || null,
      deliveryRecordId: execution.outputs.deliveryRecordId || null
    };
  }

  markExecutionResumed(campaignId, execution) {
    const campaign = this._campaign(campaignId);
    if (!campaign) return;
    this._updateExecutionMeta(campaign, execution);
    this._save(campaign);
  }

  startCampaign(spec, { force = false } = {}) {
    if (!spec || typeof spec !== 'object') throw orcError(ORC_CODES.CAMPAIGN_INVALID, 'campaign spec required');
    this.validation.assertValid('campaign', spec);
    const canonical = canonicalSpec(spec);
    const campaignId = campaignIdFor(spec);
    const existing = this.load(campaignId);
    if (existing) {
      if (!TERMINAL_CAMPAIGN_STATES.has(existing.state)) {
        this.events.emit(this.events.ORC_EVENTS.CAMPAIGN_STARTED, { campaignId, resumed: true });
        return { campaignId, state: existing.state, resumed: true, note: 'resuming existing campaign' };
      }
      if (!force) {
        return { campaignId, state: existing.state, resumed: false, note: 'campaign already finished; pass force=true to re-run' };
      }
      this._purgeRunState(existing);
    }
    const campaign = {
      schema: 'https://agency.os/orchestrator/campaign',
      id: campaignId,
      name: spec.name || campaignId,
      specCanonical: canonical,
      discovery: spec.discovery || {},
      filters: spec.filters || {},
      autonomyLevel: (spec.autonomyLevel || 'L4').toUpperCase(),
      deployment: spec.deployment || { provider: 'local', target: {}, allowedProviders: ['local'] },
      approvals: spec.approvals || {},
      workflowVersion: WORKFLOW_VERSION,
      state: 'DRAFT',
      resolution: this.policy.resolve((spec.autonomyLevel || 'L4').toUpperCase()),
      budget: {
        limits: resolveLimits(spec.limits),
        counters: { businesses: 0, deployments: 0, aiCalls: 0, providerCalls: 0, retries: 0, steps: 0 },
        startedAt: nowIso(),
        reached: []
      },
      metrics: {
        discovered: 0,
        qualified: 0,
        filtered: 0,
        approved: 0,
        rejected: 0,
        escalated: 0,
        generated: 0,
        deployed: 0,
        failed: 0,
        archived: 0,
        executed: 0,
        waiting: 0
      },
      executions: [],
      queue: [],
      timeline: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this._save(campaign);
    this.events.emit(this.events.ORC_EVENTS.CAMPAIGN_STARTED, { campaignId, resumed: false });
    this.audit.append({ action: 'campaign_started', campaignId, name: campaign.name, level: campaign.autonomyLevel });
    return { campaignId, state: campaign.state, resumed: false };
  }

  async run(campaignId, { force = false } = {}) {
    let campaign = this._campaign(campaignId);
    if (!campaign) throw orcError(ORC_CODES.CAMPAIGN_NOT_FOUND, `no campaign "${campaignId}"`);
    this._live.set(campaignId, campaign);
    if (TERMINAL_CAMPAIGN_STATES.has(campaign.state)) {
      if (!force) return { campaignId, state: campaign.state, note: 'campaign already finished' };
      this._purgeRunState(campaign);
      campaign.executions = [];
      campaign.queue = [];
      campaign.timeline = [];
      campaign.metrics = { discovered: 0, qualified: 0, filtered: 0, approved: 0, rejected: 0, escalated: 0, generated: 0, deployed: 0, failed: 0, archived: 0, executed: 0, waiting: 0 };
      campaign.budget = {
        limits: resolveLimits((campaign.specCanonical && campaign.specCanonical.limits) || campaign.budget.limits || {}),
        counters: { businesses: 0, deployments: 0, aiCalls: 0, providerCalls: 0, retries: 0, steps: 0 },
        startedAt: nowIso(),
        reached: []
      };
      campaign._halted = false;
      campaign.state = 'DRAFT';
    }
    if (campaign.state === 'RUNNING') return { campaignId, state: 'RUNNING', note: 'already running' };
    if (campaign.state === 'PAUSED') {
      await this._dispatchRemaining(campaign);
      return this.summary(campaignId);
    }
    if (campaign.state === 'DRAFT') applyCampaignTransition(campaign, 'QUEUE');
    applyCampaignTransition(campaign, 'START');
    this._save(campaign);

    const businesses = await this._withDiscoveryLock(() => this.adapters.discovery.runCampaignDiscovery(campaign));
    campaign.metrics.discovered = businesses.length;

    const filters = campaign.filters || {};
    const queue = new CandidateQueue({ maxBusinesses: campaign.budget.limits.maxBusinesses });
    queue.add(businesses);
    for (const id of queue.items()) {
      const record = businesses.find((b) => b.id === id);
      const check = qualifyCandidate(record, filters);
      if (check.belowMin || check.blocked) {
        campaign.metrics.filtered++;
        queue.byId.delete(id);
      }
    }
    queue.order = [...queue.byId.values()].sort((a, b) => b.opportunity - a.opportunity || a.id.localeCompare(b.id));
    campaign.metrics.qualified = queue.size();
    campaign.queue = queue.items();

    const admissionBudget = this._budgetFor(campaign);
    for (const businessId of queue.items()) {
      if (!admissionBudget.tryConsume('businesses', 1)) {
        campaign.metrics.filtered++;
        continue;
      }
      const executionId = executionIdFor(campaignId, businessId, campaign.workflowVersion);
      if (!this.checkpoint.exists(executionId)) {
        const execution = newExecution({ campaignId, businessId, workflowVersion: campaign.workflowVersion });
        this.checkpoint.save(execution);
      }
      this._updateExecutionMeta(campaign, { executionId, businessId, status: 'CREATED', outcomes: {}, outputs: { artifactIds: [] } });
      campaign.metrics.executed++;
    }
    this._save(campaign);

    const result = await this._dispatchAll(campaign);
    this._finalize(campaign, result);
    return this.summary(campaignId);
  }

  async _dispatchAll(campaign) {
    const pool = new BoundedPool({ maxConcurrent: Math.min(campaign.budget.limits.maxConcurrent, this.hardCap) });
    this._activePools.set(campaign.id, pool);
    const queue = new CandidateQueue({ maxBusinesses: campaign.budget.limits.maxBusinesses });
    queue.restore(campaign.queue);
    const outcomes = [];
    while (true) {
      while (!queue.isEmpty() && pool.active < pool.maxConcurrent && !campaign._halted) {
        const businessId = queue.dequeue();
        pool
          .submit(() => this._runOne(campaign, businessId))
          .then((r) => outcomes.push(r), (err) => outcomes.push({ error: err }));
      }
      if (pool.active === 0) break;
      await pool.awaitIdle();
      if (campaign._halted) {
        campaign.queue = queue.items();
        this._save(campaign);
        break;
      }
    }
    this._activePools.delete(campaign.id);
    return outcomes;
  }

  async _runOne(campaign, businessId) {
    const executionId = executionIdFor(campaign.id, businessId, campaign.workflowVersion);
    let execution = this.checkpoint.load(executionId);
    if (!execution) {
      execution = newExecution({ campaignId: campaign.id, businessId, workflowVersion: campaign.workflowVersion });
      this.checkpoint.save(execution);
    }
    campaign._budget = this._budgetFor(campaign);
    execution._trace = new TraceCollector({ root: this.root, executionId, campaignId: campaign.id, businessId });
    if (isTerminal(execution.status)) return { executionId, status: execution.status, skipped: true };
    let lockToken = null;
    try {
      lockToken = this.locks.acquire(businessId, executionId);
    } catch (err) {
      if (err.code === ORC_CODES.LOCK_CONFLICT) {
        execution.outcome = { verdict: 'SKIPPED_LOCKED', reason: err.message };
        this.checkpoint.save(execution);
        this._updateExecutionMeta(campaign, execution);
        this.audit.append({ action: 'execution_locked', executionId, businessId });
        return { executionId, status: execution.status, skipped: true, reason: 'locked' };
      }
      throw err;
    }
    try {
      this.events.emit(this.events.ORC_EVENTS.EXECUTION_STARTED, { executionId, campaignId: campaign.id, businessId });
      const result = await this.engine.runExecution(execution, campaign, { adapters: this.adapters });
      this._updateExecutionMeta(campaign, execution);
      return { executionId, status: execution.status, ...result };
    } finally {
      this.locks.release(businessId, executionId);
    }
  }

  _finalize(campaign, outcomes) {
    const counts = { deployed: 0, rejected: 0, failed: 0, archived: 0, escalated: 0, waiting: 0, qa_failed: 0, rolled_back: 0 };
    for (const meta of campaign.executions) {
      const s = meta.status;
      if (s === 'DEPLOYED') counts.deployed++;
      else if (s === 'ROLLED_BACK') counts.rolled_back++;
      else if (s === 'REJECTED') counts.rejected++;
      else if (s === 'FAILED') counts.failed++;
      else if (s === 'ARCHIVED') counts.archived++;
      else if (s === 'ESCALATED' || s === 'AWAITING_APPROVAL') counts.waiting++;
      else if (s === 'QA_FAILED') counts.qa_failed++;
    }
    campaign.metrics.deployed = counts.deployed;
    campaign.metrics.rejected = counts.rejected;
    campaign.metrics.failed = counts.failed;
    campaign.metrics.archived = counts.archived;
    campaign.metrics.escalated = counts.escalated + counts.qa_failed;
    campaign.metrics.waiting = counts.waiting;

    const limitHit = outcomes.some((r) => r && r.limitExhausted && r.limitExhausted.length);
    const stopped = outcomes.some((r) => r && r.stopped);
    const halted = campaign._halted === true;
    const hasWaiting = counts.waiting > 0 || counts.qa_failed > 0;

    let event;
    if (this.killSwitch && this.killSwitch.isActive()) {
      event = 'STOP';
    } else if (limitHit || isExhausted(campaign.budget)) {
      event = 'LIMITS';
    } else if (halted && campaign.state === 'RUNNING') {
      event = 'STOP';
    } else if (hasWaiting && campaign.state === 'RUNNING') {
      event = null;
    } else {
      event = 'COMPLETE';
    }
    if (applyCampaignTransitionSafe(campaign, event)) {
      this._save(campaign);
    }
    this._writeCampaignReport(campaign);
    if (TERMINAL_CAMPAIGN_STATES.has(campaign.state)) {
      this._live.delete(campaign.id);
    }
    if (event === 'LIMITS') {
      this.events.emit(this.events.ORC_EVENTS.CAMPAIGN_LIMITS_REACHED, { campaignId: campaign.id, budget: campaign.budget });
      this.audit.append({ action: 'campaign_limits_reached', campaignId: campaign.id, budget: campaign.budget });
    } else if (event === 'STOP') {
      this.events.emit(this.events.ORC_EVENTS.CAMPAIGN_STOPPED, { campaignId: campaign.id });
      this.audit.append({ action: 'campaign_stopped', campaignId: campaign.id });
    } else if (event) {
      this.events.emit(this.events.ORC_EVENTS.CAMPAIGN_COMPLETED, { campaignId: campaign.id, metrics: campaign.metrics });
      this.audit.append({ action: 'campaign_completed', campaignId: campaign.id, metrics: campaign.metrics });
    }
    this._save(campaign);
    return campaign;
  }

  _writeCampaignReport(campaign) {
    const report = {
      schema: 'https://agency.os/orchestrator/campaign-report',
      campaignId: campaign.id,
      name: campaign.name,
      state: campaign.state,
      autonomyLevel: campaign.autonomyLevel,
      metrics: campaign.metrics,
      budget: campaign.budget,
      executions: (campaign.executions || []).map((e) => ({
        executionId: e.executionId,
        businessId: e.businessId,
        status: e.status,
        outcome: e.outcome,
        links: e.links || {}
      })),
      timeline: campaign.timeline,
      generatedAt: nowIso()
    };
    try {
      this.adapters.artifacts.createWithDedupe({
        name: `campaign-${campaign.id}-report`,
        type: 'campaign-report',
        format: 'json',
        content: JSON.stringify(report, null, 2),
        workflowId: campaign.id,
        runId: campaign.id,
        title: `Campaign report — ${campaign.name}`,
        summary: `${campaign.metrics.deployed} deployed, ${campaign.metrics.rejected} rejected, ${campaign.metrics.escalated} escalated`,
        tags: ['orchestrator', 'campaign']
      });
    } catch (err) {
      this.audit.append({ action: 'campaign_report_failed', campaignId: campaign.id, error: err.message });
    }
  }

  async pauseCampaign(campaignId) {
    const campaign = this._campaign(campaignId);
    if (!campaign) throw orcError(ORC_CODES.CAMPAIGN_NOT_FOUND, `no campaign "${campaignId}"`);
    if (campaign.state !== 'RUNNING' && campaign.state !== 'QUEUED') return { campaignId, state: campaign.state };
    campaign._halted = true;
    const pool = this._activePools.get(campaignId);
    if (pool) {
      pool.stopDispatching();
      await pool.awaitIdle();
    }
    if (applyCampaignTransitionSafe(campaign, 'PAUSE')) {
      this._save(campaign);
    }
    this.events.emit(this.events.ORC_EVENTS.CAMPAIGN_PAUSED, { campaignId });
    this.audit.append({ action: 'campaign_paused', campaignId });
    return { campaignId, state: campaign.state };
  }

  async stopCampaign(campaignId) {
    const campaign = this._campaign(campaignId);
    if (!campaign) throw orcError(ORC_CODES.CAMPAIGN_NOT_FOUND, `no campaign "${campaignId}"`);
    campaign._halted = true;
    const pool = this._activePools.get(campaignId);
    if (pool) {
      pool.stopDispatching();
      await pool.awaitIdle();
    }
    if (applyCampaignTransitionSafe(campaign, 'STOP')) {
      this._save(campaign);
    }
    this.events.emit(this.events.ORC_EVENTS.CAMPAIGN_STOPPED, { campaignId });
    this.audit.append({ action: 'campaign_stopped', campaignId });
    return { campaignId, state: campaign.state };
  }

  async resumeCampaign(campaignId) {
    const campaign = this._campaign(campaignId);
    if (!campaign) throw orcError(ORC_CODES.CAMPAIGN_NOT_FOUND, `no campaign "${campaignId}"`);
    if (campaign.state === 'PAUSED') {
      campaign._halted = false;
      if (applyCampaignTransitionSafe(campaign, 'RESUME')) this._save(campaign);
      this.events.emit(this.events.ORC_EVENTS.CAMPAIGN_RESUMED, { campaignId });
      await this._dispatchRemaining(campaign);
      this._finalize(campaign, []);
      return this.summary(campaignId);
    }
    if (campaign.state === 'RUNNING') {
      campaign._halted = false;
      this._save(campaign);
      this.events.emit(this.events.ORC_EVENTS.CAMPAIGN_RESUMED, { campaignId });
      await this._dispatchRemaining(campaign);
      this._finalize(campaign, []);
      return this.summary(campaignId);
    }
    return { campaignId, state: campaign.state };
  }

  async _dispatchRemaining(campaign) {
    const seen = new Set(campaign.queue || []);
    for (const meta of campaign.executions || []) {
      if (seen.has(meta.businessId)) continue;
      const cp = this.checkpoint.load(executionIdFor(campaign.id, meta.businessId, campaign.workflowVersion));
      if (cp && !isTerminal(cp.status)) seen.add(meta.businessId);
    }
    const remaining = [...seen];
    campaign.queue = remaining;
    this._save(campaign);
    if (remaining.length) await this._dispatchAll(campaign);
    return remaining.length;
  }

  async _continueExecution(executionId, campaign) {
    const beforeCounters = campaign && campaign.budget && campaign.budget.counters ? { ...campaign.budget.counters } : null;
    try {
      return await this._continueExecutionInner(executionId, campaign);
    } catch (err) {
      try {
        return await this._failContinuation(executionId, campaign, err, beforeCounters);
      } catch {
        return null;
      }
    }
  }

  async _continueExecutionInner(executionId, campaign) {
    const execution = this.checkpoint.load(executionId);
    if (!execution) return null;
    execution._trace = new TraceCollector({ root: this.root, executionId, campaignId: campaign.id, businessId: execution.businessId });
    if (isTerminal(execution.status)) return { executionId, status: execution.status, skipped: true };
    if (this.killSwitch && this.killSwitch.isActive()) {
      execution.outcome = { verdict: 'STOPPED', reason: 'emergency stop' };
      this.checkpoint.save(execution);
      return { executionId, status: execution.status, stopped: true };
    }
    const beforeCounters = { ...campaign.budget.counters };
    const beforeReached = [...campaign.budget.reached];
    campaign._budget = this._budgetFor(campaign);
    const result = await this.engine.runExecution(execution, campaign, { adapters: this.adapters });
    await this._serialized(() => {
      const latest = this._live.get(campaign.id) || this.load(campaign.id);
      if (!latest) return;
      if (latest !== campaign) {
        for (const kind of Object.keys(latest.budget.counters)) {
          const delta = (campaign.budget.counters[kind] || 0) - (beforeCounters[kind] || 0);
          if (delta !== 0) latest.budget.counters[kind] = (latest.budget.counters[kind] || 0) + delta;
        }
        for (const kind of campaign.budget.reached) {
          if (!latest.budget.reached.includes(kind)) latest.budget.reached.push(kind);
        }
      }
      this._updateExecutionMeta(latest, execution);
      this._save(latest);
      this._maybeFinalize(latest);
    });
    return result;
  }

  async _failContinuation(executionId, campaign, err, beforeCounters = null) {
    try {
      const execution = this.checkpoint.load(executionId);
      if (!execution) {
        this.audit.append({ action: 'continuation_failed', executionId, campaignId: campaign ? campaign.id : null, error: String((err && err.message) || err) });
        return null;
      }
      const classified = classifyError(err, { phase: 'continue' });
      execution.error = classified;
      execution._trace = new TraceCollector({ root: this.root, executionId, campaignId: campaign.id, businessId: execution.businessId });
      const wasTerminal = isTerminal(execution.status);
      if (!wasTerminal && canTransition(execution.status, 'FAIL')) {
        applyOrcTransition(execution, 'FAIL', { step: 'continue', class: classified.class, code: classified.code });
        execution.outcome = { verdict: 'FAILED', class: classified.class, code: classified.code, message: classified.message };
      }
      this.checkpoint.save(execution);
      if (!wasTerminal) {
        try {
          execution._trace.append({ step: null, detail: 'continuation-failed', errorClass: classified.class, errorCode: classified.code });
        } catch {
          /* trace is best effort */
        }
        this.events.emit(this.events.ORC_EVENTS.FAILED, {
          executionId,
          campaignId: campaign.id,
          step: 'continue',
          error: { class: classified.class, code: classified.code }
        });
        this.audit.append({ action: 'execution_failed', executionId, campaignId: campaign.id, errorClass: classified.class, errorCode: classified.code });
      } else {
        this.audit.append({ action: 'continuation_failed', executionId, campaignId: campaign.id, errorClass: classified.class, errorCode: classified.code });
      }
      await this._serialized(() => {
        const latest = this._live.get(campaign.id) || this.load(campaign.id);
        if (!latest) return null;
        if (latest !== campaign && beforeCounters) {
          for (const kind of Object.keys(latest.budget.counters)) {
            const delta = (campaign.budget.counters[kind] || 0) - (beforeCounters[kind] || 0);
            if (delta !== 0) latest.budget.counters[kind] = (latest.budget.counters[kind] || 0) + delta;
          }
          for (const kind of campaign.budget.reached) {
            if (!latest.budget.reached.includes(kind)) latest.budget.reached.push(kind);
          }
        }
        this._updateExecutionMeta(latest, execution);
        this._save(latest);
        this._maybeFinalize(latest);
        return { executionId, status: execution.status };
      });
      return { executionId, status: execution.status };
    } catch (innerErr) {
      try {
        this.audit.append({ action: 'continuation_failed_unrecoverable', executionId, campaignId: campaign ? campaign.id : null, error: String((innerErr && innerErr.message) || innerErr) });
      } catch {
        /* audit is best effort */
      }
      try {
        const latest = this._live.get(campaign.id) || (campaign ? this.load(campaign.id) : null);
        if (latest) this._maybeFinalize(latest);
      } catch {
        /* finalize is best effort */
      }
      return null;
    }
  }

  _purgeRunState(campaign) {
    try {
      this._live.delete(campaign.id);
      for (const meta of campaign.executions || []) {
        fs.rmSync(instanceRoot(this.root, meta.executionId), { recursive: true, force: true });
      }
      this.approvals.purgeCampaign(campaign.id);
      this.audit.append({ action: 'run_state_purged', campaignId: campaign.id, executions: (campaign.executions || []).length });
    } catch (err) {
      this.audit.append({ action: 'run_state_purge_failed', campaignId: campaign.id, error: err.message });
    }
  }

  _maybeFinalize(campaign) {
    if (!campaign || campaign.state !== 'RUNNING') return;
    for (const id of campaign.queue || []) {
      const cp = this.checkpoint.load(executionIdFor(campaign.id, id, campaign.workflowVersion));
      if (cp && !isTerminal(cp.status)) return;
    }
    for (const meta of campaign.executions || []) {
      if (!isTerminal(meta.status)) return;
    }
    this._finalize(campaign, []);
  }

  approve(approvalId, { by, reason = null } = {}) {
    const record = this.approvals.decide(approvalId, { granted: true, decidedBy: by, reason });
    this._recordApprovalArtifact(record);
    this.events.emit(this.events.ORC_EVENTS.APPROVED, { approvalId: record.id, executionId: record.executionId, granted: true, decidedBy: by });
    this.audit.append({ action: 'approval_granted', approvalId: record.id, executionId: record.executionId, kind: record.kind, by });
    const campaign = this._campaign(record.campaignId);
    if (!campaign) return record;
    const execution = this.checkpoint.load(record.executionId);
    if (!execution) return record;
    execution._trace = new TraceCollector({ root: this.root, executionId: execution.executionId, campaignId: campaign.id, businessId: execution.businessId });

    if (execution.outputs.rollbackPending === record.id) {
      this._performRollback(execution, campaign, record, by).catch(() => {});
      return record;
    }
    if (execution.status === 'ESCALATED') applyOrcTransition(execution, 'APPROVAL_GRANTED', { approvalId: record.id });
    else if (execution.status === 'AWAITING_APPROVAL') applyOrcTransition(execution, 'APPROVAL_GRANTED', { approvalId: record.id });
    else if (execution.status === 'QA_FAILED' && record.kind === 'QA_OVERRIDE') applyOrcTransition(execution, 'QA_OVERRIDDEN', { approvalId: record.id });
    this.checkpoint.save(execution);
    execution._trace.append({ step: null, detail: 'approval-granted', approvalId: record.id, kind: record.kind });
    if (campaign.state === 'RUNNING' && !campaign._halted) {
      const pool = this._activePools.get(campaign.id);
      if (pool && !pool.stopped) {
        pool.submit(() => this._continueExecution(execution.executionId, campaign));
      } else {
        this._continueExecution(execution.executionId, campaign);
      }
    }
    return record;
  }

  deny(approvalId, { by, reason = null } = {}) {
    const record = this.approvals.decide(approvalId, { granted: false, decidedBy: by, reason });
    this._recordApprovalArtifact(record);
    this.events.emit(this.events.ORC_EVENTS.DENIED, { approvalId: record.id, executionId: record.executionId, granted: false, decidedBy: by });
    this.audit.append({ action: 'approval_denied', approvalId: record.id, executionId: record.executionId, kind: record.kind, by });
    const campaign = this._campaign(record.campaignId);
    if (!campaign) return record;
    const execution = this.checkpoint.load(record.executionId);
    if (!execution) return record;
    execution._trace = new TraceCollector({ root: this.root, executionId: execution.executionId, campaignId: campaign.id, businessId: execution.businessId });
    if (execution.status === 'ESCALATED' || execution.status === 'AWAITING_APPROVAL') {
      applyOrcTransition(execution, 'APPROVAL_DENIED', { approvalId: record.id });
    } else if (execution.status === 'QA_FAILED') {
      applyOrcTransition(execution, 'REJECTED', { approvalId: record.id });
    } else if (record.kind === 'MANUAL_STEP') {
      applyOrcTransition(execution, 'FAIL', { approvalId: record.id, reason: 'manual step denied' });
      execution.outcome = { verdict: 'DENIED', reason: reason || 'manual step denied' };
    }
    if (record.kind === 'SENSITIVE' && execution.outputs && execution.outputs.rollbackPending === record.id) {
      delete execution.outputs.rollbackPending;
    }
    if (isTerminal(execution.status) && !execution.outcome && ['REJECTED', 'FAILED'].includes(execution.status)) {
      execution.outcome = { verdict: execution.status, reason: reason || 'denied' };
    }
    this.checkpoint.save(execution);
    execution._trace.append({ step: null, detail: 'approval-denied', approvalId: record.id, kind: record.kind });
    this._updateExecutionMeta(campaign, execution);
    this._save(campaign);
    return record;
  }

  requestQaOverride(executionId, { by, reason = null, evidence = {} } = {}) {
    const campaignId = this._campaignOf(executionId);
    const execution = this.checkpoint.load(executionId);
    if (!execution) throw orcError(ORC_CODES.EXECUTION_NOT_FOUND, `no execution "${executionId}"`);
    if (execution.status !== 'QA_FAILED') {
      throw orcError(ORC_CODES.STATE_INVALID, `execution "${executionId}" is not in QA_FAILED`, { status: execution.status, retryable: false });
    }
    const record = this.approvals.request({
      executionId,
      campaignId,
      kind: 'QA_OVERRIDE',
      step: 'run-qa',
      requestedBy: by || 'operator',
      evidence: { qaReportId: execution.outputs.qaReportId || execution.outputs.buildId, ...evidence }
    });
    this.events.emit(this.events.ORC_EVENTS.APPROVAL_REQUIRED, { approvalId: record.id, executionId, kind: 'QA_OVERRIDE' });
    this.audit.append({ action: 'qa_override_requested', approvalId: record.id, executionId, by });
    return record;
  }

  retryExecution(executionId, { reason = 'retry' } = {}) {
    const campaignId = this._campaignOf(executionId);
    const campaign = this._campaign(campaignId);
    const execution = this.checkpoint.load(executionId);
    if (!execution) throw orcError(ORC_CODES.EXECUTION_NOT_FOUND, `no execution "${executionId}"`);
    execution._trace = new TraceCollector({ root: this.root, executionId, campaignId, businessId: execution.businessId });
    if (execution.status === 'QA_FAILED') {
      applyOrcTransition(execution, 'RETRY', { reason, actor: 'operator' });
      execution.stepIndex = STEP_INDEX['render-site'];
      delete execution.outputs.buildId;
      delete execution.outputs.qaReportId;
      delete execution.outputs.qaFailedReport;
      execution.error = null;
    } else if (execution.status === 'FAILED' && execution.error && ['TRANSIENT', 'SYSTEM'].includes(execution.error.class)) {
      const entry = entryStateFor(execution.stepIndex) || 'CREATED';
      execution.status = entry;
      execution.error = { ...execution.error, resumedAt: nowIso(), reason };
    } else {
      throw orcError(ORC_CODES.STATE_INVALID, `execution "${executionId}" cannot be retried from state ${execution.status}`, {
        status: execution.status,
        errorClass: execution.error ? execution.error.class : null,
        retryable: false
      });
    }
    this.checkpoint.save(execution);
    execution._trace.append({ step: null, detail: 'execution-retried', reason });
    this.audit.append({ action: 'execution_retried', executionId, reason });
    if (campaign && campaign.state === 'RUNNING' && !campaign._halted) {
      const pool = this._activePools.get(campaignId);
      if (pool && !pool.stopped) {
        pool.submit(() => this._continueExecution(executionId, campaign));
      } else {
        this._continueExecution(executionId, campaign);
      }
    }
    return { executionId, status: execution.status };
  }

  rollback(executionId, { by, reason = null } = {}) {
    const campaignId = this._campaignOf(executionId);
    const execution = this.checkpoint.load(executionId);
    if (!execution) throw orcError(ORC_CODES.EXECUTION_NOT_FOUND, `no execution "${executionId}"`);
    if (execution.status !== 'DEPLOYED') {
      throw orcError(ORC_CODES.STATE_INVALID, `execution "${executionId}" must be DEPLOYED to roll back`, { status: execution.status, retryable: false });
    }
    if (!execution.outputs.deliveryRecordId) {
      throw orcError(ORC_CODES.STATE_INVALID, `execution "${executionId}" has no delivery record`, { retryable: false });
    }
    let record = this.approvals.request({
      executionId,
      campaignId,
      kind: 'SENSITIVE',
      step: 'rollback',
      requestedBy: by || 'operator',
      evidence: { recordId: execution.outputs.deliveryRecordId }
    });
    for (let suffix = 2; record.decision; suffix++) {
      record = this.approvals.request({
        executionId,
        campaignId,
        kind: 'SENSITIVE',
        step: `rollback-${suffix}`,
        requestedBy: by || 'operator',
        evidence: { recordId: execution.outputs.deliveryRecordId }
      });
    }
    execution.outputs.rollbackPending = record.id;
    this.checkpoint.save(execution);
    this.events.emit(this.events.ORC_EVENTS.APPROVAL_REQUIRED, { approvalId: record.id, executionId, kind: 'SENSITIVE', step: 'rollback' });
    this.audit.append({ action: 'rollback_requested', approvalId: record.id, executionId, by });
    return { approvalId: record.id, status: 'approval_required' };
  }

  async _performRollback(execution, campaign, approval, by) {
    const recordId = execution.outputs.deliveryRecordId;
    try {
      this.adapters.delivery.approveRollback(recordId, { by: approval.decision.decidedBy });
      await this.adapters.delivery.rollback({ recordId, by: approval.decision.decidedBy, mode: 'explicit' });
    } catch (err) {
      const classified = classifyError(err, { phase: 'rollback' });
      execution.error = classified;
      delete execution.outputs.rollbackPending;
      if (canTransition(execution.status, 'FAIL')) {
        applyOrcTransition(execution, 'FAIL', { step: 'rollback', class: classified.class, approvalId: approval.id });
      }
      execution.outcome = { verdict: 'FAILED', class: classified.class, code: classified.code, message: classified.message };
      execution._trace.append({ step: 'rollback', detail: 'rollback-failed', approvalId: approval.id, recordId, errorCode: classified.code });
      this.checkpoint.save(execution);
      this._updateExecutionMeta(campaign, execution);
      this._save(campaign);
      this.events.emit(this.events.ORC_EVENTS.FAILED, {
        executionId: execution.executionId,
        campaignId: campaign.id,
        step: 'rollback',
        error: { class: classified.class, code: classified.code }
      });
      this.audit.append({ action: 'rollback_failed', executionId: execution.executionId, recordId, errorClass: classified.class, errorCode: classified.code });
      return;
    }
    applyOrcTransition(execution, 'ROLLBACK_REQUESTED', { approvalId: approval.id });
    execution.outcome = { verdict: 'ROLLED_BACK', reason: approval.decision.reason };
    delete execution.outputs.rollbackPending;
    execution._trace.append({ step: 'rollback', detail: 'rolled-back', approvalId: approval.id, recordId });
    this.checkpoint.save(execution);
    this._updateExecutionMeta(campaign, execution);
    this._save(campaign);
    this.events.emit(this.events.ORC_EVENTS.ROLLED_BACK, { executionId: execution.executionId, campaignId: campaign.id, recordId });
    this.audit.append({ action: 'rolled_back', executionId: execution.executionId, recordId });
  }

  _recordApprovalArtifact(record) {
    try {
      this.adapters.artifacts.createWithDedupe({
        name: `execution-${record.executionId}-approval-${record.id}`,
        type: 'approval-record',
        format: 'json',
        content: JSON.stringify(record, null, 2),
        workflowId: record.campaignId || 'orchestrator',
        runId: record.executionId,
        stepId: record.step || null,
        title: `Approval ${record.id} (${record.kind})`,
        summary: `${record.decision.granted ? 'granted' : 'denied'} by ${record.decision.decidedBy}`,
        tags: ['orchestrator', 'approval']
      });
    } catch (err) {
      this.audit.append({ action: 'approval_artifact_failed', approvalId: record.id, error: err.message });
    }
  }

  _campaignOf(executionId) {
    const checkpoint = this.checkpoint.load(executionId);
    if (!checkpoint) throw orcError(ORC_CODES.EXECUTION_NOT_FOUND, `no execution "${executionId}"`);
    return checkpoint.campaignId;
  }

  getExecution(executionId) {
    const execution = this.checkpoint.load(executionId);
    if (!execution) throw orcError(ORC_CODES.EXECUTION_NOT_FOUND, `no execution "${executionId}"`);
    const { _trace, ...rest } = execution;
    return rest;
  }

  getTrace(executionId) {
    const checkpoint = this.checkpoint.load(executionId);
    if (!checkpoint) throw orcError(ORC_CODES.EXECUTION_NOT_FOUND, `no execution "${executionId}"`);
    const collector = new TraceCollector({ root: this.root, executionId, campaignId: checkpoint.campaignId, businessId: checkpoint.businessId });
    return collector.assemble({ outcome: checkpoint.outcome, outputs: checkpoint.outputs });
  }

  listCampaigns() {
    if (!this.campaignsDir || !fs.existsSync(this.campaignsDir)) return [];
    return fs
      .readdirSync(this.campaignsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const c = readJson(path.join(this.campaignsDir, f), null);
        return c ? { campaignId: c.id, name: c.name, state: c.state, metrics: c.metrics, autonomyLevel: c.autonomyLevel } : null;
      })
      .filter(Boolean);
  }

  summary(campaignId) {
    const campaign = this.load(campaignId);
    if (!campaign) throw orcError(ORC_CODES.CAMPAIGN_NOT_FOUND, `no campaign "${campaignId}"`);
    return {
      campaignId: campaign.id,
      name: campaign.name,
      state: campaign.state,
      autonomyLevel: campaign.autonomyLevel,
      metrics: campaign.metrics,
      budget: campaign.budget,
      executions: (campaign.executions || []).map((e) => ({
        executionId: e.executionId,
        businessId: e.businessId,
        status: e.status,
        outcome: e.outcome
      })),
      queue: campaign.queue || [],
      timeline: campaign.timeline
    };
  }

  history() {
    const out = [];
    for (const c of this.listCampaigns()) {
      const full = this.load(c.campaignId);
      for (const e of full.executions || []) {
        out.push({ campaignId: c.campaignId, ...e });
      }
    }
    return out;
  }
}

function applyCampaignTransitionSafe(campaign, event) {
  const row = campaign.state;
  if (!['DRAFT', 'QUEUED', 'RUNNING', 'PAUSED', 'DRAINING'].includes(row)) return false;
  try {
    applyCampaignTransition(campaign, event);
    return true;
  } catch {
    return false;
  }
}

export function createCampaignManager(opts = {}) {
  return new CampaignManager(opts);
}
