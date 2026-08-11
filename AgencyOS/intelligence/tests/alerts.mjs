import fs from 'node:fs';
import path from 'node:path';
import { makeT, makeEngine, makeBus, emitFixtureEvents, fixedClock, FIXED_NOW, INT_ROOT } from './helpers.mjs';
import { MetricStore } from '../stores/metrics.js';
import { AlertStore } from '../stores/alerts.js';
import { IncidentStore } from '../stores/incidents.js';
import { alertIdFor } from '../ids.js';
import { alertsJob } from '../jobs/alerts.js';

const t = makeT('intelligence/tests/alerts.mjs');
const BASE = path.join('C:/Users/kh/AppData/Local/Temp/opencode', 'int-alerts-' + Date.now());
fs.mkdirSync(BASE, { recursive: true });

t.section('rule validation at engine load');
{
  const { IntelligenceEngine, INT_CODES } = await import('../index.js');
  const rulesFile = path.join(BASE, 'bad-rules.json');
  fs.writeFileSync(rulesFile, JSON.stringify({ rules: [{ ruleId: 'r1', severity: 'warning', enabled: true, metric: 'agency.unknownMetric' }] }, null, 2));
  let threw = false;
  try {
    new IntelligenceEngine({ root: INT_ROOT, alertsFile: rulesFile, storageRoot: path.join(BASE, 'bad') });
  } catch (err) {
    threw = true;
    t.assert(err.code === INT_CODES.INVALID_ALERT_RULE, 'unknown metric key rejected with INVALID_ALERT_RULE', err.message);
  }
  t.assert(threw, 'engine refuses rules referencing unknown metrics');
  const badKind = path.join(BASE, 'bad-kind.json');
  fs.writeFileSync(badKind, JSON.stringify({ rules: [{ ruleId: 'r2', severity: 'warning', enabled: true, kind: 'ghost_kind' }] }, null, 2));
  threw = false;
  try {
    new IntelligenceEngine({ root: INT_ROOT, alertsFile: badKind, storageRoot: path.join(BASE, 'bad-kind-store') });
  } catch (err) {
    threw = true;
    t.assert(err.code === INT_CODES.INVALID_ALERT_RULE, 'unknown incident kind rejected', err.message);
  }
  t.assert(threw, 'engine refuses rules referencing unknown incident kinds');
}

t.section('metric rule evaluation: activation + dedupe by (rule, scope, window)');
{
  const metrics = new MetricStore({ root: path.join(BASE, 'm1'), registry: ['execution.failed', 'execution.succeeded'], derived: ['agency.failureRatePct'] });
  const alerts = new AlertStore({ root: path.join(BASE, 'a1'), clock: fixedClock() });
  const incidents = new IncidentStore({ root: path.join(BASE, 'i1'), clock: fixedClock() });
  const rules = [{ ruleId: 'r-failure', metric: 'agency.failureRatePct', op: 'gt', threshold: 50, windowMs: 86400000, severity: 'critical', minSamples: 3, cooldownMs: 0, scopeType: 'agency', enabled: true }];
  const job = alertsJob({ metrics, incidents, alerts, rules, config: { alerts: { windowMs: 86400000, minSamples: 1, cooldownMs: 0 } } });
  const point = (metric, value, id) => ({ schema: 'https://agency.os/intelligence/metric-point', ts: '2026-08-11T08:00:00.000Z', metric, value, kind: 'counter', scope: { type: 'execution', id: `ex-${id}` }, source: { type: 'event', event: 'x', eventId: `evt-000000000000000${id}` } });

  for (let i = 1; i <= 3; i++) metrics.record(point('execution.failed', 1, i));
  metrics.record(point('execution.succeeded', 1, 9));

  const r1 = await job.run({ window: { start: '2026-08-11T09:00:00.000Z', end: '2026-08-11T10:00:00.000Z' }, now: '2026-08-11T10:00:00.000Z', ctx: null });
  t.assert(r1.activated === 1, 'failure-rate rule activates once', JSON.stringify(r1));
  const active = alerts.list({ status: 'active' });
  t.assert(active.length === 1, 'one active alert');
  t.assert(active[0].alertId === alertIdFor('r-failure', 'agency', 'agency', '2026-08-11T00:00:00.000Z'), 'alertId deterministic per (rule, scope, day window)', active[0].alertId);
  t.assert(active[0].triggeredBy.value === 75, 'triggered value = 75 (3 failed / 4 total)', JSON.stringify(active[0].triggeredBy));
  t.assert(active[0].triggeredBy.samples === 4, 'agency rule aggregated points across scopes');
  t.assert(active[0].severity === 'critical', 'severity carried from rule');

  const r2 = await job.run({ window: { start: '2026-08-11T09:00:00.000Z', end: '2026-08-11T10:00:00.000Z' }, now: '2026-08-11T10:00:00.000Z', ctx: null });
  t.assert(r2.activated === 0, 're-evaluation does not duplicate the alert');
  t.assert(alerts.list({ status: 'active' }).length === 1, 'still exactly one active alert');
}

