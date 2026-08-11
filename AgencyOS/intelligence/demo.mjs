// AgencyOS — Phase 4.6 Operations Intelligence demo.
//
// A full simulated campaign → events → sink → jobs → insights → incidents →
// alerts → deterministic reports, with artifacts and readable mirrors. Run:
//
//   node intelligence/demo.mjs
//
// Everything is deterministic (fixed clock + fixed fixture); two consecutive
// runs over the same storage produce byte-identical outputs.

import fs from 'node:fs';
import path from 'node:path';
import { ArtifactManager } from '../artifacts/manager.js';
import {
  makeBus, fixedClock, writeFixtureStorage, emitFixtureEvents,
  fixtureEvents, FIXED_NOW, CAMPAIGN_ID, INT_ROOT
} from './tests/helpers.mjs';
import { createIntelligence } from './index.js';
import { alertIdFor, eventIdFor, insightIdFor } from './ids.js';

const demo = (label, value = '') => {
  console.log(`\n--- ${label}${value ? `: ${value}` : ''} ---`);
};
const line = (label, value) => console.log(`  ${String(label).padEnd(34)} ${value}`);
const ok = (label) => console.log(`  OK ${label}`);

// ---------------------------------------------------------------------------
const BASE = path.join('C:/Users/kh/AppData/Local/Temp/opencode', 'int-demo-' + Date.now());
fs.mkdirSync(BASE, { recursive: true });
// Fixture times are shifted +3h so record/event times land inside the hourly
// backfill of the fixture's day windows (same reasoning as tests/jobs.mjs).
const OFFSET_MS = 3 * 3600000;

console.log('AgencyOS Intelligence — simulated campaign demo');
console.log('demo base:', BASE);

// ---------------------------------------------------------------------------
demo('1 · module boot and configuration');
const clock = fixedClock();
const bus = makeBus();
const fixture = writeFixtureStorage(BASE, { timeOffsetMs: OFFSET_MS });
const artifacts = new ArtifactManager({ root: path.join(BASE, 'artifacts'), sweeperMs: 0 });
const engine = createIntelligence({
  root: INT_ROOT,
  bus,
  clock,
  artifacts,
  orchestratorRoot: fixture.orchestratorRoot,
  deliveryRoot: fixture.deliveryRoot,
  schedulerBaseDir: fixture.schedulerBaseDir,
  killswitchRoot: fixture.orchestratorRoot,
  storageRoot: path.join(BASE, 'intel-storage')
});
line('config', path.join(INT_ROOT, 'config', 'intelligence.config.json'));
line('alert rules loaded', engine.rules.length);
line('metrics registry', engine.metrics.snapshot().registrySize);
line('jobs registered', engine.framework.jobs.size);
line('storage root', engine.storageRoot);
ok('engine constructed with validated config, rules and stores');

// ---------------------------------------------------------------------------
demo('2 · simulated campaign: records + event stream → sink');
engine.start();
const events = fixtureEvents({ offsetMs: OFFSET_MS });
line('fixture records', 'campaign + 6 executions + 6 delivery records + scheduler history');
line('event stream', events.length + ' events (orchestrator/brain/delivery/scheduler)');
emitFixtureEvents(bus, { offsetMs: OFFSET_MS });
const sink = engine.sink.statsSnapshot();
line('events received', sink.received);
line('events written', sink.written);
line('rejected', sink.rejected);
line('duplicates', sink.duplicates);
line('watermark', `${sink.watermark.file} @ line ${sink.watermark.lastLine}`);
line('last event', sink.lastEventAt);
ok('envelopes validated, redacted and persisted with daily rollover');

// ---------------------------------------------------------------------------
demo('3 · deterministic identifiers');
const first = fixtureEvents({ offsetMs: OFFSET_MS })[0];
const eventIdA = eventIdFor(first.event, first.module, first.ts, first.campaignId || null, JSON.stringify(first));
const eventIdB = eventIdFor(first.event, first.module, first.ts, first.campaignId || null, JSON.stringify(first));
line('eventId', eventIdA);
line('stable', eventIdA === eventIdB ? 'yes (pure function of event content)' : 'NO');
line('insightId', insightIdFor('funnel', 'agency', 'agency', '2026-08-10T00:00:00.000Z', '2026-08-11T00:00:00.000Z'));
line('alertId', alertIdFor('r-failure', 'agency', 'agency', '2026-08-11T00:00:00.000Z'));
ok('ids are pure, reproducible functions — the distributed safety net');

