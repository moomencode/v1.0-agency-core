import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { materializeVersion } from '../../decision-engine/index.js';

export const INT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS_FILE = JSON.parse(fs.readFileSync(path.join(INT_ROOT, '..', 'policies', 'defaults.json'), 'utf8'));
const DEFAULT_STRATEGIES_FILE = JSON.parse(fs.readFileSync(path.join(INT_ROOT, '..', 'strategy', 'strategies', 'default.json'), 'utf8'));
const STRICT_FILE = JSON.parse(fs.readFileSync(path.join(INT_ROOT, 'config', 'experiments', 'policy-sets', 'strict.json'), 'utf8'));

// 4.7.1 version identities: pure functions of the applied document sets, so
// brain stamps, fixture records and experiment registries agree.
export const DEFAULT_POLICY_SET = { version: DEFAULTS_FILE.version || 1, policies: DEFAULTS_FILE.policies };
export const DEFAULT_STRATEGY_SET = { version: DEFAULT_STRATEGIES_FILE.version || 1, strategies: DEFAULT_STRATEGIES_FILE.strategies };
export const STRICT_POLICY_SET = { version: STRICT_FILE.version || 1, policies: STRICT_FILE.policies };
export const DEFAULT_POLICY_VERSION = materializeVersion(DEFAULT_POLICY_SET);
export const DEFAULT_STRATEGY_VERSION = materializeVersion(DEFAULT_STRATEGY_SET);
export const STRICT_POLICY_VERSION = materializeVersion(STRICT_POLICY_SET);

// Discovery record shape the context engine builds from (opportunity 70: fits
// the default baseline but fails the strict fixture set's minOpportunity 95).
export function recordFor({ businessId = 'biz-1', name = 'Fixture Business', category = 'restaurant', opportunity = 70, reviews = 25 } = {}) {
  return {
    id: businessId,
    name,
    category,
    website: { exists: false },
    scores: { opportunity: { value: opportunity }, business: { value: 62 } },
    reviews,
    rating: 4.2,
    phone: '0512000001',
    email: `${businessId}@example.test`,
    closed: false,
    duplicate: false,
    premiumWebsite: false
  };
}

// Mini test runner (mirrors the style used across AgencyOS suites).
export function makeT(name) {
  let passed = 0;
  let failed = 0;
  const failures = [];
  const t = {
    assert(cond, label, extra = '') {
      if (cond) {
        passed++;
        console.log(`PASS ${label}`);
      } else {
        failed++;
        failures.push(`${label} ${extra}`);
        console.log(`FAIL ${label} ${extra}`);
      }
    },
    section(label) {
      console.log(`== ${label}`);
    },
    summary() {
      console.log(`\n${name}: ${passed} passed, ${failed} failed`);
      if (failed > 0) process.exitCode = 1;
      return { passed, failed, failures };
    }
  };
  return t;
}

// Build the engine against a fixture storage layout. Storage is isolated per
// suite via the storageRoot override.
export async function makeEngine({ base, bus = null, clock = fixedClock(), artifacts = null, vault = null, scheduler = null, storageRoot = null, timeOffsetMs = 0 }) {
  const fixture = writeFixtureStorage(base, { timeOffsetMs });
  const { createIntelligence } = await import('../index.js');
  const engine = createIntelligence({
    root: INT_ROOT,
    bus,
    clock,
    artifacts,
    vault,
    scheduler,
    orchestratorRoot: fixture.orchestratorRoot,
    deliveryRoot: fixture.deliveryRoot,
    schedulerBaseDir: fixture.schedulerBaseDir,
    killswitchRoot: fixture.orchestratorRoot,
    storageRoot: storageRoot || path.join(base, 'intel-storage')
  });
  return { engine, fixture };
}

// Fixed fixtures for the intelligence suites: a deterministic simulated
// campaign (6 businesses, fixed outcomes), matching delivery records and
// scheduler history, a fixed event stream and a fixed clock. Mirrors the
// orchestrator fixture style (orchestrator/tests/helpers.mjs).

export const FIXED_NOW = '2026-08-11T10:00:00.000Z';
export const CAMPAIGN_ID = 'camp-1';
export const CAMPAIGN_NAME = 'fixture-cairo';
export const BUSINESS_IDS = ['biz-1', 'biz-2', 'biz-3', 'biz-4', 'biz-5', 'biz-6'];
export const EXECUTION_IDS = ['ex-1', 'ex-2', 'ex-3', 'ex-4', 'ex-5', 'ex-6'];
export const DELIVERY_IDS = ['del-1', 'del-2', 'del-3', 'del-4', 'del-5', 'del-6'];

