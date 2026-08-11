import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, readJson, atomicWrite } from '../runtime/utils.js';

// Fixed UTC window math. All aggregation windows are aligned to UTC epoch
// boundaries; a window is `(start, end]` and its identity is derived from the
// boundary timestamps only, so recomputes are byte-stable.
export function dateKey(iso) {
  return String(iso).slice(0, 10);
}

export function utcWindowStart(epochMs, windowMs) {
  return Math.floor(epochMs / windowMs) * windowMs;
}

export function utcWindowFor(iso, windowMs) {
  const ms = new Date(iso).getTime();
  const start = utcWindowStart(ms, windowMs);
  return { start: new Date(start).toISOString(), end: new Date(start + windowMs).toISOString() };
}

export function windowsBetween(startIso, endIso, windowMs, { maxWindows = 48 } = {}) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const first = utcWindowStart(start, windowMs);
  const out = [];
  for (let t = first; t < end && out.length < maxWindows; t += windowMs) {
    out.push({ start: new Date(t).toISOString(), end: new Date(t + windowMs).toISOString() });
  }
  return out;
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function round2(v) {
  if (v === undefined || v === null || !Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

export function pct(part, whole) {
  if (!whole) return 0;
  return round2((part / whole) * 100);
}

export function dirSize(dir) {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) total += dirSize(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    }
  } catch {
    /* missing dirs are zero */
  }
  return total;
}

export function readNdjson(file) {
  const lines = [];
  try {
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        lines.push(JSON.parse(line));
      } catch {
        /* corrupt lines are skipped — never fatal for derived reads */
      }
    }
  } catch {
    /* missing file is empty */
  }
  return lines;
}

export function appendNdjson(file, record) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
}

export { ensureDir, readJson, atomicWrite };
