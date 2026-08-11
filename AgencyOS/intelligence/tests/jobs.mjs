import fs from 'node:fs';
import path from 'node:path';
import { makeT, makeEngine, makeBus, emitFixtureEvents, fixedClock, FIXED_NOW, CAMPAIGN_ID } from './helpers.mjs';

const t = makeT('intelligence/tests/jobs.mjs');
const BASE = path.join('C:/Users/kh/AppData/Local/Temp/opencode', 'int-jobs-' + Date.now());

// The fixture stream is shifted +3h so it lands inside every job's backfill
// window (24h for hourly jobs) while record times (traces, campaign, delivery
// records) are shifted identically via timeOffsetMs.
const OFFSET_MS = 3 * 3600000;
const Wd = { start: '2026-08-10T00:00:00.000Z', end: '2026-08-11T00:00:00.000Z' };
const Wh = { start: '2026-08-10T11:00:00.000Z', end: '2026-08-10T12:00:00.000Z' };

const bus = makeBus();
const { engine, fixture } = await makeEngine({ base: BASE, bus, clock: fixedClock(), timeOffsetMs: OFFSET_MS });
engine.start();
emitFixtureEvents(bus, { offsetMs: OFFSET_MS });
const res = await engine.runJobs({ now: FIXED_NOW });
engine.stop();

t.section('window processing');
{
  const byName = Object.fromEntries(res.map((r) => [r.name, r]));
  t.assert(byName['intelligence:funnel'].windows === 4, 'funnel processes 4 day windows', JSON.stringify(byName['intelligence:funnel']));
  t.assert(byName['intelligence:reliability'].windows === 24, 'reliability processes 24 hourly windows');
  t.assert(byName['intelligence:durations'].windows === 24, 'durations processes 24 hourly windows');
  t.assert(byName['intelligence:providers'].windows === 7, 'providers processes 7 day windows');
  t.assert(byName['intelligence:budget'].windows === 24, 'budget processes 24 hourly windows');
  t.assert(byName['intelligence:scheduler_stats'].windows === 7, 'scheduler_stats processes 7 day windows');
  t.assert(byName['intelligence:incidents'].windows === 48, 'incidents scans 48 hourly windows');
  t.assert(byName['intelligence:alerts'].windows === 48, 'alerts scans 48 hourly windows');
  t.assert(res.every((r) => !r.aborted), 'no job aborted');
}

t.section('funnel golden values (day window 08-10)');
{
  const agency = engine.insights.get('funnel', 'agency', 'agency', Wd);
  t.assert(Boolean(agency), 'agency funnel rollup exists for the day window');
  t.assert(agency.data.discovered === 6, 'discovered = 6', JSON.stringify(agency.data));
  t.assert(agency.data.qualified === 6, 'qualified = 6');
  t.assert(agency.data.approved === 4, 'approved = 4');
  t.assert(agency.data.deployed === 4, 'deployed = 4');
  t.assert(agency.data.delivered === 4, 'delivered = 4 (deployed executions with verified delivery records)');
  t.assert(agency.data.rejected === 1, 'rejected = 1');
  t.assert(agency.data.escalated === 1, 'escalated = 1');
  t.assert(agency.data.rates.approvedPct === 66.67, 'approvedPct = 66.67', String(agency.data.rates.approvedPct));
  t.assert(agency.data.rates.deliveredPct === 100, 'deliveredPct = 100');
  const campaign = engine.insights.get('funnel', 'campaign', CAMPAIGN_ID, Wd);
  t.assert(Boolean(campaign), 'per-campaign funnel insight exists for the day window');
  t.assert(campaign.data.rates.approvedPct === 66.67, 'campaign approvedPct = 66.67');
  t.assert(campaign.data.deniedReasons['low-fit-score'] === 1, 'denied reasons broken down');
  t.assert(campaign.data.escalationReasons['approval-stale'] === 1, 'escalation reasons broken down');
}

