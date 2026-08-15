import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeT, makeEngine, FIXED_NOW, emitFixtureEvents, makeBus } from './helpers.mjs';

const BASE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'var', 'tmp', 'intel-backfill');
fs.rmSync(BASE, { recursive: true, force: true });

const t = makeT('intelligence/backfill');

// scheduler_stats backfills need history data; funnel reads events/metrics. A
// plain fixture engine with the emitted bus events is enough for both.
const bus = makeBus();
const { engine } = await makeEngine({ base: BASE, bus, storageRoot: path.join(BASE, 'intel-storage') });
emitFixtureEvents(bus, {});
await engine.runJobs({ now: FIXED_NOW });
engine.ctx.metrics = engine.metrics;

t.section('explicit backfill over a completed range');
const from = '2026-08-09T00:00:00.000Z';
const to = '2026-08-11T00:00:00.000Z';
const first = await engine.backfill({ from, to, now: FIXED_NOW, jobs: ['intelligence:scheduler_stats'], maxWindows: 10 });
t.assert(first.windows === 2, 'two daily windows processed', String(first.windows));
t.assert(/^[0-9a-f]{16}$/.test(first.rangeKey), 'rangeKey deterministic');

t.section('resume is a no-op (idempotent)');
const second = await engine.backfill({ from, to, now: FIXED_NOW, jobs: ['intelligence:scheduler_stats'], maxWindows: 10 });
t.assert(second.windows === 0, 'already-completed range reprocesses nothing', String(second.windows));

t.section('partial resume after an abort');
const killFile = path.join(engine.framework.killswitchRoot, 'EMERGENCY_STOP');
const resumeFrom = '2026-08-08T00:00:00.000Z';
const resumeTo = '2026-08-10T00:00:00.000Z';
let aborted = null;
try {
  fs.writeFileSync(killFile, 'stop');
  aborted = await engine.backfill({ from: resumeFrom, to: resumeTo, now: FIXED_NOW, jobs: ['intelligence:funnel'], maxWindows: 10 });
} finally {
  fs.rmSync(killFile, { force: true });
}
t.assert(aborted && aborted.aborted === true, 'killswitch aborts the remainder of the range');
const marker = JSON.parse(fs.readFileSync(path.join(engine.framework.dir, 'intelligence_backfill.json'), 'utf8'));
t.assert(marker.status === 'aborted', 'marker persists aborted status');

t.section('re-run after removal of the aborted marker processes the full range');
fs.rmSync(path.join(engine.framework.dir, 'intelligence_backfill.json'), { force: true });
const resumed = await engine.backfill({ from: resumeFrom, to: resumeTo, now: FIXED_NOW, jobs: ['intelligence:funnel'], maxWindows: 10 });
t.assert(resumed.windows === 2 && resumed.aborted === undefined, 'full range completed without killswitch', String(resumed.windows));

t.section('future windows are never processed');
const future = await engine.backfill({ from: '2026-08-12T00:00:00.000Z', to: '2026-08-16T00:00:00.000Z', now: FIXED_NOW, jobs: ['intelligence:scheduler_stats'], maxWindows: 10 });
t.assert(future.windows === 0, 'no windows past "now"', String(future.windows));

t.section('argument validation');
let threw = null;
try {
  await engine.backfill({ from: to, to: from, now: FIXED_NOW });
} catch (err) {
  threw = err;
}
t.assert(threw && threw.code === 'INT_INVALID_CONFIG', 'from >= to rejected');
threw = null;
try {
  await engine.backfill({ from: '2026-08-01T00:00:00.000Z', to: '2026-08-05T00:00:00.000Z', jobs: ['intelligence:ghost'], now: FIXED_NOW });
} catch (err) {
  threw = err;
}
t.assert(threw && threw.code === 'INT_UNKNOWN_JOB', 'unknown job rejected');

t.section('insights recompute-over-write');
const insights = engine.insights.list('scheduler_stats');
t.assert(insights.length >= 2, 'backfilled scheduler_stats insights persisted', String(insights.length));
t.assert([...new Set(insights.map((i) => i.window.start))].length === insights.length, 'distinct windows only');

const total = t.summary();
await engine.stop?.();
if (total.failed > 0) process.exit(1);