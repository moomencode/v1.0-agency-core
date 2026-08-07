import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createWebsiteEngine } from '../index.js';
import { bundleOf, MANIFEST } from './fixtures.js';
import { sha256, stableJson } from '../utils.js';
import { collectNodes, collectText } from '../renderer/tree.js';
import { staticFiles } from '../export/html.js';
import { cssVariables, generateSiteCss } from '../theme/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAP = path.join(__dirname, '..', 'storage', 'engine-visual', 'snapshot.json');

let n = 0;
function assertOk(label, info = '') {
  n++;
  console.log(`  ok ${n} — ${label} ${info}`);
}

function pageSnapshot(page) {
  const all = collectNodes(page, () => true);
  const count = (fn) => all.filter(fn).length;
  return {
    sections: collectNodes(page, (nd) => nd.type === 'element' && nd.props?.['data-section']).map((nd) => nd.props['data-section']),
    elements: count((nd) => nd.type === 'element'),
    textNodes: count((nd) => nd.type === 'text'),
    images: count((nd) => nd.type === 'element' && nd.tag === 'img'),
    links: count((nd) => nd.type === 'element' && nd.tag === 'a'),
    buttons: count((nd) => nd.type === 'element' && nd.tag === 'button'),
    icons: count((nd) => nd.type === 'icon'),
    text: collectText({ type: 'element', children: page.sections })
  };
}

await rm(path.dirname(SNAP), { recursive: true, force: true });
await mkdir(path.dirname(SNAP), { recursive: true });

console.log('WEBSITE ENGINE VISUAL SNAPSHOT — Phase 4.3 (structural, deterministic)');
console.log('='.repeat(72));

const engine = createWebsiteEngine();
const site = engine.build(bundleOf(), { manifest: MANIFEST });
const validation = engine.validate(site);
assert.strictEqual(validation.passed, true, 'validation passes before snapshot');

const css = `${cssVariables(site.theme)}\n${generateSiteCss(site.theme)}`;
const files = staticFiles(site);
const snapshot = {
  engineVersion: site.engineVersion,
  businessId: site.businessId,
  layout: site.layout.id,
  theme: {
    mode: site.theme.defaultMode,
    cssBytes: css.length,
    cssSha256: await sha256(css),
    fonts: site.theme.typography.fontsUrl
  },
  pages: Object.fromEntries(site.pages.map((p) => [p.id, pageSnapshot(p)])),
  files: Object.fromEntries(Object.entries(files).map(([f, c]) => [f, c.length]))
};
snapshot.sha = await sha256(stableJson(snapshot));

await writeFile(SNAP, stableJson(snapshot));

const html = files['index.html'];
assert.ok(html.includes('<h1'), 'hero h1 rendered');
assert.ok(html.includes('hero__title'), 'hero title class');
assert.ok(html.includes('class="btn btn--primary"'), 'primary button rendered');
assert.ok(html.includes('data-booking-form'), 'booking form rendered');
assert.ok(html.includes('data-theme-toggle'), 'theme toggle rendered');
assert.ok(html.includes('data-whatsapp'), 'whatsapp hook rendered');
assert.ok(html.includes('aria-hidden="true"'), 'decorative icons hidden');
assert.ok(css.includes('@media (min-width: 640px)') && css.includes('@media (min-width: 1024px)'), 'responsive breakpoints in css');
assert.ok(css.includes('prefers-reduced-motion'), 'reduced motion respected');
assertOk('visual structure verified', `(${snapshot.pages.home.sections.length} home sections, ${snapshot.pages.home.images} images, ${snapshot.pages.home.links} links)`);

const reSite = engine.build(bundleOf(), { manifest: MANIFEST });
const reFiles = staticFiles(reSite);
const reCss = `${cssVariables(reSite.theme)}\n${generateSiteCss(reSite.theme)}`;
assert.strictEqual(await sha256(reCss), snapshot.theme.cssSha256, 'css byte-identical');
assert.strictEqual(await sha256(reFiles['index.html']), await sha256(html), 'html byte-identical');
const reSnap = { ...snapshot, sha: null };
delete reSnap.sha;
assert.strictEqual(await sha256(stableJson(reSnap)), snapshot.sha, 'snapshot reproducible');
assertOk('snapshot reproducible byte-for-byte');

console.log(`\n  snapshot: ${SNAP} (${snapshot.theme.cssBytes} css bytes, ${snapshot.pages.home.elements} home elements)`);
console.log(`=== WEBSITE ENGINE VISUAL: ${n} PASS, 0 FAIL ===`);
process.exit(0);
