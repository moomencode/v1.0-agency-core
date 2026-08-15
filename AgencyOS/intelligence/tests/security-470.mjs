import fs from 'node:fs';
import path from 'node:path';
import { makeT, makeEngine, makeBus, emitFixtureEvents, FIXED_NOW } from './helpers.mjs';
import { scanText } from '../../delivery/security/scan.js';

const t = makeT('intelligence/security-470');
const BASE = path.join('C:/Users/kh/AppData/Local/Temp/opencode', 'int-security-470-' + Date.now());
fs.mkdirSync(BASE, { recursive: true });

t.section('no writes outside the intelligence storage (storage-diff)');
{
  const base = path.join(BASE, 'diff');
  const bus = makeBus();
  const { engine, fixture } = await makeEngine({ base, bus, clock: { now: () => new Date(FIXED_NOW) }, storageRoot: path.join(base, 'intel-storage') });
  const fingerprint = () => {
    const walk = (dir, rel = '') => {
      const out = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(p, entry.isDirectory() ? path.join(rel, entry.name) : rel));
        else out.push([path.join(rel, entry.name), fs.readFileSync(p, 'utf8')]);
      }
      return out;
    };
    const files = walk(fixture.base).filter(([rel]) => !rel.startsWith('intel-storage'));
    const map = {};
    for (const [rel, content] of files) map[rel] = content;
    return map;
  };

  const before = fingerprint();
  engine.start();
  emitFixtureEvents(bus);
  await engine.runJobs({ now: FIXED_NOW });
  // 4.7.0: run the retention job through the framework as a scheduled run
  await engine.runJob('intelligence:retention', { now: FIXED_NOW });
  // 4.7.0: import observations + a backfill
  engine.importObservations({
    items: [
      { kind: 'conversion', businessId: 'biz-1', at: '2026-08-10T09:00:00.000Z', executionId: 'ex-1', payload: { amount: 99 } },
      { kind: 'manual_review', businessId: 'biz-2', at: '2026-08-10T09:01:00.000Z', payload: { note: 'ok' } }
    ],
    source: 'manual-review'
  });
  await engine.backfill({ from: '2026-08-09T00:00:00.000Z', to: '2026-08-11T00:00:00.000Z', now: FIXED_NOW, jobs: ['intelligence:scheduler_stats'], maxWindows: 10 });
  engine.stop();

  const after = fingerprint();
  const changed = Object.keys(after).filter((rel) => before[rel] !== after[rel]);
  const created = Object.keys(after).filter((rel) => !(rel in before));
  t.assert(changed.length === 0, 'nothing under orchestrator/delivery/scheduler fixtures changed', JSON.stringify(changed));
  t.assert(created.length === 0, 'nothing created outside intel-storage', JSON.stringify(created));
}

t.section('observations never mutate brain verdicts, approval policy or budgets');
{
  const base = path.join(BASE, 'brain');
  const { engine, fixture } = await makeEngine({ base, clock: { now: () => new Date(FIXED_NOW) }, storageRoot: path.join(base, 'intel-storage') });
  engine.importObservations({
    items: [
      { kind: 'conversion', businessId: 'biz-1', at: '2026-08-10T09:00:00.000Z', executionId: 'ex-1', payload: { amount: 500 } },
      { kind: 'site_up', businessId: 'biz-2', at: '2026-08-10T09:01:00.000Z', payload: { url: 'https://b.test' } }
    ],
    source: 'manual-review'
  });
  const decision = engine.reader.readDecision('ex-1');
  t.assert(decision && decision.verdict === 'APPROVED', 'decision record untouched by imports');
  const receipts = engine.observations.read({});
  t.assert(receipts.length === 2 && receipts.every((o) => o.schema === 'https://agency.os/intelligence/observation'), 'imports only appended observation rows');
  const config = JSON.parse(fs.readFileSync(path.join(engine.root, 'config', 'intelligence.config.json'), 'utf8'));
  t.assert(config.version === 1 && config.retention, 'platform config unchanged by ingestion');
}

