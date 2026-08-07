import assert from 'node:assert/strict';
import { createWebsiteEngine } from '../index.js';
import { layoutFor, layoutIdFor, LAYOUTS } from '../layouts/index.js';
import { parseTheme, contrastRatio } from '../theme/index.js';
import { cssVariables, themeBootstrapScript, generateTailwindConfig } from '../theme/index.js';
import { generateSiteCss } from '../theme/site-css.js';
import { serializeTreeHtml, serializeBodyJsx } from '../renderer/index.js';
import { escapeHtml } from '../renderer/escape.js';
import { collectRefs, resolveAssets, placeholderSvg } from '../assets/index.js';
import { placeholderMap, resolvePlaceholders, faviconSvg } from '../export/assets-utils.js';
import { staticFiles } from '../export/html.js';
import { reactFiles } from '../export/react.js';
import { exportFiles } from '../export/index.js';
import { previewFiles } from '../preview/index.js';
import { iconSvg, ICON_NAMES } from '../components/icons.js';
import { SECTION_DEFS, SECTION_MAP, SECTION_IDS } from '../sections/index.js';
import { bundleOf, MANIFEST } from './fixtures.js';
import { sha256 } from '../utils.js';

let n = 0;
function assertOk(label, info = '') {
  n++;
  console.log(`  ok ${n} — ${label} ${info}`);
}

const engine = createWebsiteEngine();
const configs = bundleOf();
const site = engine.build(configs, { manifest: MANIFEST });

// 1 — theme tokens
assert.strictEqual(site.theme.defaultMode, 'dark', 'dark default mode');
assert.ok(site.theme.contrast.dark.inkOnBase >= 4.5, 'dark ink/base contrast >= 4.5');
assert.strictEqual(site.engineVersion, '1.0', 'engine version');
assertOk('parseTheme + contrast pairs');

// 2 — css variables + mode blocks
const css = cssVariables(site.theme);
assert.ok(css.includes(':root {'), ':root block');
assert.ok(css.includes('[data-theme="light"] {'), 'light override block');
assert.ok(css.includes('--c-primary: 209 156 93;'), 'primary var');
assert.ok(css.includes('--space-2xl: 4rem;'), 'spacing var');
assert.ok(css.includes('--radius-lg: 1rem;'), 'radius var');
assertOk('css variables deterministic');

// 3 — site css
const siteCss = generateSiteCss(site.theme);
assert.ok(siteCss.includes('@media (max-width: 768px)'), 'mobile nav breakpoint');
assert.ok(siteCss.includes('@media (min-width: 640px)'), '640px breakpoint');
assert.ok(siteCss.includes('@media (min-width: 1024px)'), '1024px breakpoint');
assert.ok(siteCss.includes('.hero--split'), 'hero split variant css');
assert.ok(siteCss.includes('prefers-reduced-motion'), 'reduced motion');
assertOk('site css responsive + a11y');

// 4 — bootstrap + tailwind
const boot = themeBootstrapScript(site.theme);
assert.ok(boot.includes('localStorage.getItem'), 'storage bootstrap');
const tw = generateTailwindConfig(site.theme);
assert.ok(tw.includes('darkMode'), 'tailwind dark mode');
assert.ok(tw.includes('rgb(var(--c-primary'), 'tailwind primary var');
assertOk('tailwind config deterministic');

// 5 — layout mapping by category
assert.strictEqual(layoutIdFor('cafe'), 'cafe', 'cafe → cafe layout');
assert.strictEqual(layoutIdFor('restaurant'), 'restaurant', 'restaurant → restaurant');
assert.strictEqual(layoutIdFor('clinic'), 'medical', 'clinic → medical');
assert.strictEqual(layoutIdFor('shop'), 'corporate', 'shop → corporate');
assert.strictEqual(layoutIdFor('salon'), 'portfolio', 'salon → portfolio');
assert.strictEqual(layoutIdFor('mystery'), 'default', 'unknown → default');
assert.strictEqual(layoutIdFor('other', 'realestate'), 'realestate', 'override → realestate');
assert.deepStrictEqual(Object.keys(LAYOUTS).sort(), ['cafe', 'corporate', 'default', 'medical', 'portfolio', 'realestate', 'restaurant'], '7 layouts');
assertOk('layout selection automatic by category');

// 6 — section registry: 16 sections + map
assert.strictEqual(SECTION_IDS.length, 18, '18 registered builders (16 spec + navbar/location)');
assert.strictEqual(SECTION_MAP.features, 'about', 'features → about');
assert.strictEqual(SECTION_MAP.reservation, 'booking', 'reservation → booking');
for (const id of ['hero', 'about', 'services', 'products', 'menu', 'gallery', 'testimonials', 'faq', 'pricing', 'offers', 'booking', 'stats', 'team', 'contact', 'footer', 'cta']) {
  assert.ok(SECTION_DEFS[id], `section ${id} defined`);
}
assertOk('16 generic sections registered');