t.section('reliability golden values (hour window 11:00)');
{
  const agency = engine.insights.get('reliability', 'agency', 'agency', Wh);
  t.assert(Boolean(agency), 'reliability agency insight exists for the shifted stream window');
  t.assert(agency.data.counts.executions.started === 6, 'executions started = 6', JSON.stringify(agency.data.counts));
  t.assert(agency.data.counts.executions.succeeded === 4, 'executions succeeded = 4');
  t.assert(agency.data.counts.delivery.deployed === 8, 'delivery.deployed = 8 (4 orchestrator + 4 delivery events)');
  t.assert(agency.data.counts.delivery.failed === 1, 'delivery.failed = 1');
  t.assert(agency.data.counts.steps.completed === 12, 'steps completed = 12');
  t.assert(agency.data.rates.failureRatePct === 0, 'failureRatePct = 0 (no failed executions)', JSON.stringify(agency.data.rates));
  t.assert(agency.data.rates.successRatePct === 66.67, 'successRatePct = 66.67');
  t.assert(Array.isArray(agency.data.topSteps), 'topSteps breakdown present');
  t.assert(agency.summary === '4/6 executions succeeded (66.67%)', 'summary matches', agency.summary);
  const aggKey = engine.metrics.aggregateKey({ kind: 'reliability', metric: 'agency.failureRatePct', value: 0, samples: 0, scope: { type: 'agency', id: 'agency' }, window: Wh });
  const agg = engine.metrics.getAggregate(aggKey);
  t.assert(Boolean(agg), 'reliability aggregate stored for the window');
  t.assert(agg.samples === 6, 'aggregate samples = 6');
  t.assert(agg.kind === 'reliability', 'aggregate kind = reliability');
  t.assert(engine.metrics.listAggregates().length === 24, 'one aggregate per hourly window', String(engine.metrics.listAggregates().length));
}

t.section('durations golden values (traces shifted into 11:00 window)');
{
  const insight = engine.insights.get('durations', 'agency', 'agency', Wh);
  t.assert(Boolean(insight), 'durations insight exists for the shifted trace window');
  t.assert(insight.data.executions.n === 5, '5 executions aggregated (ex-1..ex-5)', JSON.stringify(insight.data.executions));
  t.assert(insight.data.executions.p50Ms === 36000, 'e2e p50 = 36000ms (4 steps x 12s)');
  t.assert(insight.data.steps['research']?.n === 5, 'per-step buckets aggregated');
  const stepPoints = engine.metrics.readPoints({ metric: 'step.durationMs' });
  t.assert(stepPoints.length >= 4, 'step.durationMs points recorded by the job', `points=${stepPoints.length}`);
  t.assert(stepPoints.every((p) => p.value === 500), 'step durations equal trace durationMs (500ms)');
}

t.section('providers golden values (day window 08-10)');
{
  const agency = engine.insights.get('provider_reliability', 'agency', 'agency', Wd);
  t.assert(Boolean(agency), 'provider agency rollup exists');
  t.assert(agency.data.attempts === 6, 'attempts = 6 (4 verified + 1 failed + 1 dry-run)', JSON.stringify(agency.data));
  t.assert(agency.data.failures === 1, 'failures = 1 (del-5 failed)');
  t.assert(agency.data.dryRuns === 1, 'dryRuns = 1 (del-6)');
  t.assert(agency.data.verified === 5, 'verified = 5 (del-1..4 + del-6 simulated)', String(agency.data.verified));
  const vercel = engine.insights.get('provider_reliability', 'provider', 'vercel', Wd);
  t.assert(Boolean(vercel), 'per-provider insight for vercel exists');
  t.assert(vercel.data.attempts === 3, 'vercel attempts = 3 (del-3, del-4, del-5)');
  t.assert(vercel.data.failures === 1, 'vercel failures = 1');
  const verify = engine.metrics.readPoints({ metric: 'provider.verifyDurationMs' });
  t.assert(verify.length >= 1, 'provider.verifyDurationMs points recorded');
  const attempts = engine.metrics.readPoints({ metric: 'provider.attempts' });
  t.assert(attempts.length >= 1, 'provider.attempts points recorded by the job (single writer)');
}

t.section('budget golden values (campaign in 11:00 window)');
{
  const insight = engine.insights.get('budget_burn', 'campaign', CAMPAIGN_ID, Wh);
  t.assert(Boolean(insight), 'budget_burn insight exists for the shifted window');
  const d = insight.data;
  t.assert(d.perLimit.maxBusinesses.utilizationPct === 100, 'maxBusinesses utilization 100% (6/6)', JSON.stringify(d.perLimit.maxBusinesses));
  t.assert(d.perLimit.maxDeployments.utilizationPct === 83.33, 'maxDeployments utilization 83.33% (5/6)');
  t.assert(d.perLimit.maxRetries.utilizationPct === 100, 'maxRetries utilization 100% (2/2)');
  t.assert(d.remainingPct === 0, 'remainingPct = 0 (a limit is exhausted)');
  t.assert(d.burnPerHour === 39, 'burnPerHour = 39 units in 1 elapsed hour', String(d.burnPerHour));
  t.assert(d.elapsedHours === 1, 'elapsedHours = 1 (window end - budget startedAt)');
  const points = engine.metrics.readPoints({ metric: 'budget.utilizationPct', scopeType: 'campaign' });
  t.assert(points.length >= 1, 'budget.utilizationPct recorded');
}

