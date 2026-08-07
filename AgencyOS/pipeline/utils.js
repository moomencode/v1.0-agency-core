export function hashCode(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRng(key) {
  const rand = mulberry32(hashCode(key));
  return {
    rand,
    int(maxExclusive = 100) {
      return Math.floor(rand() * maxExclusive);
    },
    pick(list) {
      return list[Math.floor(rand() * list.length)];
    },
    shuffle(list) {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    }
  };
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'business';
}

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

export function hashShort(str, len = 8) {
  return hashCode(str).toString(16).padStart(8, '0').slice(0, len);
}
