import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeT, makeEngine, FIXED_NOW } from './helpers.mjs';

const BASE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'var', 'tmp', 'intel-observations');
fs.rmSync(BASE, { recursive: true, force: true });

const t = makeT('intelligence/observations');

const row = (over = {}) => ({
  kind: 'conversion',
  businessId: 'biz-1',
  at: '2026-08-11T09:00:00.000Z',
  payload: { amount: 120 },
  ...over
});

// Valid rows across two days so window reads are exercised.
const items = [
  row({ businessId: 'biz-1', at: '2026-08-10T09:00:00.000Z', payload: { amount: 100 } }),
  row({ businessId: 'biz-2', at: '2026-08-11T09:00:00.000Z', payload: { amount: 120 } })
];

const { engine } = await makeEngine({ base: BASE, storageRoot: path.join(BASE, 'intel-storage') });

t.section('valid import');
const r1 = engine.importObservations({ items, source: 'manual-review' });
t.assert(r1.schema === 'https://agency.os/intelligence/observation-batch', 'receipt schema const');
t.assert(/^batch-[0-9a-f]{16}$/.test(r1.batchId), 'batchId pattern');
t.assert(r1.receipt.accepted === 2, 'accepted 2', JSON.stringify(r1.receipt));
t.assert(r1.receipt.rejected === 0 && r1.receipt.duplicates === 0, 'no rejected/duplicates');
t.assert(r1.receipt.reasons.length === 0, 'no reasons');
t.assert(r1.items.length === 2, 'receipt items reflect accepted rows');
t.assert(r1.items.every((i) => /^obs-[0-9a-f]{16}$/.test(i.observationId)), 'observationId pattern');
t.assert(r1.items.every((i) => i.schema === 'https://agency.os/intelligence/observation'), 'stored row schema const');
t.assert(r1.items.every((i) => /^sha256-[0-9a-f]{64}$/.test(i.integrity)), 'integrity pattern 64-hex');
t.assert(r1.items.every((i) => i.importedAt === FIXED_NOW), 'importedAt pinned to injected clock');
t.assert(r1.items.every((i) => i.source === 'manual-review'), 'source stamped on rows');

t.section('idempotent re-import (duplicates)');
const r2 = engine.importObservations({ items, source: 'manual-review' });
t.assert(r2.receipt.accepted === 0 && r2.receipt.duplicates === 2, 'second import all duplicates');
t.assert(r2.receipt.reasons.length === 2 && r2.receipt.reasons.every((reason) => reason.code === 'duplicate'), 'duplicate reasons recorded');
t.assert(r2.batchId === r1.batchId, 'batchId deterministic for identical content');

t.section('receipt byte-stability across identical runs (fresh storage)');
const stabBase = path.join(BASE, 'stab');
const { engine: stab1 } = await makeEngine({ base: stabBase, storageRoot: path.join(stabBase, 'intel-storage') });
const { engine: stab2 } = await makeEngine({ base: path.join(stabBase, '2'), storageRoot: path.join(stabBase, '2', 'intel-storage') });
const ra = stab1.importObservations({ items, source: 'manual-review' });
const rb = stab2.importObservations({ items, source: 'manual-review' });
t.assert(JSON.stringify(ra) === JSON.stringify(rb), 'receipts byte-identical for identical input under fixed clock');

t.section('identical ids across engines (persisted dedupe)');
const { engine: engine2 } = await makeEngine({ base: BASE, storageRoot: path.join(BASE, 'intel-storage') });
const r3 = engine2.importObservations({ items: [items[0]], source: 'manual-review' });
t.assert(r3.receipt.duplicates === 1 && r3.receipt.accepted === 0, 'persisted dedupe across engine restarts');
t.assert(r3.items.length === 0, 'duplicate rows excluded from items, only reasons remain');
t.assert(r1.items[0].observationId === 'obs-' + stab1.observations.read({ businessId: 'biz-1' })[0].observationId.slice(4), 'observation ids pure function of content (same across storages)');

t.section('rejected rows');
const bad = engine.importObservations({
  items: [row({ kind: 'not-a-kind' }), row({ businessId: '' })],
  source: 'manual-review'
});
t.assert(bad.receipt.accepted === 0 && bad.receipt.rejected === 2, 'invalid rows rejected');
t.assert(bad.receipt.reasons.every((reason) => reason.code === 'E_OBS_INVALID_BATCH', 'all reasons use INVALID_BATCH code'), 'reason codes');
t.assert(bad.receipt.reasons[0].errors && bad.receipt.reasons[0].errors.length > 0, 'schema error detail attached');

