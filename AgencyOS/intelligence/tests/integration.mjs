import fs from 'node:fs';
import path from 'node:path';
import { makeT, makeEngine, makeBus, emitFixtureEvents, fixedClock, FIXED_NOW, INT_ROOT, CAMPAIGN_ID } from './helpers.mjs';

const t = makeT('intelligence/tests/integration.mjs');
const BASE = path.join('C:/Users/kh/AppData/Local/Temp/opencode', 'int-integration-' + Date.now());
fs.mkdirSync(BASE, { recursive: true });

const NEXT_DAY = '2026-08-12T10:00:00.000Z';
const DAY = 24 * 3600000;

t.section('full day cycle: day 1 ingest + analysis, day 2 advance');
{
  const bus1 = makeBus();
  const base = path.join(BASE, 'cycle');
  const { engine: day1, fixture } = await makeEngine({ base, bus: bus1, clock: fixedClock() });
  day1.start();
  emitFixtureEvents(bus1);
  await day1.runJobs({ now: FIXED_NOW });
  day1.stop();

  const day1Insights = day1.insights.list().length;
  t.assert(day1Insights >= 20, 'day 1 analysis complete', `insights=${day1Insights}`);
  const day1Sink = day1.snapshot().sink;
  t.assert(day1Sink.rejected === 0 && day1Sink.duplicates === 0, 'day 1 ingestion clean', JSON.stringify(day1Sink));

  // Day 2: a new campaign created on 08-11 joins the day-2 windows; same
  // storage, new clock → markers advance, new day windows computed.
  fs.writeFileSync(path.join(fixture.orchestratorRoot, 'campaigns', 'camp-2.json'), JSON.stringify({
    schema: 'https://agency.os/orchestrator/campaign',
    id: 'camp-2',
    name: 'fixture-lagos',
    specCanonical: { autonomyLevel: 'L4', limits: { maxBusinesses: 3, maxDeployments: 3 } },
    autonomyLevel: 'L4',
    state: 'RUNNING',
    workflowVersion: 2,
    budget: { limits: { maxBusinesses: 3, maxDeployments: 3 }, counters: { businesses: 1, deployments: 1 }, startedAt: '2026-08-11T08:00:00.000Z', reached: [] },
    metrics: { discovered: 1, qualified: 1, approved: 1, rejected: 0, escalated: 0, generated: 1, deployed: 1, executed: 1 },
    executions: [{ executionId: 'ex-d2', businessId: 'biz-d2', status: 'DEPLOYED', outcome: { verdict: 'APPROVED', reason: 'fits-fit' }, startedAt: '2026-08-11T08:01:00.000Z' }],
    timeline: [],
    createdAt: '2026-08-11T08:00:00.000Z',
    updatedAt: '2026-08-11T08:30:00.000Z'
  }, null, 2));
  const { createIntelligence } = await import('../index.js');
  const bus2 = makeBus();
  const day2 = createIntelligence({
    root: INT_ROOT,
    bus: bus2,
    clock: fixedClock(NEXT_DAY),
    orchestratorRoot: fixture.orchestratorRoot,
    deliveryRoot: fixture.deliveryRoot,
    schedulerBaseDir: fixture.schedulerBaseDir,
    killswitchRoot: fixture.orchestratorRoot,
    storageRoot: day1.storageRoot
  });
  day2.start();
  emitFixtureEvents(bus2, { offsetMs: DAY });
  await day2.runJobs({ now: NEXT_DAY });
  day2.stop();

  const markers = day2.framework.loadMarker('intelligence:funnel');
  t.assert(markers.lastWindowEnd === '2026-08-12T00:00:00.000Z', 'funnel marker advanced to day 2', JSON.stringify(markers));
  const day2Funnel = day2.insights.get('funnel', 'campaign', 'camp-2', { start: '2026-08-11T00:00:00.000Z', end: '2026-08-12T00:00:00.000Z' });
  t.assert(Boolean(day2Funnel), 'day 2 funnel insight computed for the new campaign');
  t.assert(day2Funnel.data.discovered === 1 && day2Funnel.data.delivered === 0, 'day 2 funnel reflects the new campaign', JSON.stringify(day2Funnel.data));
  const day1Funnel = day2.insights.get('funnel', 'campaign', CAMPAIGN_ID, { start: '2026-08-10T00:00:00.000Z', end: '2026-08-11T00:00:00.000Z' });
  t.assert(Boolean(day1Funnel) && day1Funnel.data.delivered === 4, 'day 1 insight intact after day 2 run');
  t.assert(day2.insights.list().length > day1Insights, 'insight set grew', `${day1Insights} → ${day2.insights.list().length}`);
  const replayStats = day2.snapshot().sink;
  t.assert(replayStats.replayed === 0, 'clean restart replays nothing', JSON.stringify(replayStats));
}

