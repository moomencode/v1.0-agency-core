import assert from 'node:assert/strict';
import { createWebsiteEngine } from '../index.js';
import { staticFiles } from '../export/html.js';
import { bundleOf, MANIFEST } from './fixtures.js';

let n = 0;
function assertOk(label, info = '') {
  n++;
  console.log(`  ok ${n} — ${label} ${info}`);
}

const engine = createWebsiteEngine();

// ---- F3 fidelity: html lang/dir + og:locale follow business.json.locale ----
// Phase E1 — Arabic/RTL coverage. No snapshots: explicit assertions on the
// actual exported HTML documents (engine.build -> staticFiles path).

{
  const enConfigs = bundleOf();
  const arConfigs = bundleOf({ 'business.json': { ...enConfigs['business.json'], locale: 'ar' } });
  const arSite = engine.build(arConfigs, { manifest: MANIFEST });
  const arFiles = staticFiles(arSite);

  const arHtmlPages = Object.entries(arFiles).filter(([p]) => p.endsWith('.html'));
  assert.ok(arHtmlPages.length >= 1, 'arabic export has html pages');
  assertOk('arabic export rendered at least one html page', `(${arHtmlPages.length})`);

  for (const [page, html] of arHtmlPages) {
    assert.ok(html.includes('<html lang="ar" dir="rtl">'), `${page} html tag lang="ar" + dir="rtl"`);
    assert.ok(html.includes('property="og:locale" content="ar_EG"'), `${page} og:locale == ar_EG`);
    assert.ok(!html.includes('property="og:locale" content="en_US"'), `${page} no stale og:locale en_US`);
    assertOk('arabic page attributes verified', `(${page})`);
  }
}

{
  const enConfigs = bundleOf();
  const enSite = engine.build(enConfigs, { manifest: MANIFEST });
  const enFiles = staticFiles(enSite);

  const enHtmlPages = Object.entries(enFiles).filter(([p]) => p.endsWith('.html'));
  for (const [page, html] of enHtmlPages) {
    assert.ok(html.includes('<html lang="en">'), `${page} html tag lang="en"`);
    assert.ok(!html.includes('dir="rtl"'), `${page} no rtl direction`);
    assert.ok(html.includes('property="og:locale" content="en_US"'), `${page} og:locale == en_US`);
    assertOk('english page attributes verified', `(${page})`);
  }
}

console.log(`=== WEBSITE ENGINE FIDELITY: ${n} PASS, 0 FAIL ===`);
process.exit(0);