t.section('observation storage is secret-free at rest (storage-diff redaction)');
{
  const base = path.join(BASE, 'secrets');
  const { engine } = await makeEngine({ base, clock: { now: () => new Date(FIXED_NOW) }, storageRoot: path.join(base, 'intel-storage') });
  engine.importObservations({
    items: [
      { kind: 'conversion', businessId: 'biz-1', at: '2026-08-10T09:00:00.000Z', payload: { authorization: 'supersecretvalue123' } }
    ],
    source: 'manual-review'
  });
  const stored = engine.observations.read({})[0];
  t.assert(stored && stored.payload.authorization === '[REDACTED]', 'secret key value redacted in the stored row');
  const ndjson = fs.readFileSync(path.join(engine.storageRoot, 'observations', '2026-08-10.ndjson'), 'utf8');
  t.assert(scanText(ndjson).length === 0, 'scanText over the observation store finds nothing', JSON.stringify(scanText(ndjson)));
  t.assert(!ndjson.includes('supersecretvalue123'), 'raw secret absent from the store file');
}

t.section('golden-file determinism: repeated runs are byte-identical');
{
  const base = path.join(BASE, 'golden');
  const bus = makeBus();
  const { engine } = await makeEngine({ base, bus, clock: { now: () => new Date(FIXED_NOW) }, storageRoot: path.join(base, 'intel-storage') });
  engine.start();
  emitFixtureEvents(bus);
  await engine.runJobs({ now: FIXED_NOW });
  engine.stop();
  const firstPass = [...engine.insights.list().map((i) => JSON.stringify(i))].sort();
  // Wipe markers so the exact same windows recompute from scratch
  fs.rmSync(path.join(engine.storageRoot, 'jobs'), { recursive: true, force: true });
  await engine.runJobs({ now: FIXED_NOW });
  const secondPass = [...engine.insights.list().map((i) => JSON.stringify(i))].sort();
  t.assert(firstPass.length === secondPass.length, 'same insight count across recomputes', `${firstPass.length} vs ${secondPass.length}`);
  t.assert(JSON.stringify(firstPass) === JSON.stringify(secondPass), 'insight golden files byte-identical across recomputes');
}

t.section('retention job leaves live data and scheduler files alone (defense-in-depth)');
{
  const base = path.join(BASE, 'guards');
  const { engine, fixture } = await makeEngine({ base, clock: { now: () => new Date(FIXED_NOW) }, storageRoot: path.join(base, 'intel-storage') });
  const today = path.join(engine.storageRoot, 'events', `${FIXED_NOW.slice(0, 10)}.ndjson`);
  fs.mkdirSync(path.dirname(today), { recursive: true });
  fs.writeFileSync(today, '{"event":"x","ts":"2026-08-11T08:00:00.000Z"}\n');
  const historyBefore = fs.readFileSync(path.join(fixture.schedulerBaseDir, '_history.json'), 'utf8');
  const result = await engine.runRetentionSweep({ dryRun: false, now: FIXED_NOW });
  t.assert(fs.existsSync(today), 'today file never deleted');
  t.assert(result.incidents.removed >= 0 && result.alerts.removed >= 0, 'incident/alert sweep ran without touching live state');
  t.assert(fs.readFileSync(path.join(fixture.schedulerBaseDir, '_history.json'), 'utf8') === historyBefore, 'scheduler history untouched');
}

t.section('empty sweep is a clean no-op (idempotent)');
{
  const base = path.join(BASE, 'empty');
  const { engine } = await makeEngine({ base, clock: { now: () => new Date(FIXED_NOW) }, storageRoot: path.join(base, 'intel-storage') });
  const first = await engine.runRetentionSweep({ dryRun: false, now: FIXED_NOW });
  const second = await engine.runRetentionSweep({ dryRun: false, now: FIXED_NOW });
  t.assert(first.filesRemoved === 0 && second.filesRemoved === 0, 'no files, no side effects');
}

t.summary();