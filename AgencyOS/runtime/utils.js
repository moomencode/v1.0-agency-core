import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function hashString(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

export function shortHash(str, n = 12) {
  return hashString(str).slice(0, n);
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRng(seedStr) {
  const seed = parseInt(hashString(seedStr).slice(0, 8), 16);
  return mulberry32(seed);
}

export function slugify(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowIso() {
  return new Date().toISOString();
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function atomicWrite(file, data) {
  ensureDir(path.dirname(file));
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export function readJson(file, fallback = null, onError = null) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return fallback;
    if (typeof onError === 'function') {
      onError(err);
      return fallback;
    }
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    if (typeof onError === 'function') {
      onError(err);
      return fallback;
    }
    throw err;
  }
}

export function writeJson(file, value) {
  atomicWrite(file, JSON.stringify(value, null, 2));
}

export function sanitizeName(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, '_');
}

// SEC-01: caller-supplied run ids must never become path segments that can
// escape their storage root. Transform any runId into a single safe segment:
// strip path separators / control chars, collapse `..` runs, drop leading dots
// and cap length. Legit ids (slugify-based, `run-<ts36>-<rand36>`) pass through
// unchanged; hostile ids (`..\..\x`, absolute paths, `%2e%2e`) collapse to a
// benign single segment and can never traverse or escape the root.
export function sanitizeRunId(runId, fallback = 'run') {
  const s = String(runId ?? '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .slice(0, 96);
  return s || fallback;
}
