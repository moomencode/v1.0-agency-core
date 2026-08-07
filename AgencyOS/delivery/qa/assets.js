import { sha256 } from '../utils.js';
import { parseHtml, check, groupPassed } from './html.js';

export function runAssetsGroup(files, buildRecord) {
  const checks = [];
  const fileSet = new Set(Object.keys(files));

  const referenced = new Set();
  for (const [rel, content] of Object.entries(files)) {
    if (!rel.endsWith('.html')) continue;
    const doc = parseHtml(content);
    for (const ref of [...doc.hrefs, ...doc.srcs]) {
      const t = ref.trim();
      if (!t || t.startsWith('#') || /^[a-z]+:/i.test(t)) continue;
      const pathPart = t.split('#')[0].split('?')[0].replace(/^\//, '');
      if (!pathPart) continue;
      if (!pathPart.endsWith('.html') && !pathPart.includes('.')) continue;
      referenced.add(pathPart);
    }
    for (const m of content.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
      const t = m[1].trim().replace(/^\//, '');
      if (t && !t.startsWith('data:') && !t.startsWith('http')) referenced.add(t);
    }
  }

  const missing = [...referenced].filter((r) => !fileSet.has(r)).sort();
  checks.push(check('assets:referenced', missing.length === 0, [`missing referenced assets: ${missing.join(', ')}`]));

  if (buildRecord) {
    const mismatch = [];
    for (const f of buildRecord.files || []) {
      if (files[f.path] === undefined) {
        mismatch.push(`${f.path} missing`);
        continue;
      }
      if (sha256(files[f.path]) !== f.sha256) mismatch.push(`${f.path} checksum mismatch`);
    }
    checks.push(check('assets:checksums', mismatch.length === 0, mismatch.slice(0, 12)));
  }

  return { id: 'assets', checks, passed: groupPassed(checks) };
}
