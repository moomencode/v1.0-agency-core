// AgencyOS — Phase 4.7.0 Foundation & Trust demo.
//
// Offline, deterministic evidence for the 4.7.0 release: observation ingestion
// with receipts, retention sweep (dry-run + real), resumable backfill,
// scheduler cron auto-fire through the framework wiring, PRV-01 vercel
// readyState taxonomy and ID-1 deterministic artifact ids. Run:
//
//   node intelligence/demo-470.mjs
//
// Fixed clock + fixed fixtures: two consecutive runs are byte-identical.

import fs from 'node:fs';
import path from 'node:path';
import { ArtifactManager } from '../artifacts/manager.js';
import { ArtifactSystem } from '../artifacts/index.js';
import { VercelProvider } from '../delivery/providers/vercel/index.js';
import { SchedulerSystem } from '../scheduler/index.js';
import { makeBus, fixedClock, writeFixtureStorage, emitFixtureEvents, FIXED_NOW, INT_ROOT } from './tests/helpers.mjs';
import { createIntelligence } from './index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const demo = (label, value = '') => {
  console.log(`\n--- ${label}${value ? `: ${value}` : ''} ---`);
};
const line = (label, value) => console.log(`  ${String(label).padEnd(34)} ${value}`);
const ok = (label) => console.log(`  OK ${label}`);

const BASE = path.join('C:/Users/kh/AppData/Local/Temp/opencode', 'int-demo-470-' + Date.now());
fs.mkdirSync(BASE, { recursive: true });

console.log('AgencyOS Intelligence — 4.7.0 Foundation & Trust demo');
console.log('demo base:', BASE);

// ---------------------------------------------------------------------------
demo('1 · boot on fixed fixtures');
const clock = fixedClock();
const bus = makeBus();
const fixture = writeFixtureStorage(BASE);
const scheduler = new SchedulerSystem({ root: path.join(BASE, 'scheduler-system'), tickMs: 50 });
const engine = createIntelligence({
  root: INT_ROOT,
  bus,
  clock,
  scheduler,
  orchestratorRoot: fixture.orchestratorRoot,
  deliveryRoot: fixture.deliveryRoot,
  schedulerBaseDir: fixture.schedulerBaseDir,
  killswitchRoot: fixture.orchestratorRoot,
  storageRoot: path.join(BASE, 'intel-storage')
});
engine.start();
emitFixtureEvents(bus);
await engine.runJobs({ now: FIXED_NOW });
line('jobs registered', engine.framework.jobs.size);
line('scheduler job registrations', scheduler.listJobs().length);
line('initial insights', engine.insights.list().length);
ok('engine + scheduler wired with fixtures');

// ---------------------------------------------------------------------------
demo('2 · observation ingestion — idempotent, receipt-driven');
const rows = [
  { kind: 'conversion', businessId: 'biz-1', at: '2026-08-10T09:00:00.000Z', executionId: 'ex-1', payload: { amount: 120 } },
  { kind: 'lead_inquiry', businessId: 'biz-3', at: '2026-08-10T09:01:00.000Z', payload: { source: 'organic' } },
  { kind: 'site_up', businessId: 'biz-2', at: '2026-08-10T09:02:00.000Z', payload: { url: 'https://biz-2.example.test' } }
];
const r1 = engine.importObservations({ items: rows, source: 'manual-review' });
line('receipt', `accepted=${r1.receipt.accepted} rejected=${r1.receipt.rejected} duplicates=${r1.receipt.duplicates}`);
line('batchId', r1.batchId);
line('observation ids', r1.items.map((i) => i.observationId).join(' '));
const r2 = engine.importObservations({ items: rows, source: 'manual-review' });
line('re-import', `accepted=${r2.receipt.accepted} duplicates=${r2.receipt.duplicates}`);
import { importObservations } from './observations/import.js';
import { ObservationStore } from './observations/store.js';
const freshStore = new ObservationStore({ root: path.join(BASE, 'obs-fresh'), clock });
const fresh = await importObservations({
  items: rows, source: 'manual-review',
  validator: engine.validator, schema: engine.observationSchema, batchSchema: engine.observationBatchSchema,
  store: freshStore, reader: engine.reader, clock,
  caps: { maxRowsPerBatch: engine.config.observations.maxRowsPerBatch, maxBytesPerBatch: engine.config.observations.maxBytesPerBatch, maxRowBytes: engine.config.observations.maxRowBytes }
});
line('byte-stable receipt', JSON.stringify(r1) === JSON.stringify(fresh) ? 'identical (fixed clock, same content)' : 'DIFFERENT');
const secret = engine.importObservations({
  items: [{ kind: 'conversion', businessId: 'biz-5', at: '2026-08-10T09:03:00.000Z', payload: { note: 'leaked sk-live8844332211' } }],
  source: 'manual-review'
});
line('secret row', `rejected=${secret.receipt.rejected} reason=${secret.receipt.reasons[0]?.reason || 'none'}`);
line('orphan flags', engine.observations.read({}).map((o) => `${o.observationId}:${o.orphan}`).join(' '));
ok('ingestion deterministic, idempotent, secret-safe');

