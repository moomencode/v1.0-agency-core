import assert from 'node:assert/strict';
import path from 'node:path';
import { rm, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DossierEngine } from '../../dossier/index.js';
import { createPipelineRunner } from '../../pipeline/index.js';
import { createWebsiteEngine } from '../index.js';
import { sha256 } from '../utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(__dirname, '..', 'storage', 'engine-regression');

let n = 0;
function assertOk(label, info = '') {
  n++;
  console.log(`  ok ${n} — ${label} ${info}`);
}

const BUSINESSES = [
  { id: 'reg-cafe-001', name: 'Cairo Roastery', category: 'cafe', area: 'Cairo', phone: '2027357788', email: 'hi@roastery.com', whatsapp: '201000000001', instagram: 'https://instagram.com/roastery', address: '12 Tahrir St', photos: ['a', 'b', 'c'], menus: [{}, {}], booking: '/reservation', rating: 4.2, reviews: 230, website: 'https://roastery.example', probe: { ok: true, timeMs: 400 }, sources: ['simulated', 'website'], weaknesses: [{ id: 'no-booking', severity: 'minor' }], scores: { business: { value: 69, breakdown: { presence: 20 } }, opportunity: { value: 77 } } },
  { id: 'reg-rest-001', name: 'Nile Terrace', category: 'restaurant', area: 'Cairo', phone: '2027381111', email: 'hello@nileterrace.example', whatsapp: '201000000011', address: '1 Nile Corniche', menus: [{}, {}, {}, {}], booking: '/reserve', rating: 4.6, reviews: 512, website: 'https://nileterrace.example', probe: { ok: true, timeMs: 300 }, sources: ['simulated', 'website'], weaknesses: [], scores: { business: { value: 81, breakdown: { presence: 26 } }, opportunity: { value: 88 } } },
  { id: 'reg-med-001', name: 'Heliopolis Clinic', category: 'clinic', area: 'Cairo', phone: '2022401234', email: 'care@helioclinic.example', whatsapp: '201000000012', address: '45 El Thawra St', photos: ['a'], booking: '/appointments', rating: 4.4, reviews: 176, website: 'https://helioclinic.example', probe: { ok: true, timeMs: 700 }, sources: ['simulated'], weaknesses: [], scores: { business: { value: 63, breakdown: { presence: 18 } }, opportunity: { value: 71 } } },
  { id: 'reg-re-001', name: 'Prime Properties', category: 'realestate', area: 'New Cairo', phone: '2022555666', email: 'sales@primeprops.example', whatsapp: '201000000013', address: '8 Fifth Settlement', photos: ['a', 'b'], rating: 4.8, reviews: 64, website: 'https://primeprops.example', probe: { ok: true, timeMs: 450 }, sources: ['simulated', 'website'], weaknesses: [], scores: { business: { value: 74, breakdown: { presence: 22 } }, opportunity: { value: 80 } } },
  { id: 'reg-corp-001', name: 'Delta Logistics', category: 'shop', area: 'Giza', phone: '2023777888', email: 'ops@deltalogistics.example', whatsapp: '201000000014', address: '22 Sudan St', photos: ['a'], rating: 4.1, reviews: 39, website: 'https://deltalogistics.example', probe: { ok: true, timeMs: 600 }, sources: ['simulated', 'website'], weaknesses: [{ id: 'no-online-menu', severity: 'minor' }], scores: { business: { value: 58, breakdown: { presence: 16 } }, opportunity: { value: 62 } } },
  { id: 'reg-port-001', name: 'Atelier Cairo', category: 'tailor', area: 'Cairo', phone: null, email: 'studio@ateliercairo.example', whatsapp: '201000000015', address: '3 Zamalek St', photos: ['a', 'b', 'c'], rating: 4.7, reviews: 91, website: 'https://ateliercairo.example', probe: { ok: true, timeMs: 380 }, sources: ['simulated'], weaknesses: [], scores: { business: { value: 66, breakdown: { presence: 20 } }, opportunity: { value: 70 } } },
  { id: 'reg-gen-001', name: 'Nile Books', category: 'other', area: 'Cairo', phone: '2027334455', email: 'books@nilebooks.example', whatsapp: '201000000016', address: '7 Kasr El Nil', photos: ['a'], menus: [], rating: 4.0, reviews: 55, website: 'https://nilebooks.example', probe: { ok: true, timeMs: 520 }, sources: ['simulated'], weaknesses: [], scores: { business: { value: 50, breakdown: { presence: 14 } }, opportunity: { value: 52 } } }
];

await rm(WORK, { recursive: true, force: true });

console.log('WEBSITE ENGINE REGRESSION — Phase 4.3 (7 categories, deterministic sweep)');
console.log('='.repeat(72));