t.section('cooldown gates reactivation');
{
  const metrics = new MetricStore({ root: path.join(BASE, 'm2'), registry: ['budget.burnPerHour'], derived: [] });
  const alerts = new AlertStore({ root: path.join(BASE, 'a2'), clock: fixedClock() });
  const incidents = new IncidentStore({ root: path.join(BASE, 'i2'), clock: fixedClock() });
  const rules = [{ ruleId: 'r-burn', metric: 'budget.burnPerHour', op: 'gt', threshold: 8, windowMs: 3600000, severity: 'warning', minSamples: 1, cooldownMs: 3600000, scopeType: 'campaign', enabled: true }];
  const job = alertsJob({ metrics, incidents, alerts, rules, config: { alerts: { windowMs: 3600000, minSamples: 1, cooldownMs: 3600000 } } });
  const rec = (ts) => ({ schema: 'https://agency.os/intelligence/metric-point', ts, metric: 'budget.burnPerHour', value: 12, kind: 'gauge', scope: { type: 'campaign', id: 'camp-1' }, source: { type: 'record', recordId: `budget-job:camp-1:${ts}` } });
  metrics.record(rec('2026-08-11T09:00:00.000Z'));
  metrics.record(rec('2026-08-11T10:00:00.000Z'));

  const r1 = await job.run({ window: { start: '2026-08-11T09:00:00.000Z', end: '2026-08-11T10:00:00.000Z' }, now: '2026-08-11T10:00:00.000Z', ctx: null });
  t.assert(r1.activated === 1, 'burn rule activates on first evaluation');

  const r2 = await job.run({ window: { start: '2026-08-11T10:00:00.000Z', end: '2026-08-11T11:00:00.000Z' }, now: '2026-08-11T11:00:00.000Z', ctx: null });
  t.assert(r2.activated === 0, 'cooldown suppresses reactivation within cooldownMs');
  t.assert(alerts.list({ status: 'active' }).length === 1, 'original alert still active');
}

t.section('recovery resolves active alerts');
{
  const metrics = new MetricStore({ root: path.join(BASE, 'm3'), registry: ['execution.failed', 'execution.succeeded'], derived: ['agency.failureRatePct'] });
  const alerts = new AlertStore({ root: path.join(BASE, 'a3'), clock: fixedClock() });
  const incidents = new IncidentStore({ root: path.join(BASE, 'i3'), clock: fixedClock() });
  const rules = [{ ruleId: 'r-failure', metric: 'agency.failureRatePct', op: 'gt', threshold: 50, windowMs: 86400000, severity: 'critical', minSamples: 1, cooldownMs: 0, scopeType: 'agency', enabled: true }];
  const job = alertsJob({ metrics, incidents, alerts, rules, config: { alerts: { windowMs: 86400000, minSamples: 1, cooldownMs: 0 } } });
  metrics.record({ schema: 'https://agency.os/intelligence/metric-point', ts: '2026-08-11T08:00:00.000Z', metric: 'execution.failed', value: 1, kind: 'counter', scope: { type: 'execution', id: 'ex-1' }, source: { type: 'event', event: 'x', eventId: 'evt-0000000000000001' } });
  await job.run({ window: { start: '2026-08-11T09:00:00.000Z', end: '2026-08-11T10:00:00.000Z' }, now: '2026-08-11T10:00:00.000Z', ctx: null });
  t.assert(alerts.list({ status: 'active' }).length === 1, 'activated');

  // Next day: no points in the window → insufficient samples → resolution.
  const r = await job.run({ window: { start: '2026-08-12T09:00:00.000Z', end: '2026-08-12T10:00:00.000Z' }, now: '2026-08-12T10:00:00.000Z', ctx: null });
  t.assert(r.resolved === 1, 'recovery resolves the alert', JSON.stringify(r));
  t.assert(alerts.list({ status: 'active' }).length === 0, 'no active alerts remain');
  const resolved = alerts.list({ status: 'resolved' });
  t.assert(resolved.length === 1 && resolved[0].resolutionNote, 'resolved record kept with note');
  const history = alerts.history();
  t.assert(history.some((h) => h.event === 'activated') && history.some((h) => h.event === 'resolved'), 'alert history append-only with lifecycle events');
}

