import { createHash } from 'node:crypto';

export function sortedKeys(o) {
  if (Array.isArray(o)) return o.map(sortedKeys);
  if (o && typeof o === 'object') {
    const out = {};
    for (const k of Object.keys(o).sort()) out[k] = sortedKeys(o[k]);
    return out;
  }
  return o;
}

export function stableJson(value) {
  return JSON.stringify(sortedKeys(value), null, 2);
}

export function ensureArray(v) {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'business';
}

export function hashCode(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function sha256(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}