t.section('scheduler_stats golden values (day window 08-10)');
{
  const insight = engine.insights.get('scheduler_stats', 'agency', 'agency', Wd);
  t.assert(Boolean(insight), 'scheduler_stats insight exists');
  t.assert(insight.data.totals.runs === 8, 'scheduler history runs aggregated', `runs=${insight.data.totals.runs}`);
  t.assert(insight.data.totals.succeeded === 6, 'succeeded = 6');
  t.assert(insight.data.totals.failed === 2, 'failed = 2 (reliability#2, alerts#1)');
  t.assert(insight.data.jobs['intelligence:reliability'].successRatePct === 66.67, 'per-job success rate computed');
  const points = engine.metrics.readPoints({ metric: 'scheduler.jobsSucceeded' });
  t.assert(points.length >= 1, 'scheduler.jobsSucceeded recorded by job (single writer)');
  const failed = engine.metrics.readPoints({ metric: 'scheduler.jobsFailed' });
  t.assert(failed.some((p) => p.value === 2), 'scheduler.jobsFailed carries the failure count');
}

t.section('recompute idempotent (byte-stable overwrite)');
{
  const insight = engine.insights.get('funnel', 'agency', 'agency', Wd);
  const file = engine.insights.pathFor(insight);
  const before = fs.readFileSync(file, 'utf8');
  const r = await engine.recomputeInsight('funnel', { window: Wd, now: FIXED_NOW });
  t.assert(r.windows === 1, 'recompute processes exactly one window', JSON.stringify(r));
  const after = fs.readFileSync(file, 'utf8');
  t.assert(before === after, 'recompute overwrites the identical bytes');
  const again = await engine.recomputeInsight('funnel', { window: Wd, now: FIXED_NOW });
  t.assert(again.windows === 1, 'recompute is repeatable');
  t.assert(engine.insights.get('funnel', 'agency', 'agency', Wd).insightId === insight.insightId, 'insightId deterministic');
}

t.section('marker crash recovery');
{
  const marker = engine.framework.markerFile('intelligence:funnel');
  const before = JSON.parse(fs.readFileSync(marker, 'utf8'));
  fs.rmSync(marker, { force: true });
  const r = await engine.runJob('intelligence:funnel', { now: FIXED_NOW });
  t.assert(r.windows === 4, 'deleted marker → full day-window backfill re-runs', JSON.stringify(r));
  const marker2 = JSON.parse(fs.readFileSync(marker, 'utf8'));
  t.assert(marker2.status === 'completed', 'marker rewritten as completed');
  t.assert(marker2.lastWindowEnd === before.lastWindowEnd, 'marker resumes from the same end', `${marker2.lastWindowEnd} vs ${before.lastWindowEnd}`);
}

t.section('window bounds');
{
  const r = await engine.runJob('intelligence:alerts', { now: FIXED_NOW });
  t.assert(r.windows === 0, 'no new windows after up-to-date marker', JSON.stringify(r));
}

t.section('killswitch abort');
{
  const killFile = path.join(fixture.orchestratorRoot, 'EMERGENCY_STOP');
  fs.writeFileSync(killFile, 'stop');
  const marker = engine.framework.markerFile('intelligence:durations');
  fs.rmSync(marker, { force: true });
  const r = await engine.runJob('intelligence:durations', { now: FIXED_NOW });
  t.assert(r.aborted === true, 'job aborts when killswitch is armed', JSON.stringify(r));
  fs.rmSync(killFile, { force: true });
  const r2 = await engine.runJob('intelligence:durations', { now: FIXED_NOW });
  t.assert(r2.windows >= 1, 'job runs again after killswitch cleared', JSON.stringify(r2));
  const marker2 = JSON.parse(fs.readFileSync(marker, 'utf8'));
  t.assert(marker2.status === 'completed', 'marker rewritten after recovery');
}

t.summary();
