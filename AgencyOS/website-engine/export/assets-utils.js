import { isNode } from '../renderer/tree.js';
import { kindForPath } from '../assets/index.js';
import { placeholderSvg } from '../assets/index.js';

export function placeholderMap(site) {
  const map = {};
  const counters = {};
  const candidates = new Set([
    ...site.assets.missing,
    ...site.assets.refs.filter((r) => r.status === 'placeholder' || /^\/placeholders\/.*\.(jpg|jpeg|png|webp)$/.test(r.ref)).map((r) => r.ref)
  ]);
  const refs = [...candidates].filter((r) => /\.(jpg|jpeg|png|webp)$/.test(r)).sort();
  for (const ref of refs) {
    const kind = kindForPath(ref);
    const key = kind === 'placeholder' ? 'image' : kind;
    counters[key] = (counters[key] || 0) + 1;
    map[ref] = `/placeholders/${key}-${counters[key]}.svg`;
  }
  return map;
}

export function resolvePlaceholders(tree, map) {
  if (!isNode(tree)) return tree;
  if (tree.type === 'element') {
    const props = {};
    for (const [k, v] of Object.entries(tree.props || {})) {
      props[k] = (k === 'src' && v && map[v]) ? map[v] : v;
    }
    return { ...tree, props, children: (tree.children || []).map((c) => resolvePlaceholders(c, map)) };
  }
  if (tree.type === 'text' || tree.type === 'icon' || tree.type === 'stars') return tree;
  return tree;
}

export function placeholderFiles(site, map) {
  const files = {};
  for (const [ref, target] of Object.entries(map)) {
    const base = target.split('/').pop().replace(/\.svg$/, '');
    const label = base.replace(/^placeholder-/, '').replace(/-(\d+)$/, ' $1');
    files[target.replace(/^\/?/, '')] = placeholderSvg({ kind: base, label, seed: site.businessId, width: 800, height: 600 });
  }
  return files;
}

export function faviconSvg(site) {
  const brand = site.configs['brand.json'] || {};
  const t = site.theme;
  const primary = (t.colors[t.defaultMode].primary || '120 140 200').split(/\s+/).slice(0, 3).join(',');
  const ink = (t.colors[t.defaultMode].ink || '245 241 233').split(/\s+/).slice(0, 3).join(',');
  const initial = (brand.shortName || brand.name || 'B').trim().charAt(0).toUpperCase();
  const safe = initial.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">`,
    `<rect width="64" height="64" rx="14" fill="rgb(${primary})"/>`,
    `<text x="32" y="44" fill="rgb(${ink})" font-family="system-ui, sans-serif" font-size="34" font-weight="700" text-anchor="middle">${safe}</text>`,
    `</svg>`
  ].join('\n');
}