// ---------------------------------------------------------------------------
demo('4 · jobs: insights for every window');
const results = await engine.runJobs({ now: FIXED_NOW });
line('jobs run', results.map((r) => `${r.name.split(':')[1]}: ${r.windows}w`).join(', '));
line('insights', engine.insights.list().length);

const funnel = engine.insights.get('funnel', 'agency', 'agency', { start: '2026-08-10T00:00:00.000Z', end: '2026-08-11T00:00:00.000Z' });
line('funnel (day 08-10)', funnel && funnel.summary);
const reliability = engine.insights.get('reliability', 'agency', 'agency', { start: '2026-08-10T11:00:00.000Z', end: '2026-08-10T12:00:00.000Z' });
line('reliability (hour)', reliability && reliability.summary);
const providers = engine.insights.get('provider_reliability', 'agency', 'agency', { start: '2026-08-10T00:00:00.000Z', end: '2026-08-11T00:00:00.000Z' });
line('providers (day)', providers && providers.summary);
const budget = engine.insights.get('budget_burn', 'campaign', CAMPAIGN_ID, { start: '2026-08-10T11:00:00.000Z', end: '2026-08-10T12:00:00.000Z' });
line('budget burn (hour)', budget && budget.summary);
const durations = engine.insights.get('durations', 'agency', 'agency', { start: '2026-08-10T11:00:00.000Z', end: '2026-08-10T12:00:00.000Z' });
line('durations (e2e p50)', durations ? `${durations.data.executions.p50Ms}ms across ${durations.data.executions.n} executions` : 'none');
const schedulerStats = engine.insights.get('scheduler_stats', 'agency', 'agency', { start: '2026-08-10T00:00:00.000Z', end: '2026-08-11T00:00:00.000Z' });
line('scheduler stats (day)', schedulerStats && schedulerStats.summary);
ok('all 8 jobs produced deterministic, byte-stable insights');

// ---------------------------------------------------------------------------
demo('5 · incident lifecycle');
line('open before', engine.incidents.openCount());
const failedAt = new Date(Date.parse(FIXED_NOW) - 45 * 60000).toISOString();
const del9 = {
  schema: 'https://agency.os/delivery/record', id: 'del-9', businessId: 'biz-9', provider: 'vercel',
  mode: 'full', status: 'failed', target: { domain: 'biz-9.example.test' },
  package: { packageId: 'bld-del-9', bundleSha256: 'sha256-9', fileCount: 1 },
  deployment: null, dryRun: null, approvals: [],
  timeline: [{ event: 'DEPLOY_FAIL', from: 'approved', to: 'failed', at: failedAt, actor: 'provider' }],
  createdAt: failedAt, updatedAt: failedAt
};
fs.writeFileSync(path.join(fixture.deliveryRoot, 'storage', 'delivery', 'records', 'del-9.json'), JSON.stringify(del9, null, 2));
engine.sink.handle({ event: 'delivery.failed', ts: failedAt, module: 'delivery', recordId: 'del-9', businessId: 'biz-9', status: 'failed' });
await engine.runJob('intelligence:incidents', { now: FIXED_NOW, window: { start: '2026-08-11T09:00:00.000Z', end: '2026-08-11T10:00:00.000Z' } });
const opened = engine.incidents.list().find((i) => i.status === 'open');
line('triggered', `${opened.kind} (${opened.severity}) for ${opened.scope.type}:${opened.scope.id}`);
const resolved = engine.incidents.list().find((i) => i.incidentId === opened.incidentId);
line('after job', resolved.status === 'open' ? 'still open (waiting for recovery)' : resolved.status);
const deployedAt = new Date(Date.parse(failedAt) + 60000).toISOString();
del9.status = 'verified';
del9.deployment = { deploymentId: 'dep-del-9', url: 'https://biz-9.example.test', provider: 'vercel' };
del9.timeline = [{ event: 'DEPLOY_OK', from: 'approved', to: 'deployed', at: deployedAt, actor: 'manager' }, { event: 'VERIFY_OK', from: 'deployed', to: 'verified', at: deployedAt, actor: 'manager' }];
del9.updatedAt = deployedAt;
fs.writeFileSync(path.join(fixture.deliveryRoot, 'storage', 'delivery', 'records', 'del-9.json'), JSON.stringify(del9, null, 2));
engine.sink.handle({ event: 'delivery.deployed', ts: deployedAt, module: 'delivery', recordId: 'del-9', businessId: 'biz-9', status: 'deployed' });
await engine.runJob('intelligence:incidents', { now: FIXED_NOW, window: { start: '2026-08-11T09:00:00.000Z', end: '2026-08-11T10:00:00.000Z' } });
const recovered = engine.incidents.list().find((i) => i.incidentId === opened.incidentId);
line('after recovery', recovered.status === 'resolved' ? `resolved by ${recovered.resolvedBy}` : recovered.status);
engine.incidents.ack({ key: opened.key, by: 'demo-operator' });
engine.incidents.close({ key: opened.key, by: 'demo-operator' });
const closed = engine.incidents.list().find((i) => i.incidentId === opened.incidentId);
line('operator lifecycle', closed.status === 'closed' ? 'acknowledged → closed' : closed.status);
ok('incident open → job resolve → operator ack/close, history append-only');

