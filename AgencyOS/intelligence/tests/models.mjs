import path from 'node:path';
import { Validator } from '../../runtime/validator.js';
import { makeT, INT_ROOT } from './helpers.mjs';
import { MetricStore } from '../stores/metrics.js';
import { eventIdFor, insightIdFor, pointIdFor, incidentKeyFor, alertIdFor, sha256, hex16, windowKeyFor } from '../ids.js';

const t = makeT('intelligence/tests/models.mjs');
const validator = new Validator({ schemasDir: path.join(INT_ROOT, 'schemas') });

const SCHEMAS = ['event-envelope', 'metric-point', 'incident', 'alert-rule', 'alert-record', 'insight', 'job-marker', 'observation', 'observation-batch', 'intelligence-config'];

const samples = {
  'event-envelope': {
    schema: 'https://agency.os/intelligence/event-envelope',
    ev: 'orchestrator.deployed',
    at: '2026-08-11T09:00:00.000Z',
    module: 'orchestrator',
    eventId: 'evt-0000000000000000',
    correlation: { campaignId: 'camp-1', executionId: 'ex-1' },
    payload: { status: 'deployed' }
  },
  'metric-point': {
    schema: 'https://agency.os/intelligence/metric-point',
    ts: '2026-08-11T09:00:00.000Z',
    metric: 'agency.deployed',
    value: 1,
    kind: 'counter',
    scope: { type: 'agency', id: 'agency' },
    source: { type: 'event', event: 'orchestrator.deployed', eventId: 'evt-0000000000000000' }
  },
  incident: {
    schema: 'https://agency.os/intelligence/incident',
    incidentId: 'inc-0000000000000000',
    key: 'inc-key-0000000000000000',
    kind: 'step_failed',
    severity: 'warning',
    status: 'open',
    scope: { type: 'execution', id: 'ex-1' },
    firstSeen: '2026-08-11T09:00:00.000Z',
    lastSeen: '2026-08-11T09:00:00.000Z',
    openedAt: '2026-08-11T09:00:00.000Z',
    acknowledgedAt: null,
    resolvedAt: null,
    count: 1,
    evidence: ['evt-0000000000000000'],
    detail: ''
  },
  'alert-rule': {
    ruleId: 'alert-success-rate-low',
    metric: 'agency.successRatePct',
    op: 'lt',
    threshold: 90,
    windowMs: 86400000,
    severity: 'warning',
    minSamples: 5,
    cooldownMs: 3600000,
    scopeType: 'agency',
    enabled: true,
    description: 'x'
  },
  'alert-record': {
    schema: 'https://agency.os/intelligence/alert-record',
    alertId: 'alr-0000000000000000',
    ruleId: 'alert-success-rate-low',
    severity: 'warning',
    status: 'active',
    triggeredAt: '2026-08-11T09:00:00.000Z',
    window: { start: '2026-08-10T09:00:00.000Z', end: '2026-08-11T09:00:00.000Z' },
    triggeredBy: { metric: 'agency.successRatePct', value: 87.5, threshold: 90, window: { start: '2026-08-10T09:00:00.000Z', end: '2026-08-11T09:00:00.000Z' } },
    scope: { type: 'agency', id: 'agency' }
  },
  insight: {
    schema: 'https://agency.os/intelligence/insight',
    insightId: 'ins-0000000000000000',
    kind: 'funnel',
    schemaVersion: 1,
    job: 'intelligence:funnel',
    scope: { type: 'campaign', id: 'camp-1' },
    window: { start: '2026-08-10T00:00:00.000Z', end: '2026-08-11T00:00:00.000Z' },
    computedAt: '2026-08-11T00:00:00.000Z',
    inputs: { campaignsRead: 1 },
    data: { discovered: 6 },
    summary: '6 discovered'
  },
  'job-marker': {
    schema: 'https://agency.os/intelligence/job-marker',
    jobId: 'intelligence:funnel',
    lastWindowStart: '2026-08-10T00:00:00.000Z',
    lastWindowEnd: '2026-08-11T00:00:00.000Z',
    status: 'completed',
    updatedAt: '2026-08-11T09:00:00.000Z'
  },
  observation: {
    schema: 'https://agency.os/intelligence/observation',
    observationId: 'obs-0000000000000000',
    batchId: 'batch-0000000000000000',
    kind: 'site_up',
    businessId: 'biz-1',
    executionId: 'ex-1',
    deliveryRecordId: 'del-1',
    at: '2026-08-11T09:00:00.000Z',
    importedAt: '2026-08-11T09:05:00.000Z',
    source: 'fixture',
    payload: { httpStatus: 200 },
    integrity: `sha256-${'0'.repeat(64)}`
  },
  'observation-batch': {
    schema: 'https://agency.os/intelligence/observation-batch',
    batchId: 'batch-0000000000000000',
    items: [{ schema: 'https://agency.os/intelligence/observation', observationId: 'obs-0000000000000000', batchId: 'batch-0000000000000000', kind: 'site_up', businessId: 'biz-1', at: '2026-08-11T09:00:00.000Z', importedAt: '2026-08-11T09:05:00.000Z', source: 'fixture', payload: {}, integrity: `sha256-${'0'.repeat(64)}` }],
    receipt: { accepted: 1, rejected: 0, duplicates: 0, reasons: [] }
  },
  'intelligence-config': {
    schema: 'https://agency.os/intelligence/config',
    version: 1,
    enabled: true,
    metrics: { registry: ['agency.discovered'], derived: ['agency.successRatePct'] }
  }
};

