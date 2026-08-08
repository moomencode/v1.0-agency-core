import { ensureArray } from '../utils.js';

export function collectRefs(configs) {
  const refs = [];
  const seen = new Set();
  (function walk(v) {
    if (v === null || v === undefined) return;
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.startsWith('/') && t.includes('.') && !seen.has(t)) {
        seen.add(t);
        refs.push(t);
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (typeof v === 'object') {
      for (const k of Object.keys(v)) {
        if (k === 'href' || k === 'src' || k === 'image' || k === 'icon') walk(v[k]);
      }
      for (const k of Object.keys(v)) {
        if (k !== 'href' && k !== 'src' && k !== 'image' && k !== 'icon') walk(v[k]);
      }
    }
  })(configs);
  return refs;
}

function classify(ref, manifest) {
  if (/^(https?:|mailto:|tel:|wa\.me)/.test(ref)) return 'external';
  if (/^#/.test(ref)) return 'anchor';
  const manifestPaths = new Set(ensureArray(manifest?.references));
  if (manifestPaths.has(ref)) {
    if (manifest?.downloaded === false && /\.(jpg|jpeg|png|webp)$/.test(ref)) return 'placeholder';
    return 'in-manifest';
  }
  if (/^\/placeholders\//.test(ref)) return 'placeholder';
  return 'missing';
}

export function resolveAssets(configs, { manifest = null } = {}) {
  const refs = collectRefs(configs);
  const report = [];
  const missing = [];
  const placeholderable = [];
  for (const ref of refs) {
    const status = classify(ref, manifest);
    const entry = { ref, status };
    if (status === 'in-manifest') {
      const group = Object.entries(manifest?.groups || {}).find(([, list]) => Array.isArray(list) && list.some((e) => e.path === ref));
      entry.group = group ? group[0] : null;
      entry.source = group ? group[1].find((e) => e.path === ref)?.source || 'unknown' : 'unknown';
    }
    if (status === 'missing') missing.push(ref);
    if (status === 'missing' && /\.(jpg|jpeg|png|webp|svg)$/.test(ref)) placeholderable.push(ref);
    report.push(entry);
  }
  return { refs: report, missing, placeholderable, manifestRefs: ensureArray(manifest?.references), count: report.length };
}