t.section('batch shape validation');
let threw = null;
try {
  engine.importObservations({ items: [null], source: 'manual-review' });
} catch (err) {
  threw = err;
}
t.assert(threw && threw.code === 'E_OBS_INVALID_BATCH', 'non-object row throws INVALID_BATCH');
threw = null;
try {
  engine.importObservations({ items: [], source: '' });
} catch (err) {
  threw = err;
}
t.assert(threw && threw.code === 'E_OBS_INVALID_BATCH', 'empty source throws INVALID_BATCH');

t.section('size caps');
threw = null;
try {
  engine.importObservations({ items, source: 'manual-review', caps: { maxRowsPerBatch: 1 } });
} catch (err) {
  threw = err;
}
t.assert(threw && threw.code === 'E_OBS_SIZE_EXCEEDED', 'row-count cap throws SIZE_EXCEEDED');
threw = null;
try {
  engine.importObservations({ items, source: 'manual-review', caps: { maxBytesPerBatch: 10 } });
} catch (err) {
  threw = err;
}
t.assert(threw && threw.code === 'E_OBS_SIZE_EXCEEDED', 'byte cap throws SIZE_EXCEEDED');

t.section('secret rejection');
const secret = engine.importObservations({
  items: [row({ payload: { note: 'leaked sk-live8844332211 here' } })],
  source: 'manual-review'
});
t.assert(secret.receipt.rejected === 1 && secret.receipt.accepted === 0, 'secret-bearing row rejected');
t.assert(secret.receipt.reasons[0].code === 'E_OBS_SECRET_REJECTED', 'SECRET_REJECTED code');
t.assert(secret.receipt.reasons[0].reason.includes('secret pattern'), 'pattern named in reason');
t.assert(engine.observations.count() === 2, 'secret row never written (whole batch safe)');

t.section('orphan flagging');
const orphaned = engine.importObservations({
  items: [
    row({ executionId: 'ex-1' }),
    row({ executionId: 'no-such-execution' }),
    row({})
  ],
  source: 'manual-review'
});
t.assert(orphaned.items[0].orphan === false, 'linked + existing execution not orphan');
t.assert(orphaned.items[1].orphan === true, 'unknown execution flagged orphan');
t.assert(orphaned.items[2].orphan === true, 'no execution/delivery link flagged orphan');

t.section('payload redaction on storage');
const secretRow = orphaned.items[0].executionId ? null : null;
const seeded = engine.importObservations({
  items: [row({ payload: { token: 'abctoken123', amount: 5 } })],
  source: 'manual-review'
});
const stored = engine.observations.read({ businessId: 'biz-1' }).find((o) => o.observationId === seeded.items[0].observationId);
t.assert(stored && stored.payload.token === '[REDACTED]', 'token key redacted at rest');
t.assert(stored && stored.payload.amount === 5, 'non-secret payload intact');

t.section('window-scoped reads');
const windowed = engine.observations.read({ start: '2026-08-10T00:00:00.000Z', end: '2026-08-11T00:00:00.000Z' });
t.assert(windowed.length === 1 && windowed[0].businessId === 'biz-1', 'read honors window bounds');
const byKind = engine.observations.read({ kind: 'conversion' });
t.assert(byKind.length === engine.observations.count(), 'kind filter mat');
t.assert(byKind.every((o) => o.kind === 'conversion'), 'kind filter value');

t.section('store snapshot');
const snap = engine.observations.statsSnapshot();
t.assert(snap.written === engine.observations.count(), 'stats written matches count');
t.assert(snap.days === 2, 'two day files', String(snap.days));
t.assert(snap.watermark && /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(snap.watermark.file), 'watermark persisted');
const wm = JSON.parse(fs.readFileSync(path.join(engine.storageRoot, 'observations', 'watermark.json'), 'utf8'));
t.assert(wm.file === snap.watermark.file && wm.lastBatchId, 'watermark file on disk');

const total = t.summary();
await engine.stop?.();
if (total.failed > 0) process.exit(1);