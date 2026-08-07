import assert from 'node:assert/strict';
import path from 'node:path';
import { rm, readFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createExecutor } from '../../runtime/executor.js';
import { DossierEngine } from '../../dossier/index.js';
import { createPipelineRunner } from '../../pipeline/index.js';
import { createWebsiteEngine } from '../index.js';
import { sha256 } from '../utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(__dirname, '..', 'storage', 'engine-smoke');

let n = 0;
function assertOk(label, info = '') {
  n++;
  console.log(`  ok ${n} — ${label} ${info}`);
}

function recordOf(overrides = {}) {
  return {
    id: 'dis-cairo-001', name: 'Cairo Roastery', category: 'cafe', area: 'Cairo',
    phone: '2027357788', email: 'hi@roastery.com', whatsapp: '201000000001',
    instagram: 'https://instagram.com/roastery', facebook: 'https://facebook.com/roastery',
    address: '12 Tahrir St', coordinates: { lat: 30.0444196, lng: 31.2357116 },
    photos: ['a', 'b', 'c'], menus: [{}, {}], booking: '/reservation',
    rating: 4.2, reviews: 230, website: 'https://roastery.example', probe: { ok: true, timeMs: 400 },
    sources: ['simulated', 'website'], weaknesses: [{ id: 'no-booking', severity: 'minor' }],
    scores: { business: { value: 69, breakdown: { presence: 20 } }, opportunity: { value: 77 } },
    ...overrides
  };
}

await rm(WORK, { recursive: true, force: true });

console.log('WEBSITE ENGINE SMOKE — Phase 4.3 (dossier → pipeline → engine)');
console.log('='.repeat(72));

// 1 — pipeline produces the config bundle
const executor = await createExecutor({ runId: 'engine-smoke' });
const de = new DossierEngine({ root: null });
const dossier = await de.build(recordOf(), { persist: false });
const runner = createPipelineRunner({ root: WORK, validator: executor.validator, bus: executor.bus, logger: executor.logger });
const ctx = await runner.run(dossier, { businessId: 'dis-cairo-001', runId: 'engine-smoke-run' });
assert.strictEqual(ctx.status, 'ready', 'pipeline ready');
assert.strictEqual(ctx.configCount, 19, '19 config files');
assertOk('pipeline produced config bundle', `(${ctx.configCount} configs)`);

// 2 — engine consumes the bundle
const engine = createWebsiteEngine({ logger: executor.logger });
const site = engine.build(ctx.configs, { manifest: ctx.manifest, structuredData: ctx.structuredData });
assert.strictEqual(site.businessId, 'dis-cairo-001', 'business id');
assert.strictEqual(site.layout.id, 'cafe', 'cafe layout selected');
assert.ok(site.pages.length >= 3, `pages >= 3 (${site.pages.map((p) => p.path).join(', ')})`);
assertOk('engine builds from pipeline bundle', `(${site.pages.length} pages, ${site.assets.count} asset refs)`);

// 3 — validation gates pass on real pipeline output
const validation = engine.validate(site);
assert.strictEqual(validation.passed, true, 'validation passed on real bundle');
assert.strictEqual(validation.totals.failed, 0, 'zero failed checks');
assert.ok(validation.totals.checks >= 21, `checks ${validation.totals.checks}`);
assertOk('validation gate clean', `(${validation.totals.checks} checks)`);

// 4 — export all formats to disk + manifest with checksums
await engine.export(site, { format: 'all', root: WORK, validation });
await access(path.join(WORK, 'static', 'index.html'));
await access(path.join(WORK, 'static', 'menu.html'));
await access(path.join(WORK, 'static', 'contact.html'));
await access(path.join(WORK, 'react', 'src', 'App.jsx'));
await access(path.join(WORK, 'json', 'site-bundle.json'));
await access(path.join(WORK, 'vercel', 'vercel.json'));
await access(path.join(WORK, 'vercel', 'src', 'main.jsx'));
await access(path.join(WORK, 'static', 'robots.txt'));
await access(path.join(WORK, 'static', 'site.webmanifest'));
await access(path.join(WORK, 'site-manifest.json'));
const siteManifest = JSON.parse(await readFile(path.join(WORK, 'site-manifest.json'), 'utf8'));
assert.ok(siteManifest.checksums['static/index.html'], 'index checksum in manifest');
const indexHtml = await readFile(path.join(WORK, 'static', 'index.html'), 'utf8');
assert.strictEqual(await sha256(indexHtml), siteManifest.checksums['static/index.html'], 'checksum matches bytes');
assertOk('all formats exported', `(${siteManifest.files} files, checksums verified)`);

// 5 — placeholders resolved in export
const placeholders = (await readdir(path.join(WORK, 'static', 'placeholders'))).sort();
assert.ok(placeholders.length > 0, `placeholder svgs generated (${placeholders.length})`);
assert.ok(placeholders.every((f) => f.endsWith('.svg')), 'all placeholder svgs');
assert.ok(!indexHtml.includes('/placeholders/gallery-1.jpg'), 'placeholder refs rewritten');
assert.ok(indexHtml.includes('/placeholders/'), 'generated placeholders referenced');
assertOk('placeholder policy in exported site');

// 6 — deterministic across a second pipeline run
const runner2 = createPipelineRunner({ root: path.join(WORK, 'run2') });
const ctx2 = await runner2.run(dossier, { businessId: 'dis-cairo-001', runId: 'engine-smoke-run-2' });
const site2 = engine.build(ctx2.configs, { manifest: ctx2.manifest, structuredData: ctx2.structuredData });
const { staticFiles } = await import('../export/html.js');
const html2 = staticFiles(site2)['index.html'];
assert.strictEqual(await sha256(html2), await sha256(indexHtml), 'byte-identical across pipeline runs');
assertOk('deterministic across runs');

// 7 — preview export
await engine.preview(site, { root: path.join(WORK, 'preview') });
await access(path.join(WORK, 'preview', 'index.html'));
const preview = await readFile(path.join(WORK, 'preview', 'index.html'), 'utf8');
assert.ok(preview.includes('pv-bar'), 'preview bar present');
assert.ok(preview.includes('noindex'), 'preview noindex');
assertOk('preview export');

// 8 — engine report
const report = engine.report(site, validation);
assert.ok(report.includes('# Website Engine Report'), 'report header');
assert.ok(report.includes('PASS'), 'report validation status');
assertOk('site report');

// 9 — broken bundle rejected
assert.throws(() => engine.build({ 'business.json': {} }), (e) => e.code === 'WEB_MISSING_CONFIG', 'bundle without configs rejected');
assertOk('broken bundle rejected');

// 10 — unknown format rejected
assert.throws(() => engine.export(site, { format: 'nope' }), (e) => e.code === 'WEB_UNKNOWN_FORMAT', 'unknown format rejected');
assertOk('unknown format rejected');

await executor.close?.();
await de.memory?.close?.();

console.log(`\n=== WEBSITE ENGINE SMOKE: ${n} PASS, 0 FAIL ===`);
process.exit(0);