export function fixedClock(iso = FIXED_NOW) {
  return { now: () => new Date(iso) };
}

export function makeBus() {
  const handlers = {};
  return {
    handlers,
    on(ev, handler) {
      (handlers[ev] = handlers[ev] || []).push(handler);
      return this;
    },
    off(ev, handler) {
      handlers[ev] = (handlers[ev] || []).filter((h) => h !== handler);
      return this;
    },
    emit(ev, record) {
      for (const handler of handlers[ev] || []) {
        try {
          handler(record);
        } catch {
          /* producers must never be broken by listeners */
        }
      }
      return this;
    },
    listeners(ev) {
      return (handlers[ev] || []).length;
    }
  };
}

export function campaignRecord({ createdAt = '2026-08-10T08:00:00.000Z', state = 'COMPLETED', timeOffsetMs = 0 } = {}) {
  const shift = (iso) => new Date(Date.parse(iso) + timeOffsetMs).toISOString();
  return {
    schema: 'https://agency.os/orchestrator/campaign',
    id: CAMPAIGN_ID,
    name: CAMPAIGN_NAME,
    specCanonical: { autonomyLevel: 'L4', limits: { maxBusinesses: 6, maxDeployments: 6, maxAiCalls: 20, maxProviderCalls: 20, maxRetries: 2, maxExecutionDurationMs: 120000, maxCampaignDurationMs: 600000 } },
    autonomyLevel: 'L4',
    state,
    workflowVersion: 2,
    policyVersionRef: { policyVersion: DEFAULT_POLICY_VERSION, strategyVersion: DEFAULT_STRATEGY_VERSION },
    budget: {
      limits: { maxBusinesses: 6, maxDeployments: 6, maxAiCalls: 20, maxProviderCalls: 20, maxRetries: 2 },
      counters: { businesses: 6, deployments: 5, aiCalls: 14, providerCalls: 12, retries: 2, steps: 24 },
      startedAt: shift(createdAt),
      reached: []
    },
    metrics: {
      discovered: 6, qualified: 6, filtered: 0, approved: 4, rejected: 1, escalated: 1,
      generated: 4, deployed: 4, failed: 0, archived: 0, executed: 6, waiting: 0
    },
    executions: [
      { executionId: 'ex-1', businessId: 'biz-1', status: 'DEPLOYED', outcome: { verdict: 'APPROVED', reason: 'fits-fit' }, startedAt: shift('2026-08-10T08:01:00.000Z') },
      { executionId: 'ex-2', businessId: 'biz-2', status: 'DEPLOYED', outcome: { verdict: 'APPROVED', reason: 'fits-fit' }, startedAt: shift('2026-08-10T08:03:00.000Z') },
      { executionId: 'ex-3', businessId: 'biz-3', status: 'DEPLOYED', outcome: { verdict: 'APPROVED', reason: 'fits-fit' }, startedAt: shift('2026-08-10T08:05:00.000Z') },
      { executionId: 'ex-4', businessId: 'biz-4', status: 'DEPLOYED', outcome: { verdict: 'APPROVED', reason: 'fits-fit' }, startedAt: shift('2026-08-10T08:07:00.000Z') },
      { executionId: 'ex-5', businessId: 'biz-5', status: 'REJECTED', outcome: { verdict: 'REJECTED', reason: 'low-fit-score' }, startedAt: shift('2026-08-10T08:09:00.000Z') },
      { executionId: 'ex-6', businessId: 'biz-6', status: 'ESCALATED', outcome: { verdict: 'ESCALATED', reason: 'approval-stale' }, startedAt: shift('2026-08-10T08:11:00.000Z') }
    ],
    timeline: [],
    createdAt: shift(createdAt),
    updatedAt: shift('2026-08-11T09:20:00.000Z')
  };
}

export function traceFor(executionId, businessId, { stepFail = false, timeOffsetMs = 0 } = {}) {
  const lines = [];
  const t0 = stepFail ? '2026-08-11T09:15:00.000Z' : '2026-08-10T08:00:00.000Z';
  const steps = ['research', 'generate', 'qa', 'deploy'];
  let at = Date.parse(t0) + timeOffsetMs;
  for (const step of steps) {
    lines.push({ step, at: new Date(at).toISOString(), detail: `${step} for ${businessId}`, durationMs: 500 });
    at += 12000;
    if (step === 'qa' && stepFail) {
      lines.push({ step: 'qa', at: new Date(at).toISOString(), detail: `retry ${businessId}`, durationMs: 400 });
      at += 12000;
    }
  }
  return lines;
}