// 7 — site model + pages
assert.strictEqual(site.pages.length, 3, '3 pages (home, menu, contact)');
assert.strictEqual(site.pages[0].id, 'home', 'home first');
assert.ok(site.pages.some((p) => p.id === 'menu'), 'menu page from layout');
const home = site.pages[0];
const sections = home.sections.filter((s) => s.props?.['data-section']);
const secIds = sections.map((s) => s.props['data-section']);
assert.ok(secIds.includes('hero') && secIds.includes('menu') && secIds.includes('contact') && secIds.includes('footer'), 'core sections present');
assert.ok(secIds.includes('booking'), 'booking section enabled');
assert.ok(secIds.includes('location'), 'location section present');
assert.ok(!secIds.includes('team') && !secIds.includes('pricing'), 'data-less sections skipped');
assertOk('home page composition');

// 8 — validation passes
const validation = engine.validate(site);
assert.strictEqual(validation.passed, true, 'validation passed');
assert.ok(validation.totals.checks >= 21, `checks ${validation.totals.checks}`);
assert.strictEqual(validation.totals.failed, 0, 'no failed checks');
assertOk('7 validators all pass');

// 9 — serializers: escaping
assert.strictEqual(escapeHtml('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;', 'html escape');
const tree = { type: 'element', tag: 'p', props: {}, children: ['a & b < c', { type: 'text', text: 'x' }] };
const html = serializeTreeHtml(tree);
assert.ok(html.includes('a &amp; b &lt; c'), 'html text escaped');
assert.ok(html.includes('<p>'), 'inline text p');
const jsx = serializeBodyJsx([{ type: 'element', tag: 'div', props: { className: 'x', ariaLabel: 'y' }, children: ['hi ${there} `tick`', { type: 'text', text: 'z' }] }]);
assert.ok(jsx.includes('aria-label={"y"}'), 'jsx aria label');
assert.ok(jsx.includes('{"hi ${there} `tick`"}'), 'jsx raw string escaped');
assert.ok(jsx.includes('{"z"}'), 'jsx text escaped');
assertOk('serializers escape deterministic');

// 10 — icons
assert.ok(ICON_NAMES.includes('star'), 'star icon');
assert.strictEqual(iconSvg('star').includes('<svg'), true, 'icon svg');
assert.strictEqual(iconSvg('does-not-exist'), null, 'unknown icon → null');
assertOk('icon library');

// 11 — assets
const refs = collectRefs(configs);
assert.ok(refs.includes('/hero/dark-hero.jpg'), 'collects hero ref');
const assets = resolveAssets(configs, { manifest: MANIFEST });
assert.ok(assets.missing.every((r) => !MANIFEST.references.includes(r)), 'manifest refs not missing');
assert.ok(assets.refs.some((r) => r.status === 'in-manifest'), 'in-manifest status');
assert.strictEqual(assets.count, refs.length, 'all refs resolved');
assertOk('asset resolver');

// 12 — placeholders
const map = placeholderMap(site);
assert.ok(Object.keys(map).length > 0, 'placeholder map non-empty');
const svg = placeholderSvg({ kind: 'gallery-1', label: 'Gallery 1', seed: 'x' });
assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), 'placeholder svg');
const resolved = resolvePlaceholders({ type: 'element', tag: 'img', props: { src: Object.keys(map)[0] }, children: [] }, map);
assert.notStrictEqual(resolved.props.src, Object.keys(map)[0], 'src rewritten');
assert.ok(faviconSvg(site).includes('<svg'), 'favicon svg');
assertOk('placeholder policy + favicon');

// 13 — static export
const files = staticFiles(site);
assert.ok(files['index.html'].includes('<!DOCTYPE html>'), 'static index');
assert.ok(files['index.html'].includes('class="nav"'), 'navbar rendered');
assert.ok(files['index.html'].includes('data-section="menu"'), 'menu section rendered');
assert.ok(files['index.html'].includes('https://fonts.googleapis.com'), 'fonts linked');
assert.ok(files['robots.txt'].includes('Sitemap: https://roastery.example/sitemap.xml'), 'robots sitemap');
assert.ok(files['sitemap.xml'].includes('<urlset'), 'sitemap');
assert.ok(files['site.webmanifest'].includes('favicon'), 'webmanifest');
assert.ok(files['apple-touch-icon.png'].length > 50, 'png bytes');
assert.ok(files['asset-report.md'].includes('# Asset Report'), 'asset report');
assert.ok(files['index.html'].includes('name="viewport"'), 'viewport meta');
assertOk('static export complete');