const de = new DossierEngine({ root: null });
const engine = createWebsiteEngine();
const results = [];
const expectedLayouts = { cafe: 'cafe', restaurant: 'restaurant', clinic: 'medical', realestate: 'realestate', shop: 'corporate', tailor: 'portfolio', other: 'default' };

for (const record of BUSINESSES) {
  const dossier = await de.build(record, { persist: false });
  const runner = createPipelineRunner({ root: path.join(WORK, record.id) });
  const ctx = await runner.run(dossier, { businessId: record.id, runId: `reg-${record.id}` });
  assert.strictEqual(ctx.status, 'ready', `${record.id} pipeline ready`);
  assert.strictEqual(ctx.qaPassed, true, `${record.id} qa passed`);

  const site = engine.build(ctx.configs, { manifest: ctx.manifest, structuredData: ctx.structuredData });
  const expected = expectedLayouts[record.category];
  assert.strictEqual(site.layout.id, expected, `${record.id} layout ${expected} (got ${site.layout.id})`);
  const validation = engine.validate(site);
  assert.strictEqual(validation.passed, true, `${record.id} validation passed`);
  assert.ok(site.pages.length >= 2, `${record.id} has pages (${site.pages.length})`);
  assert.ok(site.pages.some((p) => p.id === 'home'), `${record.id} has home`);
  assert.ok(site.pages.some((p) => p.id === 'contact'), `${record.id} has contact`);

  const files = await (await import('../export/html.js')).staticFiles(site);
  const index = files['index.html'];
  assert.ok(index.includes('<!DOCTYPE html>'), `${record.id} html rendered`);
  assert.ok(index.includes('data-section="navbar"'), `${record.id} navbar`);
  assert.ok(index.includes('data-section="footer"'), `${record.id} footer`);
  const homeSections = site.pages.find((p) => p.id === 'home').sections.map((s) => s.props?.['data-section']);
  const planned = ctx.configs['business.json']?.sections || [];
  if (planned.includes('menu') || planned.includes('menu-section')) {
    assert.ok(homeSections.includes('menu'), `${record.id} menu on home`);
  }
  for (const pid of planned.filter((s) => s !== 'navbar' && s !== 'footer' && s !== 'hero')) {
    const mapped = (await import('../sections/index.js')).SECTION_MAP[pid] || pid;
    if (mapped !== 'menu') assert.ok(homeSections.includes(mapped), `${record.id} planned section ${pid}→${mapped} on home (got ${homeSections.join(',')})`);
  }

  results.push({
    id: record.id, category: record.category, layout: site.layout.id,
    pages: site.pages.map((p) => p.path),
    checks: validation.totals.checks,
    failed: validation.totals.failed,
    assets: site.assets.count,
    missing: site.assets.missing.length,
    htmlBytes: index.length,
    indexSha: await sha256(index)
  });
}

// determinism: rebuild the first business and compare every checksum
const first = BUSINESSES[0];
const dossierA = await de.build(first, { persist: false });
const ctxA = await createPipelineRunner({ root: path.join(WORK, 'det-a') }).run(dossierA, { businessId: first.id });
const ctxB = await createPipelineRunner({ root: path.join(WORK, 'det-b') }).run(dossierA, { businessId: first.id });
const siteA = engine.build(ctxA.configs, { manifest: ctxA.manifest, structuredData: ctxA.structuredData });
const siteB = engine.build(ctxB.configs, { manifest: ctxB.manifest, structuredData: ctxB.structuredData });
const htmlA = (await (await import('../export/html.js')).staticFiles(siteA))['index.html'];
const htmlB = (await (await import('../export/html.js')).staticFiles(siteB))['index.html'];
assert.strictEqual(await sha256(htmlA), await sha256(htmlB), 'full re-run byte-identical');
assert.strictEqual(results.find((r) => r.id === first.id).indexSha, await sha256(htmlB), 'matches earlier run sha');
assertOk('determinism across independent pipeline re-runs');

const layoutsCovered = new Set(results.map((r) => r.layout));
assert.deepStrictEqual([...layoutsCovered].sort(), Object.values(expectedLayouts).sort(), 'all 7 layouts covered');
assert.ok(results.every((r) => r.failed === 0), 'zero failed checks across all categories');
assertOk('all 7 layouts covered', `(${layoutsCovered.size}: ${[...layoutsCovered].sort().join(', ')})`);

const totalChecks = results.reduce((s, r) => s + r.checks, 0);
console.log('\n  category sweep:');
for (const r of results) console.log(`    ${r.id.padEnd(12)} ${r.category.padEnd(12)} ${r.layout.padEnd(10)} ${r.pages.length} pages, ${r.checks} checks, ${r.htmlBytes} html bytes`);
console.log(`\n=== WEBSITE ENGINE REGRESSION: ${n} PASS, 0 FAIL (${totalChecks} checks total) ===`);
process.exit(0);