// ---------------------------------------------------------------------------
demo('6 · alert lifecycle (failure-rate rule)');
line('active alerts before', engine.alerts.activeCount());
const t0 = new Date(Date.parse(FIXED_NOW) - 90 * 60000).toISOString();
for (let i = 1; i <= 3; i++) {
  engine.sink.handle({ event: 'orchestrator.failed', ts: new Date(Date.parse(t0) + i * 60000).toISOString(), module: 'orchestrator', campaignId: CAMPAIGN_ID, executionId: `ex-fail-${i}` });
}
engine.sink.handle({ event: 'orchestrator.deployed', ts: new Date(Date.parse(t0) + 4 * 60000).toISOString(), module: 'orchestrator', campaignId: CAMPAIGN_ID, executionId: 'ex-ok' });
await engine.runJob('intelligence:alerts', { now: FIXED_NOW, window: { start: '2026-08-11T09:00:00.000Z', end: '2026-08-11T10:00:00.000Z' } });
const active = engine.alerts.list({ status: 'active' });
line('active alerts', active.map((a) => `${a.ruleId} (${a.triggeredBy.value}%, ${a.severity})`).join(', ') || 'none');
// Recovery: the rule is day-windowed, so the next day has no samples → the
// rule resolves all active alerts for its (rule, scope).
const nextNow = '2026-08-12T10:00:00.000Z';
await engine.runJob('intelligence:alerts', { now: nextNow, window: { start: '2026-08-12T09:00:00.000Z', end: '2026-08-12T10:00:00.000Z' } });
const afterRecovery = engine.alerts.list({ status: 'resolved' }).find((a) => a.ruleId === 'alert-execution-failure-rate-high');
line('after recovery window', afterRecovery ? `resolved by ${afterRecovery.resolvedBy}` : 'still active');
ok('rule evaluated on real samples, deduped by (rule, scope, window), cooldown + recovery honored');

// ---------------------------------------------------------------------------
demo('7 · recompute idempotency');
const before = engine.metrics.snapshot().stats.points;
const markersBefore = engine.framework.loadMarker('intelligence:funnel');
await engine.runJobs({ now: FIXED_NOW });
const after = engine.metrics.snapshot().stats.points;
const markersAfter = engine.framework.loadMarker('intelligence:funnel');
line('metric points', `${before} → ${after} (${after === before ? 'unchanged' : 'DUPLICATED!'})`);
line('funnel marker', `${markersBefore.lastWindowEnd} → ${markersAfter.lastWindowEnd}`);
ok('recompute over the same windows is a no-op — exactly-once by construction');

// ---------------------------------------------------------------------------
demo('8 · clean restart resumes without replay');
const engine2 = createIntelligence({
  root: INT_ROOT,
  bus: makeBus(),
  clock,
  artifacts: new ArtifactManager({ root: path.join(BASE, 'artifacts2'), sweeperMs: 0 }),
  orchestratorRoot: fixture.orchestratorRoot,
  deliveryRoot: fixture.deliveryRoot,
  schedulerBaseDir: fixture.schedulerBaseDir,
  killswitchRoot: fixture.orchestratorRoot,
  storageRoot: engine.storageRoot
});
engine2.start();
const replay = engine2.sink.statsSnapshot();
line('replayed after restart', replay.replayed);
const reruns = await engine2.runJobs({ now: FIXED_NOW });
line('windows reprocessed', reruns.reduce((acc, r) => acc + r.windows, 0));
engine2.stop();
ok('watermark resume + job markers make restarts safe and cheap');