export function deliveryRecord({ id, businessId, provider, status = 'verified', createdAt = '2026-08-10T08:30:00.000Z', dryRun = null, mode = 'full', rollbackOf = null, timeOffsetMs = 0 } = {}) {
  createdAt = new Date(Date.parse(createdAt) + timeOffsetMs).toISOString();
  const timeline = [];
  if (mode === 'dry-run' || dryRun) {
    timeline.push({ event: 'SIMULATED', from: 'packaged', to: 'simulated', at: createdAt, actor: 'system' });
  } else if (status === 'failed') {
    timeline.push({ event: 'DEPLOY_START', from: 'approved', to: 'deploying', at: createdAt, actor: 'manager' });
    timeline.push({ event: 'DEPLOY_FAIL', from: 'deploying', to: 'failed', at: createdAt, actor: 'provider' });
  } else {
    timeline.push({ event: 'DEPLOY_OK', from: 'approved', to: 'deployed', at: createdAt, actor: 'manager' });
    timeline.push({ event: 'VERIFY_OK', from: 'deployed', to: 'verified', at: createdAt, actor: 'manager' });
  }
  return {
    schema: 'https://agency.os/delivery/record',
    id,
    businessId,
    provider,
    mode,
    status,
    trace: { buildId: `bld-${id}`, pipelineRunId: `pp-${id}`, engineOutputChecksum: `sha256-${'0'.repeat(64)}`, buildId: `bld-${id}`, engineVersion: 'fixture' },
    target: { domain: `${businessId}.example.test` },
    package: { packageId: `bld-${id}`, bundleSha256: `sha256-${'1'.repeat(64)}`, fileCount: 3 },
    deployment: status === 'failed' ? null : { deploymentId: `dep-${id}`, url: `https://${businessId}.example.test`, provider },
    dryRun,
    approvals: [],
    rollbackOf,
    timeline,
    createdAt,
    updatedAt: createdAt
  };
}

export function schedulerHistoryFixture() {
  const run = (jobId, i, status, attempt = 1) => ({
    id: `${jobId}-run-${i}`,
    jobId,
    runNumber: i,
    attempt,
    status,
    trigger: 'cron',
    startedAt: new Date(Date.parse('2026-08-10T08:00:00.000Z') + i * 3600000).toISOString(),
    finishedAt: null,
    durationMs: status === 'failed' ? 1500 : 220,
    error: status === 'failed' ? `fixture failure ${i}` : null
  });
  return {
    'intelligence:funnel': [run('intelligence:funnel', 1, 'succeeded'), run('intelligence:funnel', 2, 'succeeded')],
    'intelligence:reliability': [run('intelligence:reliability', 1, 'succeeded'), run('intelligence:reliability', 2, 'failed'), run('intelligence:reliability', 3, 'succeeded', 2)],
    'intelligence:alerts': [run('intelligence:alerts', 1, 'failed'), run('intelligence:alerts', 2, 'succeeded', 2)],
    'intelligence:durations': [run('intelligence:durations', 1, 'succeeded')]
  };
}