t.section('incident lifecycle end-to-end');
{
  const bus = makeBus();
  const { engine } = await makeEngine({ base: path.join(BASE, 'inc-life'), bus, clock: fixedClock() });
  engine.start();
  emitFixtureEvents(bus);
  await engine.runJobs({ now: FIXED_NOW });

  const W = { start: '2026-08-11T09:00:00.000Z', end: '2026-08-11T10:00:00.000Z' };
  bus.emit('orchestrator.failed', { event: 'orchestrator.failed', ts: '2026-08-11T09:40:00.000Z', module: 'orchestrator', campaignId: CAMPAIGN_ID, executionId: 'ex-7', detail: { error: 'injected failure' } });
  await engine.runJob('intelligence:incidents', { window: W, now: FIXED_NOW });
  const opened = engine.incidents.list().find((i) => i.scope.type === 'execution' && i.scope.id === 'ex-7');
  t.assert(Boolean(opened), 'failed execution triggers incident');
  t.assert(opened.kind === 'step_failed' && opened.severity === 'critical' && opened.status === 'open', 'critical + open', JSON.stringify(opened && { kind: opened.kind, severity: opened.severity, status: opened.status }));

  bus.emit('orchestrator.deployed', { event: 'orchestrator.deployed', ts: '2026-08-11T09:41:00.000Z', module: 'orchestrator', campaignId: CAMPAIGN_ID, executionId: 'ex-7' });
  await engine.runJob('intelligence:incidents', { window: W, now: FIXED_NOW });
  const after = engine.incidents.list().find((i) => i.scope.type === 'execution' && i.scope.id === 'ex-7');
  t.assert(after.status === 'resolved', 'deployed event resolves the incident', after.status);
  t.assert(after.resolvedBy === 'job', 'resolved by the job');

  // Ack + close flow via the store.
  engine.incidents.ack({ key: after.key, by: 'operator' });
  engine.incidents.close({ key: after.key, by: 'operator', note: 'postmortem' });
  t.assert(engine.incidents.get(after.key).status === 'closed', 'operator lifecycle completes');
  engine.stop();
}

t.section('alert lifecycle end-to-end');
{
  const bus = makeBus();
  const { engine } = await makeEngine({ base: path.join(BASE, 'alert-life'), bus, clock: fixedClock() });
  engine.start();
  emitFixtureEvents(bus);
  await engine.runJobs({ now: FIXED_NOW });

  // Inject failures → agency.failureRatePct 75% (3 failed + 1 succeeded in the
  // evaluation day window [08-11T00:00, 08-12T00:00)) → rule activates.
  for (let i = 0; i < 3; i++) {
    bus.emit('orchestrator.failed', { event: 'orchestrator.failed', ts: '2026-08-11T09:40:00.000Z', module: 'orchestrator', campaignId: CAMPAIGN_ID, executionId: `injected-${i}` });
  }
  bus.emit('orchestrator.deployed', { event: 'orchestrator.deployed', ts: '2026-08-11T09:41:00.000Z', module: 'orchestrator', campaignId: CAMPAIGN_ID, executionId: 'injected-ok' });
  await engine.runJob('intelligence:alerts', { window: { start: '2026-08-11T09:00:00.000Z', end: '2026-08-11T10:00:00.000Z' }, now: FIXED_NOW });
  const active = engine.alerts.list({ status: 'active' });
  const failureAlert = active.find((a) => a.ruleId === 'alert-execution-failure-rate-high');
  t.assert(Boolean(failureAlert), 'failure-rate rule activates from injected events', JSON.stringify(active.map((a) => a.ruleId)));
  t.assert(failureAlert.triggeredBy.value === 75, 'triggered value 75%', JSON.stringify(failureAlert.triggeredBy));

  // Next day: no samples → alert resolves.
  const NEXT_NOW = '2026-08-12T10:00:00.000Z';
  await engine.runJob('intelligence:alerts', { window: { start: '2026-08-12T09:00:00.000Z', end: '2026-08-12T10:00:00.000Z' }, now: NEXT_NOW });
  t.assert(engine.alerts.list({ status: 'active' }).length === 0, 'alert resolved on recovery');
  const resolved = engine.alerts.list({ status: 'resolved' }).find((a) => a.ruleId === 'alert-execution-failure-rate-high');
  t.assert(Boolean(resolved) && resolved.resolvedBy === 'job', 'resolution recorded');
  engine.stop();
}