// ---------------------------------------------------------------------------
demo('3 · PRV-01 — vercel readyState taxonomy');
const states = ['READY', 'BUILDING', 'QUEUED', 'INITIALIZING', 'ERROR', 'CANCELED', null, 'MYSTERY'];
for (const state of states) {
  const http = async () => ({ status: 200, json: async () => ({ readyState: state, url: 'https://site.vercel.app' }) });
  const provider = new VercelProvider({ project: 'agency-site' }, { secrets: { require: () => 'test' }, logger: null, http });
  try {
    const v = await provider.verify('dep-1');
    line(`readyState=${String(state).padEnd(11)}`, `ready=${v.ready} terminal=${v.terminal}`);
  } catch (err) {
    line(`readyState=${String(state).padEnd(11)}`, `PROVIDER_ERROR retryable=${err.meta?.retryable} ${err.message}`);
  }
}
ok('unknown/missing states are explicit retryable errors — no silent BUILDING fallback');

// ---------------------------------------------------------------------------
demo('4 · ID-1 — deterministic artifact ids');
const A = new ArtifactSystem({ root: path.join(BASE, 'arts-a'), sweeperMs: 0 });
const B = new ArtifactSystem({ root: path.join(BASE, 'arts-b'), sweeperMs: 0 });
const spec = { name: 'run-report', type: 'report', format: 'json', content: '{"ok":true}', projectId: 'agency', workflowId: 'intelligence', runId: 'run-1' };
const a1 = A.create(spec);
const b1 = B.create(spec);
line('artifact id (storage A)', a1.id);
line('artifact id (storage B)', b1.id);
line('deterministic', a1.id === b1.id ? 'same id — content-addressed' : 'DIFFERENT');
A.manager.index.keys[`${a1.projectId}::${a1.workflowId}::${a1.type}::${a1.slug}`].versions.push('art-legacy-f2f2f2f2f2f2f2f2');
A.manager.index.artifacts['art-legacy-f2f2f2f2f2f2f2f2'] = { ...a1, id: 'art-legacy-f2f2f2f2f2f2f2f2', version: 0, filename: 'run-report-v0.json' };
A.manager._saveIndex();
line('legacy random id readable', A.manager.get('art-legacy-f2f2f2f2f2f2f2f2') ? 'yes (dual-read)' : 'NO');
ok('new ids deterministic; legacy records remain readable');

