import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite, readJson, ensureDir, stableStringify } from '../../runtime/utils.js';
import { obsError, OBS_CODES } from './errors.js';
import { dateKey, appendNdjson, readNdjson } from '../utils.js';
import { sanitizeScopeId } from '../ids.js';

// ObservationStore: daily NDJSON of imported outcome signals with a persisted
// watermark (informational resume point) and observationId dedupe. Imports are
// the only writer (single-writer rule); jobs only read.
export class ObservationStore {
  constructor({ root, clock = null, lruCap = 10000 } = {}) {
    this.root = root;
    this.dir = path.join(root, 'observations');
    this.watermarkFile = path.join(this.dir, 'watermark.json');
    this.now = clock?.now || (() => new Date());
    this.lruCap = Math.max(100, lruCap);
    this.lru = new Map();
    this.stats = { written: 0, duplicates: 0, batches: 0, lastBatchId: null };
    ensureDir(this.dir);
    this._loadWatermark();
  }

  _loadWatermark() {
    const wm = readJson(this.watermarkFile, null);
    this.watermark = wm && typeof wm.file === 'string'
      ? { file: wm.file, lastLine: Number(wm.lastLine) || 0, lastBatchId: wm.lastBatchId || null }
      : { file: null, lastLine: 0, lastBatchId: null };
  }

  _saveWatermark(file, line, batchId) {
    atomicWrite(this.watermarkFile, JSON.stringify({ file: path.basename(file), lastLine: line, lastBatchId: batchId, updatedAt: this.now().toISOString() }, null, 2));
    this.watermark = { file: path.basename(file), lastLine: line, lastBatchId: batchId };
  }

  dayFile(iso) {
    return path.join(this.dir, `${dateKey(iso)}.ndjson`);
  }

  days() {
    try {
      return fs.readdirSync(this.dir).filter((f) => f.endsWith('.ndjson')).map((f) => f.slice(0, 10)).sort();
    } catch {
      return [];
    }
  }

  // Ids already present in the store (persisted check, not memory-only).
  existingIdsForDay(iso) {
    const file = this.dayFile(iso);
    const ids = new Set();
    for (const line of readNdjson(file)) {
      if (line && line.observationId) ids.add(line.observationId);
    }
    return ids;
  }

  has(observationId) {
    if (this.lru.has(observationId)) return true;
    for (const day of this.days()) {
      for (const line of readNdjson(this.dayFile(day))) {
        if (line && line.observationId === observationId) return true;
      }
    }
    return false;
  }

  // Append one validated observation (import is the only caller).
  write(observation) {
    const id = observation.observationId;
    if (this.lru.has(id)) {
      this.stats.duplicates++;
      return false;
    }
    this.lru.set(id, true);
    if (this.lru.size > this.lruCap) this.lru.delete(this.lru.keys().next().value);
    const file = this.dayFile(observation.at);
    appendNdjson(file, observation);
    const lineNo = this.watermark.file === path.basename(file) ? this.watermark.lastLine + 1 : 1;
    this._saveWatermark(file, lineNo, observation.batchId);
    this.stats.written++;
    this.stats.batches++;
    this.stats.lastBatchId = observation.batchId;
    return true;
  }

  // Window-scoped, bounded reads of stored observations.
  read({ start = null, end = null, businessId = null, kind = null, max = 20000 } = {}) {
    const out = [];
    for (const day of this.days()) {
      if (start && day < dateKey(start)) continue;
      if (end && day > dateKey(end)) continue;
      for (const line of readNdjson(this.dayFile(day))) {
        if (!line) continue;
        if (start && line.at < start) continue;
        if (end && line.at >= end) continue;
        if (businessId && line.businessId !== businessId) continue;
        if (kind && line.kind !== kind) continue;
        out.push(line);
        if (out.length >= max) break;
      }
      if (out.length >= max) break;
    }
    out.sort((a, b) => (a.at === b.at ? String(a.observationId).localeCompare(String(b.observationId)) : a.at < b.at ? -1 : 1));
    return out;
  }

  count() {
    return this.days().reduce((acc, day) => acc + readNdjson(this.dayFile(day)).length, 0);
  }

  statsSnapshot() {
    return {
      ...this.stats,
      days: this.days().length,
      watermark: this.watermark.file ? { file: this.watermark.file, lastLine: this.watermark.lastLine } : null
    };
  }
}

export { sanitizeScopeId, stableStringify };