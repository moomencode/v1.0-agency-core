import { parseHtml, check, groupPassed } from './html.js';

const EXTERNAL_SCHEMES = ['http', 'https', 'mailto', 'tel', 'whatsapp'];

export function runLinksGroup(files) {
  const checks = [];
  const htmlPages = Object.keys(files).filter((p) => p.endsWith('.html')).sort();
  const pageIds = new Map();

  for (const page of htmlPages) {
    pageIds.set(page, new Set(parseHtml(files[page]).ids));
  }

  for (const page of htmlPages) {
    const doc = parseHtml(files[page]);
    const bad = [];
    for (const href of [...doc.hrefs, ...doc.srcs]) {
      const trimmed = href.trim();
      if (!trimmed) {
        bad.push('empty href/src');
        continue;
      }
      if (trimmed.startsWith('#')) {
        if (!pageIds.get(page).has(trimmed.slice(1))) bad.push(`unresolved anchor ${trimmed}`);
        continue;
      }
      if (/^[a-z]+:/i.test(trimmed)) {
        const scheme = trimmed.slice(0, trimmed.indexOf(':')).toLowerCase();
        if (!EXTERNAL_SCHEMES.includes(scheme)) bad.push(`unsupported scheme ${scheme}:`);
        continue;
      }
      const pathPart = trimmed.split('#')[0].split('?')[0].replace(/^\//, '');
      const target = pathPart === '' || pathPart.endsWith('.html') ? pathPart : `${pathPart}.html`;
      if (target && !files[target] && !files[pathPart]) {
        bad.push(`missing target ${trimmed}`);
      }
    }
    checks.push(check(`links:${page}`, bad.length === 0, bad.slice(0, 12)));
  }

  return { id: 'links', checks, passed: groupPassed(checks) };
}