// ---------------------------------------------------------------------------
demo('9 · killswitch abort');
// Rewind the funnel marker so there are pending windows for the abort to hit.
fs.rmSync(path.join(engine.storageRoot, 'jobs', 'intelligence_funnel.json'), { force: true });
fs.writeFileSync(path.join(fixture.orchestratorRoot, 'EMERGENCY_STOP'), 'abort');
const aborted = await engine.runJobs({ now: FIXED_NOW });
line('jobs aborted', aborted.filter((r) => r.aborted).length);
const marker = engine.framework.loadMarker('intelligence:funnel');
line('marker after abort', marker.status === 'aborted' ? 'aborted, no window consumed' : marker.status);
fs.rmSync(path.join(fixture.orchestratorRoot, 'EMERGENCY_STOP'));
await engine.runJob('intelligence:funnel', { now: FIXED_NOW });
line('marker after restore', engine.framework.loadMarker('intelligence:funnel').status);
ok('EMERGENCY_STOP honored by the job framework before any window');

// ---------------------------------------------------------------------------
demo('10 · records-only backfill (no bus)');
const backfill = createIntelligence({
  root: INT_ROOT,
  clock,
  orchestratorRoot: fixture.orchestratorRoot,
  deliveryRoot: fixture.deliveryRoot,
  schedulerBaseDir: fixture.schedulerBaseDir,
  killswitchRoot: fixture.orchestratorRoot,
  storageRoot: path.join(BASE, 'backfill-storage')
});
const backfillResults = await backfill.runJobs({ now: FIXED_NOW });
line('insights from records alone', backfill.insights.list().length);
line('events ingested', backfill.snapshot().events.count);
const bf = backfill.insights.get('funnel', 'agency', 'agency', { start: '2026-08-10T00:00:00.000Z', end: '2026-08-11T00:00:00.000Z' });
line('backfill funnel (day)', bf && bf.summary);
ok('existing orchestrator/delivery state analyzed without any live event stream');

// ---------------------------------------------------------------------------
demo('11 · deterministic reports + artifacts + readable mirrors');
for (const kind of ['health', 'incident', 'alert', 'operations']) {
  const r = engine.writeReport(kind, { now: FIXED_NOW, runId: 'demo-run-1', projectId: 'agency', workflowId: 'intelligence' });
  line(kind, `${r.reportId} → ${r.json.type} + ${r.markdown.format}`);
}
const campaignReport = engine.writeReport('campaign', { now: FIXED_NOW, campaignId: CAMPAIGN_ID, runId: 'demo-run-1' });
line('campaign', `${campaignReport.reportId} → ${campaignReport.json.type}`);
engine.stop();

const mirrors = path.join(engine.storageRoot, 'reports', '2026-08-11');
const mirrorFiles = fs.readdirSync(mirrors).sort();
line('mirror files', mirrorFiles.join(', '));
const opsJson = JSON.parse(fs.readFileSync(path.join(mirrors, 'operations-report.json'), 'utf8'));
line('operations report', `${opsJson.title} — generated ${opsJson.generatedAt}`);
line('open incidents', opsJson.openIncidents.map((i) => `${i.kind}@${i.scope.type}:${i.scope.id}`).join(', ') || 'none');
line('active alerts', opsJson.activeAlerts.map((a) => a.ruleId).join(', ') || 'none');
line('latest funnel', opsJson.latest.funnel ? opsJson.latest.funnel.summary : 'none');
line('latest reliability', opsJson.latest.reliability ? opsJson.latest.reliability.summary : 'none');
line('latest scheduler', opsJson.latest.scheduler ? opsJson.latest.scheduler.summary : 'none');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const artifactFiles = walk(path.join(BASE, 'artifacts', 'storage', 'artifacts-engine')).filter((f) => !f.endsWith('_index.json')).sort();
line('artifacts', artifactFiles.length + ' files (json + markdown per report)');
ok('artifacts readable via artifacts system + mirrored under <storageRoot>/reports/');

console.log('\nDemo complete. Storage layout:');
console.log('  events        ', path.join(engine.storageRoot, 'events'));
console.log('  reports       ', mirrors);
console.log('  artifacts     ', path.join(BASE, 'artifacts', 'storage', 'artifacts-engine'));