// Full fixture storage layout: orchestrator-engine (campaign + instances),
// delivery records, scheduler files — everything under `base`.
export function writeFixtureStorage(base, { timeOffsetMs = 0 } = {}) {
  const orch = path.join(base, 'storage', 'orchestrator-engine');
  const campaigns = path.join(orch, 'campaigns');
  const instances = path.join(orch, 'instances');
  const delivery = path.join(base, 'storage', 'delivery', 'records');
  const scheduler = path.join(base, 'storage', 'scheduler');
  for (const dir of [campaigns, delivery, scheduler]) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(campaigns, `${CAMPAIGN_ID}.json`), JSON.stringify(campaignRecord({ timeOffsetMs }), null, 2));

  const delivered = { 'ex-1': 'biz-1', 'ex-2': 'biz-2', 'ex-3': 'biz-3', 'ex-4': 'biz-4' };
  const stepFail = { 'ex-6': true };
  for (const executionId of EXECUTION_IDS) {
    const dir = path.join(instances, executionId);
    fs.mkdirSync(dir, { recursive: true });
    const businessId = delivered[executionId] || (executionId === 'ex-5' ? 'biz-5' : 'biz-6');
    const isDeployed = Boolean(delivered[executionId]);
    fs.writeFileSync(path.join(dir, 'record.json'), JSON.stringify(recordFor({ businessId, name: `${businessId} fixture business` }), null, 2));
    fs.writeFileSync(path.join(dir, 'decision.json'), JSON.stringify({
      schema: 'https://agency.os/orchestrator/decision',
      executionId,
      campaignId: CAMPAIGN_ID,
      businessId,
      verdict: isDeployed ? 'APPROVED' : executionId === 'ex-5' ? 'REJECTED' : 'ESCALATED',
      reason: isDeployed ? 'fits-fit' : executionId === 'ex-5' ? 'low-fit-score' : 'approval-stale',
      confidence: isDeployed ? 0.9 : 0.4,
      strategyId: 'fixture-strategy',
      policySummary: { verdict: 'pass' },
      policyVersion: DEFAULT_POLICY_VERSION,
      strategyVersion: DEFAULT_STRATEGY_VERSION,
      createdAt: new Date(Date.parse('2026-08-10T08:00:00.000Z') + timeOffsetMs).toISOString()
    }, null, 2));
    fs.writeFileSync(path.join(dir, 'trace.ndjson'), traceFor(executionId, businessId, { stepFail: stepFail[executionId], timeOffsetMs }).map((l) => JSON.stringify(l)).join('\n'));
    fs.writeFileSync(path.join(dir, 'execution-report.json'), JSON.stringify({
      schema: 'https://agency.os/orchestrator/execution-report',
      executionId,
      campaignId: CAMPAIGN_ID,
      businessId,
      status: isDeployed ? 'DEPLOYED' : executionId === 'ex-5' ? 'REJECTED' : 'ESCALATED',
      outcome: { verdict: isDeployed ? 'APPROVED' : executionId === 'ex-5' ? 'REJECTED' : 'ESCALATED', reason: isDeployed ? 'fits-fit' : executionId === 'ex-5' ? 'low-fit-score' : 'approval-stale' },
      approvals: [],
      generatedAt: new Date(Date.parse('2026-08-11T09:20:00.000Z') + timeOffsetMs).toISOString()
    }, null, 2));
  }

  const records = [
    deliveryRecord({ id: 'del-1', businessId: 'biz-1', provider: 'local', createdAt: '2026-08-10T08:30:00.000Z', timeOffsetMs }),
    deliveryRecord({ id: 'del-2', businessId: 'biz-2', provider: 'local', createdAt: '2026-08-10T08:32:00.000Z', timeOffsetMs }),
    deliveryRecord({ id: 'del-3', businessId: 'biz-3', provider: 'vercel', createdAt: '2026-08-10T08:34:00.000Z', timeOffsetMs }),
    deliveryRecord({ id: 'del-4', businessId: 'biz-4', provider: 'vercel', createdAt: '2026-08-10T08:36:00.000Z', timeOffsetMs }),
    deliveryRecord({ id: 'del-5', businessId: 'biz-5', provider: 'vercel', status: 'failed', createdAt: '2026-08-10T08:38:00.000Z', timeOffsetMs }),
    deliveryRecord({ id: 'del-6', businessId: 'biz-6', provider: 'local', mode: 'dry-run', dryRun: { steps: ['checksum', 'simulation'], status: 'simulated' }, createdAt: '2026-08-10T08:40:00.000Z', timeOffsetMs })
  ];
  for (const record of records) fs.writeFileSync(path.join(delivery, `${record.id}.json`), JSON.stringify(record, null, 2));

  fs.writeFileSync(path.join(scheduler, '_history.json'), JSON.stringify(schedulerHistoryFixture(), null, 2));
  fs.writeFileSync(path.join(scheduler, '_jobs.json'), JSON.stringify([
    { id: 'intelligence:funnel', name: 'funnel', handler: 'intelligence:funnel' },
    { id: 'intelligence:reliability', name: 'reliability', handler: 'intelligence:reliability' },
    { id: 'intelligence:alerts', name: 'alerts', handler: 'intelligence:alerts' }
  ], null, 2));

  return { orchestratorRoot: orch, deliveryRoot: base, schedulerBaseDir: scheduler, base };
}