// 14 — react export
const rf = reactFiles(site);
assert.ok(rf['src/App.jsx'].includes('export default function App'), 'react app');
assert.ok(rf['src/App.jsx'].includes('data-section={"hero"}'), 'jsx sections');
assert.ok(rf['package.json'].includes('vite'), 'vite project');
assert.ok(rf['tailwind.config.js'].includes('module.exports'), 'tailwind config');
assert.ok(rf['src/site.css'].includes('@tailwind base'), 'tailwind directives');
assert.ok(rf['public/robots.txt'].includes('Sitemap:'), 'public robots');
assertOk('react export complete');

// 15 — json + vercel + preview
const jf = exportFiles(site, { format: 'json' });
assert.ok(jf['site-bundle.json'].includes('"pages"'), 'json bundle');
const vf = exportFiles(site, { format: 'vercel' });
assert.ok(vf['vercel.json'].includes('"framework": "vite"'), 'vercel config');
const pf = previewFiles(site);
assert.ok(pf['index.html'].includes('pv-bar'), 'preview bar');
assert.ok(pf['index.html'].includes('noindex'), 'preview noindex');
assertOk('json/vercel/preview exports');

// 16 — determinism: two builds byte-identical
const site2 = engine.build(configs, { manifest: MANIFEST });
assert.strictEqual(sha256(serializeBodyJsx(home.sections)), sha256(serializeBodyJsx(site2.pages[0].sections)), 'identical jsx');
assert.strictEqual(sha256(staticFiles(site)['index.html']), sha256(staticFiles(site2)['index.html']), 'identical html');
assert.strictEqual(sha256(JSON.stringify(exportFiles(site, { format: 'json' }))), sha256(JSON.stringify(exportFiles(site2, { format: 'json' }))), 'identical json');
assertOk('100% deterministic across builds');

// 17 — broken links detected
{
  const badConfigs = bundleOf({ 'navigation.json': { items: [{ label: 'Ghost', href: '#ghost-anchor' }], cta: { label: 'X', href: '#ghost-cta' } } });
  const badSite = engine.build(badConfigs, { manifest: MANIFEST });
  const v = engine.validate(badSite);
  const links = v.pages.flatMap((p) => p.checks.filter((c) => c.id === 'links' && !c.ok));
  assert.ok(links.length >= 1, 'broken anchor flagged');
  assert.ok(v.failedChecks.some((c) => c.errors.some((e) => e.includes('#ghost-anchor'))), 'ghost anchor error');
  assertOk('broken link validation');
}

// 18 — missing assets flagged
{
  const weird = bundleOf({ 'brand.json': { ...configs['brand.json'], logo: { ...configs['brand.json'].logo, dark: '/odd/logo.png' } } });
  const ws = engine.build(weird, { manifest: MANIFEST });
  assert.ok(ws.assets.missing.includes('/odd/logo.png'), 'missing ref flagged');
  const v = engine.validate(ws);
  assert.ok(!v.passed, 'missing asset fails validation');
  assertOk('missing asset validation');
}

// 19 — wcag failure on bad theme
{
  const badTheme = JSON.parse(JSON.stringify(configs['theme.json']));
  badTheme.colors.dark.base = '10 10 10';
  badTheme.colors.dark.ink = '12 12 12';
  const ws = engine.build(bundleOf({ 'theme.json': badTheme }), { manifest: MANIFEST });
  const v = engine.validate(ws);
  assert.ok(v.failedChecks.some((c) => c.id === 'wcag'), 'wcag check failed');
  assertOk('wcag contrast validation');
}

// 20 — duplicate id detection
{
  const dup = engine.build(bundleOf());
  const fake = { type: 'element', tag: 'section', props: { id: 'dup' }, children: [] };
  dup.pages[0].sections.push(fake);
  dup.pages[0].sections.push(fake);
  const v = engine.validate(dup);
  assert.ok(v.failedChecks.some((c) => c.id === 'ids'), 'duplicate ids flagged');
  assertOk('duplicate id validation');
}

// 21 — missing required configs
{
  const broken = { ...configs };
  delete broken['theme.json'];
  assert.throws(() => engine.build(broken), (e) => e.code === 'WEB_MISSING_CONFIG', 'missing config throws');
  assertOk('bundle required configs enforced');
}

// 22 — layout override
{
  const ws = engine.build(configs, { overrideLayout: 'portfolio' });
  assert.strictEqual(ws.layout.id, 'portfolio', 'override works');
  assertOk('layout override');
}

console.log(`=== WEBSITE ENGINE UNIT: ${n} PASS, 0 FAIL ===`);
process.exit(0);