t.section('schema validation');
for (const name of SCHEMAS) {
  const schema = validator.loadFile(path.join(INT_ROOT, 'schemas', `${name}.schema.json`));
  const ok = validator.validate(samples[name], schema, { schemaPath: name });
  t.assert(ok.valid, `${name}: valid sample validates`, JSON.stringify(ok.errors.slice(0, 2)));
}
for (const [name, mutate] of [
  ['event-envelope', (s) => (s.eventId = 'not-an-id')],
  ['event-envelope', (s) => (s.at = 'yesterday')],
  ['metric-point', (s) => (s.kind = 'counterX')],
  ['metric-point', (s) => (s.scope.type = 'planet')],
  ['incident', (s) => (s.kind = 'zombie')],
  ['alert-rule', (s) => (s.op = 'between')],
  ['alert-rule', (s) => (s.severity = 'fatal')],
  ['alert-record', (s) => (s.alertId = 'alr-zz')],
  ['insight', (s) => (s.kind = 'nonsense')],
  ['job-marker', (s) => (s.status = 'banana')],
  ['observation', (s) => (s.kind = 'evil_kind')],
  ['observation', (s) => (s.integrity = 'md5:abc')],
  ['intelligence-config', (s) => (s.metrics = {})]
]) {
  const schema = validator.loadFile(path.join(INT_ROOT, 'schemas', `${name}.schema.json`));
  const broken = structuredClone(samples[name]);
  mutate(broken);
  const bad = validator.validate(broken, schema, { schemaPath: name });
  t.assert(!bad.valid, `${name}: mutated sample is rejected`);
}

t.section('metric registry');
{
  const store = new MetricStore({ root: 'C:/Users/kh/AppData/Local/Temp/opencode/models-metrics', registry: ['agency.deployed'], derived: ['agency.successRatePct'] });
  t.assert(store.isRegistered('agency.deployed'), 'registry key known');
  t.assert(store.isRegistered('agency.successRatePct'), 'derived key known');
  t.assert(!store.isRegistered('agency.typo'), 'unknown key not known');
  let threw = false;
  try {
    store.record({ schema: 'https://agency.os/intelligence/metric-point', ts: '2026-08-11T09:00:00.000Z', metric: 'agency.typo', value: 1, kind: 'counter', scope: { type: 'agency', id: 'agency' }, source: { type: 'import' } });
  } catch {
    threw = true;
  }
  t.assert(threw, 'unknown metric key hard-errors on record');
}

t.section('deterministic ids');
{
  const a = eventIdFor('orchestrator.deployed', 'orchestrator', '2026-08-11T09:00:00.000Z', { campaignId: 'c' }, {});
  const b = eventIdFor('orchestrator.deployed', 'orchestrator', '2026-08-11T09:00:00.000Z', { campaignId: 'c' }, {});
  const c = eventIdFor('orchestrator.failed', 'orchestrator', '2026-08-11T09:00:00.000Z', { campaignId: 'c' }, {});
  t.assert(a === b, 'same inputs → same eventId');
  t.assert(a !== c, 'different event names → different eventId');
  t.assert(/^evt-[0-9a-f]{16}$/.test(a), 'eventId shape');
  t.assert(/^ins-[0-9a-f]{16}$/.test(insightIdFor('funnel', 'agency', 'agency', '2026-08-10T00:00:00.000Z', '2026-08-11T00:00:00.000Z')), 'insightId shape');
  t.assert(/^mpt-[0-9a-f]{16}$/.test(pointIdFor(a, 'agency.deployed', 'agency', 'agency')), 'pointId shape');
  t.assert(/^inc-key-[0-9a-f]{16}$/.test(incidentKeyFor('execution', 'ex-1', 'step_failed', 'qa')), 'incident key shape');
  t.assert(/^alr-[0-9a-f]{16}$/.test(alertIdFor('r', 'agency', 'agency', '2026-08-10T00:00:00.000Z')), 'alertId shape');
  t.assert(hex16(sha256('x')).length === 16, 'hex16 truncates sha256');
  t.assert(windowKeyFor('reliability', 'agency', 'agency', 'a', 'b') === windowKeyFor('reliability', 'agency', 'agency', 'a', 'b'), 'windowKey deterministic');
}

t.summary();