// Deterministic event stream for the fixture. `offset` shifts the timestamps
// so suites can exercise different windows without changing the shape.
export function fixtureEvents({ offsetMs = 0 } = {}) {
  const at = (iso) => new Date(Date.parse(iso) + offsetMs).toISOString();
  const ev = (event, ts, meta = {}) => ({ event, ts: at(ts), module: event.split('.')[0] === 'orchestrator' ? 'orchestrator' : event.split('.')[0], ...meta });
  const events = [];
  const push = (event, ts, meta) => events.push(ev(event, ts, meta));
  const campaignId = CAMPAIGN_ID;

  push('orchestrator.campaign_started', '2026-08-10T08:00:00.000Z', { campaignId, name: CAMPAIGN_NAME });
  for (let i = 1; i <= 6; i++) push('brain.lead_discovered', '2026-08-10T08:00:10.000Z', { campaignId, businessId: `biz-${i}` });
  push('brain.strategy_selected', '2026-08-10T08:00:20.000Z', { campaignId, strategyId: 'fixture-strategy' });
  push('brain.plan_started', '2026-08-10T08:00:25.000Z', { campaignId });
  push('brain.plan_completed', '2026-08-10T08:00:30.000Z', { campaignId });
  const starts = { 'ex-1': 'biz-1', 'ex-2': 'biz-2', 'ex-3': 'biz-3', 'ex-4': 'biz-4', 'ex-5': 'biz-5', 'ex-6': 'biz-6' };
  let t = 1;
  for (const [executionId, businessId] of Object.entries(starts)) {
    const atIso = `2026-08-10T08:${String(t).padStart(2, '0')}:00.000Z`;
    push('orchestrator.execution_started', atIso, { campaignId, executionId, businessId });
    push('brain.decision_made', atIso, { campaignId, executionId, businessId, verdict: executionId === 'ex-5' ? 'REJECTED' : executionId === 'ex-6' ? 'ESCALATED' : 'APPROVED' });
    push('orchestrator.step_completed', atIso, { campaignId, executionId, step: 'research' });
    push('orchestrator.step_completed', atIso, { campaignId, executionId, step: 'generate' });
    if (executionId === 'ex-5') {
      push('orchestrator.denied', atIso, { campaignId, executionId, businessId, approvalId: `app-${executionId}` });
    } else if (executionId === 'ex-6') {
      push('orchestrator.approval_required', atIso, { campaignId, executionId, businessId, approvalId: `app-${executionId}` });
      push('orchestrator.denied', atIso, { campaignId, executionId, businessId, approvalId: `app-${executionId}` });
    } else {
      push('orchestrator.approved', atIso, { campaignId, executionId, businessId, approvalId: `app-${executionId}` });
    }
    t += 2;
  }
  // Deployments: ex-1..4 succeed, del-5 fails once then recovers (vercel).
  push('delivery.deployed', '2026-08-10T08:30:00.000Z', { recordId: 'del-1', businessId: 'biz-1', status: 'deployed' });
  push('delivery.deployed', '2026-08-10T08:32:00.000Z', { recordId: 'del-2', businessId: 'biz-2', status: 'deployed' });
  push('delivery.deployed', '2026-08-10T08:34:00.000Z', { recordId: 'del-3', businessId: 'biz-3', status: 'deployed' });
  push('delivery.deployed', '2026-08-10T08:36:00.000Z', { recordId: 'del-4', businessId: 'biz-4', status: 'deployed' });
  push('delivery.failed', '2026-08-10T08:38:00.000Z', { recordId: 'del-5', businessId: 'biz-5', status: 'failed' });
  for (let i = 1; i <= 4; i++) push('orchestrator.deployed', `2026-08-10T08:4${i}:00.000Z`, { campaignId, executionId: `ex-${i}`, businessId: `biz-${i}` });
  push('orchestrator.campaign_completed', '2026-08-10T09:00:00.000Z', { campaignId });

  // Next-day recovery signals (same window hour 09:00-10:00 on 08-11).
  push('orchestrator.step_failed', '2026-08-11T09:15:00.000Z', { campaignId, executionId: 'ex-6', step: 'qa', error: 'transient fixture error' });
  push('orchestrator.step_completed', '2026-08-11T09:16:00.000Z', { campaignId, executionId: 'ex-6', step: 'qa' });
  push('delivery.failed', '2026-08-11T09:17:00.000Z', { recordId: 'del-5', businessId: 'biz-5', status: 'failed' });
  push('delivery.deployed', '2026-08-11T09:18:00.000Z', { recordId: 'del-5', businessId: 'biz-5', status: 'deployed' });
  push('scheduler.job_started', '2026-08-11T09:30:00.000Z', { jobId: 'intelligence:funnel' });
  push('scheduler.job_succeeded', '2026-08-11T09:31:00.000Z', { jobId: 'intelligence:funnel' });
  return events;
}

export function emitFixtureEvents(bus, { offsetMs = 0 } = {}) {
  for (const record of fixtureEvents({ offsetMs })) bus.emit(record.event, record);
  return bus;
}
