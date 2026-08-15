import { obsError, OBS_CODES } from './errors.js';
import { observationIdFor, batchIdFor, sanitizeScopeId, sha256 } from '../ids.js';
import { scanText } from '../../delivery/security/scan.js';
import { redact } from '../../delivery/security/redaction.js';

const BATCH_SCHEMA = 'https://agency.os/intelligence/observation-batch';
const OBSERVATION_SCHEMA = 'https://agency.os/intelligence/observation';

// Safe, explicit outcome-signal ingestion (4.7.0). The whole batch is
// validated first (schema, size, secrets); only then are rows applied.
// Idempotent by observationId (pure function of row content), byte-stable
// receipts under a fixed clock. Errors:
//   E_OBS_INVALID_BATCH  — batch shape invalid / source missing
//   E_OBS_SIZE_EXCEEDED  — batch or row size caps exceeded
//   E_OBS_SECRET_REJECTED— a row matches a secret pattern (whole batch fails
//                          validation, per-row reasons recorded)
// Returns the schema-validated receipt; never partially applies a batch.
export function importObservations({ items, source, validator, schema, batchSchema, store, reader = null, clock = null, caps = {}, batchId = null }) {
  if (!Array.isArray(items)) throw obsError(OBS_CODES.INVALID_BATCH, 'observations batch "items" must be an array', {});
  if (typeof source !== 'string' || source.trim() === '') throw obsError(OBS_CODES.INVALID_BATCH, 'observations batch requires a "source" label', {});
  const maxRows = Number(caps.maxRowsPerBatch ?? 5000);
  const maxBatchBytes = Number(caps.maxBytesPerBatch ?? 1048576);
  const maxRowBytes = Number(caps.maxRowBytes ?? 65536);
  const emptyUnsafe = items.filter((row) => row === null || typeof row !== 'object');
  if (emptyUnsafe.length > 0) throw obsError(OBS_CODES.INVALID_BATCH, 'observations batch contains a non-object row', { indexes: emptyUnsafe.length });

  const nowIso = (clock?.now?.() || new Date()).toISOString();
  const computedBatchId = batchId || batchIdFor(items);
  const sourceLabel = sanitizeScopeId(source, 'source');

  // Validation phase — no writes.
  const normalized = [];
  const accepted = [];
  const rejected = [];
  for (let index = 0; index < items.length; index++) {
    const raw = items[index];
    const row = { ...raw };
    const rowBytes = JSON.stringify(row).length;
    if (rowBytes > maxRowBytes) {
      rejected.push({ index, observationId: null, code: OBS_CODES.SIZE_EXCEEDED, reason: `row exceeds ${maxRowBytes} bytes` });
      continue;
    }
    const scan = scanText(JSON.stringify({ source: sourceLabel, ...row }));
    if (scan.length > 0) {
      rejected.push({ index, observationId: null, code: OBS_CODES.SECRET_REJECTED, reason: `matches secret pattern "${scan[0].type}"` });
      continue;
    }
    const trial = {
      schema: OBSERVATION_SCHEMA,
      batchId: computedBatchId,
      importedAt: nowIso,
      ...row,
      source: sourceLabel
    };
    // observationId is a pure function of the row content and is required by
    // the observation schema, so it is computed before validation.
    let observationId;
    try {
      observationId = observationIdFor(trial.kind, trial.businessId, trial.at, trial.executionId, trial.deliveryRecordId, trial.payload);
      trial.observationId = observationId;
    } catch {
      observationId = null;
    }
    const check = validator.validate(trial, schema, { schemaPath: `observations:${index}` });
    if (!check.valid) {
      rejected.push({ index, observationId, code: OBS_CODES.INVALID_BATCH, reason: check.errors[0]?.message || 'schema invalid', errors: check.errors.slice(0, 5).map((e) => e.message) });
      continue;
    }
    normalized.push({ index, row: trial, observationId });
  }

  // Size caps on the whole batch (validation phase).
  if (items.length > maxRows) throw obsError(OBS_CODES.SIZE_EXCEEDED, `observations batch exceeds ${maxRows} rows`, { rows: items.length });
  if (JSON.stringify(items).length > maxBatchBytes) throw obsError(OBS_CODES.SIZE_EXCEEDED, `observations batch exceeds ${maxBatchBytes} bytes`, { bytes: JSON.stringify(items).length });

  const reasons = [];
  let duplicates = 0;
  let rejectedCount = 0;

  // Dedupe must be stable across restarts: consult the persisted day files.
  const existingByDay = new Map();
  const seenInBatch = new Set();

  // Apply phase.
  for (const { index, row, observationId } of normalized) {
    const day = String(row.at).slice(0, 10);
    if (!existingByDay.has(day)) existingByDay.set(day, store.existingIdsForDay(row.at));
    const existing = existingByDay.get(day);
    if (existing.has(observationId) || seenInBatch.has(observationId)) {
      duplicates++;
      reasons.push({ index, observationId, code: 'duplicate', reason: 'duplicate observationId' });
      continue;
    }
    seenInBatch.add(observationId);
    const stored = { ...row, observationId, integrity: `sha256-${sha256(row)}` };
    // Orphan flag: an observation with no execution/delivery link, or whose
    // referenced execution does not exist in the records, is flagged (advisory).
    stored.orphan = !(stored.executionId || stored.deliveryRecordId) || Boolean(stored.executionId && reader && !reader.hasExecution(stored.executionId));
    stored.payload = redact(stored.payload, { vault: null });
    store.write(stored);
    accepted.push(stored);
  }
  rejectedCount = rejected.length;
  for (const rej of rejected) reasons.push({ index: rej.index, observationId: rej.observationId, code: rej.code, reason: rej.reason, ...(rej.errors ? { errors: rej.errors } : {}) });

  const receipt = {
    schema: BATCH_SCHEMA,
    batchId: computedBatchId,
    source: sourceLabel,
    importedAt: nowIso,
    items: [...accepted, ...rejected.map((r) => ({ index: r.index, code: r.code, reason: r.reason }))],
    receipt: {
      accepted: accepted.length,
      rejected: rejectedCount,
      duplicates,
      reasons
    }
  };
  return receipt;
}

export { BATCH_SCHEMA, OBSERVATION_SCHEMA };