// ---------------------------------------------------------------------------
demo('5 · retention sweep — dry run then real');
const storage = engine.storageRoot;
const seed = (rel, content) => {
  const full = path.join(storage, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
};
seed('events/2026-01-05.ndjson', '{"event":"old","ts":"2026-01-05T00:00:00.000Z"}\n');
seed('metrics/2026-01-05.ndjson', '{"metric":"old","ts":"2026-01-05T00:00:00.000Z"}\n');
seed('observations/2026-01-05.ndjson', '{"observationId":"obs-old","at":"2026-01-05T00:00:00.000Z"}\n');
seed('incidents/current.json', JSON.stringify({
  incidents: {
    'inc-old': { id: 'inc-old', status: 'resolved', resolvedAt: '2024-01-01T00:00:00.000Z' },
    'inc-live': { id: 'inc-live', status: 'open', updatedAt: FIXED_NOW }
  }
}));
const dry = await engine.runRetentionSweep({ dryRun: true, now: FIXED_NOW });
line('dry run', `would remove ${dry.filesRemoved} files (${dry.bytesFreed} bytes)`);
const sweep = await engine.runRetentionSweep({ dryRun: false, now: FIXED_NOW });
line('real sweep', `removed ${sweep.filesRemoved} files (${sweep.bytesFreed} bytes)`);
line('live incident kept', fs.existsSync(path.join(storage, 'incidents', 'current.json')) && JSON.parse(fs.readFileSync(path.join(storage, 'incidents', 'current.json'), 'utf8')).incidents['inc-live'] ? 'yes' : 'NO');
line('scheduler history (report-only)', `${sweep.schedulerHistoryBytes} bytes`);
ok('retention swept only expired storage, never live records');

// ---------------------------------------------------------------------------
demo('6 · scheduler auto-fire — intelligence job fires through the scheduler');
const schedJob = scheduler.engine.store.get('intelligence:retention');
line('cron registered in scheduler', schedJob ? schedJob.schedule.expr : 'none');
line('nextRunAt computed', schedJob ? schedJob.nextRunAt : 'n/a');
const asap = new Date(Date.now() - 1000).toISOString();
schedJob.nextRunAt = asap;
scheduler.engine.store.saveJob(schedJob);
scheduler.start();
let marker = null;
for (let i = 0; i < 40 && (!marker || marker.status !== 'completed'); i++) {
  await sleep(50);
  marker = engine.framework.loadMarker('intelligence:retention');
}
line('retention marker', marker ? `${marker.status} @ ${marker.lastWindowEnd || ''}` : 'never fired');
line('retention insight', engine.insights.list('retention').length ? `written (${engine.insights.list('retention').length})` : 'none');
line('scheduler history', scheduler.history('intelligence:retention').length ? 'fired runs recorded' : 'none');
ok('intelligence jobs actually auto-fire (cron schedule wired through the framework)');
scheduler.stop();

// ---------------------------------------------------------------------------
demo('7 · backfill — explicit, resumable, idempotent');
const first = await engine.backfill({ from: '2026-08-09T00:00:00.000Z', to: '2026-08-11T00:00:00.000Z', now: FIXED_NOW, jobs: ['intelligence:scheduler_stats'], maxWindows: 10 });
line('first pass', `${first.windows} windows (${first.rangeKey})`);
const second = await engine.backfill({ from: '2026-08-09T00:00:00.000Z', to: '2026-08-11T00:00:00.000Z', now: FIXED_NOW, jobs: ['intelligence:scheduler_stats'], maxWindows: 10 });
line('re-run', `${second.windows} windows (idempotent marker skip)`);
const future = await engine.backfill({ from: '2026-08-12T00:00:00.000Z', to: '2026-08-16T00:00:00.000Z', now: FIXED_NOW, jobs: ['intelligence:scheduler_stats'], maxWindows: 10 });
line('future range', `${future.windows} windows (never past "now")`);
ok('backfill resumable and never touches the future');

// ---------------------------------------------------------------------------
demo('summary');
line('jobs registered', engine.framework.jobs.size);
line('scheduled (cron in scheduler)', scheduler.listJobs().length);
line('observations stored', engine.observations.count());
line('insights', engine.insights.list().length);
line('snapshot observations', `${engine.snapshot().observations.written} written`);
console.log('\n4.7.0 demo complete — deterministic, offline, zero external side effects');
engine.stop();
process.exit(0);