t.section('minSamples gates evaluation');
{
  const metrics = new MetricStore({ root: path.join(BASE, 'm4'), registry: ['execution.failed', 'execution.succeeded'], derived: ['agency.failureRatePct'] });
  const alerts = new AlertStore({ root: path.join(BASE, 'a4'), clock: fixedClock() });
  const incidents = new IncidentStore({ root: path.join(BASE, 'i4'), clock: fixedClock() });
  const rules = [{ ruleId: 'r-failure', metric: 'agency.failureRatePct', op: 'gt', threshold: 50, windowMs: 86400000, severity: 'critical', minSamples: 5, cooldownMs: 0, scopeType: 'agency', enabled: true }];
  const job = alertsJob({ metrics, incidents, alerts, rules, config: { alerts: { windowMs: 86400000, minSamples: 1, cooldownMs: 0 } } });
  metrics.record({ schema: 'https://agency.os/intelligence/metric-point', ts: '2026-08-11T08:00:00.000Z', metric: 'execution.failed', value: 1, kind: 'counter', scope: { type: 'execution', id: 'ex-1' }, source: { type: 'event', event: 'x', eventId: 'evt-0000000000000001' } });
  const r = await job.run({ window: { start: '2026-08-11T09:00:00.000Z', end: '2026-08-11T10:00:00.000Z' }, now: '2026-08-11T10:00:00.000Z', ctx: null });
  t.assert(r.activated === 0, 'below minSamples → no activation');
}

t.section('kind rules mirror incidents');
{
  const incidents = new IncidentStore({ root: path.join(BASE, 'i5'), clock: fixedClock() });
  const alerts = new AlertStore({ root: path.join(BASE, 'a5'), clock: fixedClock() });
  const metrics = new MetricStore({ root: path.join(BASE, 'm5'), registry: [], derived: [] });
  incidents.upsert({ scope: { type: 'campaign', id: 'camp-1' }, kind: 'limits_reached', severity: 'warning', subject: 'limits' });
  const rules = [{ ruleId: 'r-limits', kind: 'limits_reached', severity: 'warning', enabled: true }];
  const job = alertsJob({ metrics, incidents, alerts, rules, config: { alerts: {} } });
  const r = await job.run({ window: { start: '2026-08-11T09:00:00.000Z', end: '2026-08-11T10:00:00.000Z' }, now: '2026-08-11T10:00:00.000Z', ctx: null });
  t.assert(r.activated === 1, 'open incident of matching kind activates alert', JSON.stringify(r));
  const active = alerts.list({ status: 'active' });
  t.assert(active.length === 1 && active[0].triggeredBy.incidentId, 'alert carries incident reference', JSON.stringify(active[0].triggeredBy));
  t.assert(active[0].alertId === alertIdFor('r-limits', 'campaign', 'camp-1', incidents.get(active[0].triggeredBy.incidentKey).openedAt), 'kind alert id deterministic per incident');
  incidents.resolve({ key: active[0].triggeredBy.incidentKey, by: 'job', note: 'cleared' });
  const r2 = await job.run({ window: { start: '2026-08-11T10:00:00.000Z', end: '2026-08-11T11:00:00.000Z' }, now: '2026-08-11T11:00:00.000Z', ctx: null });
  t.assert(r2.resolved === 1, 'resolved incident resolves its alert');
}

t.section('end-to-end via engine fixture (no false positives)');
{
  const bus = makeBus();
  const { engine } = await makeEngine({ base: path.join(BASE, 'e2e'), bus, clock: fixedClock() });
  engine.start();
  emitFixtureEvents(bus);
  const results = await engine.runJobs({ now: FIXED_NOW });
  engine.stop();
  const alerts = engine.alerts.list();
  t.assert(results.some((r) => r.name === 'intelligence:alerts' && r.windows === 48), 'alerts job ran the full backfill');
  t.assert(alerts.length === 0, 'fixture produces no spurious alerts', JSON.stringify(alerts));
  const incidents = engine.incidents.list();
  t.assert(incidents.length >= 2, 'incidents pipeline fed the alert job', `incidents=${incidents.length}`);
  const snapshot = engine.snapshot();
  t.assert(snapshot.incidents.open === 0, 'fixture incidents resolved by recovery sweep');
  t.assert(snapshot.insights.total >= 20, 'insights produced across jobs', `insights=${snapshot.insights.total}`);
}

t.summary();