t.section('restart over existing storage is stable');
{
  const bus = makeBus();
  const base = path.join(BASE, 'restart');
  const { engine: first } = await makeEngine({ base, bus, clock: fixedClock() });
  first.start();
  emitFixtureEvents(bus);
  await first.runJobs({ now: FIXED_NOW });
  const points = first.metrics.snapshot().stats.points;
  const incidents = first.incidents.list().length;
  first.stop();

  const { createIntelligence } = await import('../index.js');
  const second = createIntelligence({
    root: INT_ROOT,
    bus: makeBus(),
    clock: fixedClock(),
    orchestratorRoot: path.join(base, 'storage', 'orchestrator-engine'),
    deliveryRoot: base,
    schedulerBaseDir: path.join(base, 'storage', 'scheduler'),
    killswitchRoot: path.join(base, 'storage', 'orchestrator-engine'),
    storageRoot: first.storageRoot
  });
  second.start();
  const results = await second.runJobs({ now: FIXED_NOW });
  second.stop();
  t.assert(results.every((r) => r.windows === 0), 'no windows re-processed after restart');
  const onDisk = first.metrics.readPoints().length;
  const afterDisk = second.metrics.readPoints().length;
  t.assert(afterDisk === onDisk, 'no point duplication across restart', `${onDisk} → ${afterDisk}`);
  t.assert(second.metrics.snapshot().stats.points === 0, 'no points re-recorded in the second process');
  t.assert(second.incidents.list().length === incidents, 'incidents stable across restart');
  t.assert(second.snapshot().sink.replayed === 0, 'replay no-op after clean stop');
}

t.section('engine without bus works over records only');
{
  const { engine } = await makeEngine({ base: path.join(BASE, 'nobus'), clock: fixedClock() });
  const results = await engine.runJobs({ now: FIXED_NOW });
  t.assert(results.length === 8, 'all jobs registered');
  const funnel = engine.insights.get('funnel', 'agency', 'agency', { start: '2026-08-10T00:00:00.000Z', end: '2026-08-11T00:00:00.000Z' });
  t.assert(Boolean(funnel) && funnel.data.delivered === 4, 'record-based jobs produce insights without events');
  const rel = engine.insights.get('reliability', 'agency', 'agency', { start: '2026-08-10T10:00:00.000Z', end: '2026-08-10T11:00:00.000Z' });
  t.assert(Boolean(rel) && rel.data.counts.executions.started === 0, 'event-based jobs are empty without a bus');
  t.assert(engine.snapshot().events.count === 0, 'no events ingested');
}

t.section('health surface');
{
  const bus = makeBus();
  const { engine } = await makeEngine({ base: path.join(BASE, 'health'), bus, clock: fixedClock() });
  engine.start();
  emitFixtureEvents(bus);
  await engine.runJobs({ now: FIXED_NOW });
  const health = engine.health();
  t.assert(health.module === 'intelligence', 'module name');
  t.assert(health.healthy === true, 'healthy with clean sink', JSON.stringify(health.sink));
  t.assert(health.sink.written >= 20, 'sink written', `written=${health.sink.written}`);
  t.assert(Object.keys(health.markers).length === 8, 'marker ages for all jobs');
  t.assert(Object.values(health.markers).every((m) => m && m.status === 'completed' && m.ageMs === 0), 'markers fresh (fixed clock)');
  t.assert(typeof health.stores.storageBytes === 'number' && health.stores.storageBytes > 0, 'store sizes reported');
  engine.stop();
}

t.summary();
