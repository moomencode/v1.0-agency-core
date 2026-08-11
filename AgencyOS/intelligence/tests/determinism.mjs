import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { makeT, makeEngine, makeBus, emitFixtureEvents, fixedClock, FIXED_NOW } from './helpers.mjs';
import { stableStringify } from '../../runtime/utils.js';

const t = makeT('intelligence/tests/determinism.mjs');
const BASE = path.join('C:/Users/kh/AppData/Local/Temp/opencode', 'int-determinism-' + Date.now());
fs.mkdirSync(BASE, { recursive: true });

function tree(root) {
  const out = {};
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const key = path.join(rel, entry.name);
      if (entry.isDirectory()) walk(full, key);
      else out[key] = createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  };
  walk(root, '');
  return out;
}

function assertSameTree(ta, a, b, label) {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  ta.assert(stableStringify(keysA) === stableStringify(keysB), `${label}: same file set`, `A=${keysA.length} B=${keysB.length}`);
  const diffs = [];
  for (const key of keysA) if (a[key] !== b[key]) diffs.push(key);
  ta.assert(diffs.length === 0, `${label}: every file byte-identical`, `diffs=${diffs.slice(0, 5).join(', ')}`);
}

t.section('full pipeline is byte-reproducible across runs');
{
  async function runOnce(tag) {
    const base = path.join(BASE, tag);
    const bus = makeBus();
    const { engine } = await makeEngine({ base, bus, clock: fixedClock() });
    engine.start();
    emitFixtureEvents(bus);
    await engine.runJobs({ now: FIXED_NOW });
    engine.stop();
    const report = engine.buildReport('operations', { now: FIXED_NOW });
    return { engine, report, storage: engine.storageRoot };
  }
  const a = await runOnce('a');
  const b = await runOnce('b');

  const treeA = tree(a.storage);
  const treeB = tree(b.storage);
  assertSameTree(t, treeA, treeB, 'pipeline');

  const sa = a.engine.snapshot();
  const sb = b.engine.snapshot();
  t.assert(stableStringify(sa.sink) === stableStringify(sb.sink), 'sink stats identical', JSON.stringify(sa.sink));
  t.assert(sa.metrics.stats.points === sb.metrics.stats.points, 'metric point counts identical');
  t.assert(stableStringify(sa.insights) === stableStringify(sb.insights), 'insight summary identical');
  t.assert(stableStringify(a.report.data) === stableStringify(b.report.data), 'reports identical');
}

t.section('sink ingestion is deterministic (same events, same envelopes, same points)');
{
  async function ingestOnce(tag) {
    const bus = makeBus();
    const { engine } = await makeEngine({ base: path.join(BASE, tag), bus, clock: fixedClock() });
    engine.start();
    emitFixtureEvents(bus);
    engine.stop();
    return { engine, storage: engine.storageRoot };
  }
  const a = await ingestOnce('c');
  const b = await ingestOnce('d');
  const treeA = tree(a.storage);
  const treeB = tree(b.storage);
  assertSameTree(t, treeA, treeB, 'sink');
  t.assert(a.engine.snapshot().sink.written === b.engine.snapshot().sink.written, 'same envelopes written');
  t.assert(a.engine.snapshot().sink.duplicates === b.engine.snapshot().sink.duplicates, 'same duplicate counts');
}

t.section('eventId/insightId/alertId are pure functions');
{
  const { eventIdFor, insightIdFor, alertIdFor } = await import('../ids.js');
  const e = eventIdFor('orchestrator.deployed', 'orchestrator', '2026-08-11T09:00:00.000Z', { campaignId: 'camp-1' }, {});
  t.assert(e === eventIdFor('orchestrator.deployed', 'orchestrator', '2026-08-11T09:00:00.000Z', { campaignId: 'camp-1' }, {}), 'eventId stable');
  t.assert(e !== eventIdFor('orchestrator.deployed', 'orchestrator', '2026-08-11T09:00:01.000Z', { campaignId: 'camp-1' }, {}), 'eventId changes with at');
  const i = insightIdFor('funnel', 'campaign', 'camp-1', '2026-08-10T00:00:00.000Z', '2026-08-11T00:00:00.000Z');
  t.assert(i === insightIdFor('funnel', 'campaign', 'camp-1', '2026-08-10T00:00:00.000Z', '2026-08-11T00:00:00.000Z'), 'insightId stable');
  const al = alertIdFor('r', 'agency', 'agency', '2026-08-11T00:00:00.000Z');
  t.assert(al === alertIdFor('r', 'agency', 'agency', '2026-08-11T00:00:00.000Z'), 'alertId stable');
}

t.section('job markers advance deterministically');
{
  const bus = makeBus();
  const { engine } = await makeEngine({ base: path.join(BASE, 'markers'), bus, clock: fixedClock() });
  engine.start();
  emitFixtureEvents(bus);
  await engine.runJobs({ now: FIXED_NOW });
  const markers1 = Object.fromEntries([...engine.framework.jobs.keys()].map((name) => [name, engine.framework.loadMarker(name)]));
  await engine.runJobs({ now: FIXED_NOW });
  const markers2 = Object.fromEntries([...engine.framework.jobs.keys()].map((name) => [name, engine.framework.loadMarker(name)]));
  t.assert(stableStringify(markers1) === stableStringify(markers2), 're-running jobs leaves markers untouched');
  t.assert(Object.values(markers1).every((m) => m.status === 'completed'), 'all markers completed');
  engine.stop();
}

t.section('windowsBetween is deterministic and bounded');
{
  const { windowsBetween } = await import('../utils.js');
  const w1 = windowsBetween('2026-08-10T08:30:00.000Z', '2026-08-11T10:00:00.000Z', 3600000, { maxWindows: 24 });
  const w2 = windowsBetween('2026-08-10T08:30:00.000Z', '2026-08-11T10:00:00.000Z', 3600000, { maxWindows: 24 });
  t.assert(stableStringify(w1) === stableStringify(w2), 'windowsBetween stable');
  t.assert(w1.length === 24, 'bounded by maxWindows', String(w1.length));
  t.assert(w1[0].start === '2026-08-10T08:00:00.000Z', 'aligned to UTC boundaries', w1[0].start);
  t.assert(w1[23].end === '2026-08-11T08:00:00.000Z', 'window end derived from start + windowMs');
}

t.summary();
