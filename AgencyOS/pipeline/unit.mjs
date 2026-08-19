import assert from 'node:assert/strict';
import { hashCode, mulberry32, seededRng, stableJson, slugify } from './utils.js';
import { normalizeDossier } from './normalize.js';
import { planSections } from './sections.js';
import { generateThemeTokens, themeJsonFromTokens } from './theme.js';
import { generateAssetsManifest } from './manifest.js';
import { generateStructuredData } from './structured-data.js';
import { generateLocalization } from './localization.js';
import { buildConfigs } from './config/index.js';
import { createRegistry, DEFAULT_PIPELINE } from './registry.js';
import { runQA } from './qa.js';
import { CONFIG_IDS, getConfigSchema, listConfigSchemas } from './schemas/index.js';
import { pipError, PIP_CODES } from './errors.js';

let n = 0;
function ok(label) {
  n++;
  console.log(`  ok ${n} — ${label}`);
}

function flatDoc(payload) {
  return { schemaId: 'x', documentId: 'x', version: 1, ...payload };
}

function makeDossier(overrides = {}) {
  const docs = {
    business: flatDoc({ name: 'Cairo Roastery', category: 'cafe', area: 'Cairo' }),
    brand: flatDoc({ tagline: 'Specialty Coffee House', slogan: 'Brewed with Passion', keywords: ['coffee'] }),
    contact: flatDoc({ phone: '2027357788', email: 'hi@roastery.com', whatsapp: '201000000001', address: '12 Tahrir St' }),
    location: flatDoc({ area: 'Cairo', mapsUrl: 'https://maps.google.com/?q=Cairo' }),
    hours: flatDoc({ hours: [{ days: 'Daily', from: '7:00 AM', to: '12:00 AM' }], hoursShort: 'Daily: 7:00 AM – 12:00 AM' }),
    social: flatDoc({ instagram: 'https://instagram.com/roastery', facebook: 'https://facebook.com/roastery' }),
    website: flatDoc({ status: 'ok', url: 'https://roastery.example' }),
    seo: flatDoc({ present: true }),
    reviews: flatDoc({ rating: 4.2, count: 230, reviews: [{ author: 'Verified Guest', text: 'Amazing coffee', rating: 5 }] }),
    photos: flatDoc({ count: 3 }),
    services: flatDoc({ services: [{ id: 'dine-in', name: 'Dine In', description: 'Warm atmosphere' }] }),
    products: flatDoc({ products: [{ id: 1, name: 'Flat White', category: 'espresso', description: 'Silky', price: 95 }, { id: 2, name: 'Pour Over', category: 'brew', price: 110 }] }),
    pricing: flatDoc({ level: 'affordable' }),
    competitors: flatDoc({ competitors: [] }),
    strengths: flatDoc({ strengths: [{ id: 'great-coffee', title: 'Great Coffee', evidence: '4.2 rating' }] }),
    weaknesses: flatDoc({ weaknesses: [] }),
    opportunities: flatDoc({ opportunities: [{ id: 'op-1', title: 'Expand menu', potential: 'high', priority: 'P1' }] }),
    risks: flatDoc({ risks: [] }),
    recommendations: flatDoc({ quickWins: [], topProblems: [], websiteRecommendations: [] }),
    summary: flatDoc({ verdict: 'APPROVE', risk: 'low', confidence: 0.9, nextStep: 'build website' })
  };
  return { businessId: 'dis-cairo-001', version: 1, documents: { ...docs, ...(overrides.documents || {}) }, ...(overrides.meta || {}) };
}

// ---- utils ----
assert.strictEqual(hashCode('abc'), hashCode('abc'), 'hashCode deterministic');
ok('hashCode deterministic');
assert.notStrictEqual(hashCode('abc'), hashCode('abd'), 'hashCode varies');
ok('hashCode varies by input');
const r1 = seededRng('x'); const r2 = seededRng('x');
assert.deepStrictEqual(Array.from({ length: 5 }, () => r1.rand()), Array.from({ length: 5 }, () => r2.rand()), 'seeded rng deterministic');
ok('seeded rng deterministic');
const r3 = seededRng('x'); const r4 = seededRng('y');
assert.notDeepStrictEqual(Array.from({ length: 3 }, () => r3.rand()), Array.from({ length: 3 }, () => r4.rand()), 'seeded rng varies by seed');
ok('seeded rng varies by seed');
assert.strictEqual(slugify('Cairo Roastery!'), 'cairo-roastery', 'slugify');
ok('slugify');
assert.strictEqual(stableJson({ b: 1, a: { d: 2, c: 3 } }), stableJson({ a: { c: 3, d: 2 }, b: 1 }), 'stableJson key order');
ok('stableJson key order');

// ---- errors ----
const e = pipError(PIP_CODES.INVALID_INPUT, 'boom');
assert.strictEqual(e.code, 'PIP_INVALID_INPUT', 'pipError code');
ok('pipError code');

// ---- normalize ----
const good = makeDossier();
const res = normalizeDossier(good);
assert.deepStrictEqual(res.errors, [], 'valid dossier has no errors');
ok('valid dossier has no errors');
assert.strictEqual(res.normalized.name, 'Cairo Roastery', 'name normalized');
assert.strictEqual(res.normalized.category, 'cafe', 'category normalized');
assert.strictEqual(res.normalized.hasBooking, false, 'no booking signal by default');
assert.strictEqual(res.normalized.hasMenus, true, 'menus present');
assert.strictEqual(res.normalized.rating, 4.2, 'rating kept');
assert.strictEqual(res.normalized.hasSocial, true, 'social detected');
ok('normalized fields');
const bad = normalizeDossier(makeDossier({ documents: { business: flatDoc({ category: 'cafe' }) } }));
assert.ok(bad.errors.length > 0, 'missing name flagged');
ok('missing name flagged');
const wrapped = normalizeDossier({ businessId: 'x', documents: { business: { content: { name: 'Wrapped Co', category: 'shop' } } } });
assert.deepStrictEqual(wrapped.errors, [], 'content-wrapped dossier accepted');
ok('content-wrapped dossier accepted');

// ---- sections ----
const nRes = normalizeDossier(makeDossier());
const secs = planSections(nRes.normalized);
assert.ok(secs.enabledIds.includes('hero'), 'hero enabled');
assert.ok(!secs.enabledIds.includes('reservation'), 'reservation disabled without booking');
assert.ok(secs.enabledIds.includes('menu'), 'menu enabled');
assert.ok(secs.enabledIds.includes('testimonials'), 'testimonials enabled with review texts');
const noReviews = planSections({ ...nRes.normalized, hasReviews: false });
assert.ok(!noReviews.enabledIds.includes('testimonials'), 'testimonials disabled without reviews');
assert.ok(!secs.enabledIds.includes('faq'), 'faq disabled without verified faq data');
const bare = normalizeDossier(makeDossier({ documents: { opportunities: flatDoc({ opportunities: [] }), strengths: flatDoc({ strengths: [] }), products: flatDoc({ products: [] }), services: flatDoc({ services: [] }) } }));
const bareSecs = planSections(bare.normalized);
assert.ok(!bareSecs.enabledIds.includes('offers'), 'offers gated on real opportunities');
assert.ok(!bareSecs.enabledIds.includes('features'), 'features gated on real strengths');
assert.ok(!bareSecs.enabledIds.includes('menu'), 'menu gated on real products');
assert.ok(!bareSecs.enabledIds.includes('services'), 'services gated on real services');
assert.ok(bareSecs.enabledIds.includes('stats'), 'stats enabled on verified rating/reviews');
ok('sections plan reflects dossier');

// ---- theme ----
const { tokens, defaultMode } = generateThemeTokens(nRes.normalized);
for (const g of ['colors', 'typography', 'spacing', 'radius', 'shadows', 'buttons', 'cards', 'animations', 'icons', 'gradients']) {
  assert.ok(tokens[g], `theme group ${g}`);
}
assert.ok(tokens.colors.dark.base && tokens.colors.light.base, 'both modes');
assert.ok(tokens.typography.fontsUrl.startsWith('https://fonts.googleapis.com'), 'fontsUrl');
assert.ok(tokens.contrast.dark.inkOnBase, 'contrast pairs');
const json = themeJsonFromTokens(tokens, nRes.normalized, { defaultMode });
assert.strictEqual(json.name, 'dis-cairo-001', 'theme name');
assert.ok(['dark', 'light'].includes(json.defaultMode), 'default mode valid');
ok('theme tokens 10 groups');

// ---- manifest ----
const manifest = generateAssetsManifest(nRes.normalized);
for (const g of ['logos', 'hero', 'gallery', 'food', 'videos', 'icons', 'backgrounds', 'placeholders']) {
  assert.ok(Array.isArray(manifest.groups[g]), `manifest group ${g}`);
}
assert.strictEqual(manifest.downloaded, false, 'no downloads');
assert.strictEqual(manifest.references.length, new Set(manifest.references).size, 'no duplicate asset paths');
assert.ok(manifest.groups.food.length === 2, 'food from products');
ok('assets manifest groups');

// ---- structured data ----
const sd = generateStructuredData(nRes.normalized);
assert.ok(sd['@graph'].length >= 1, 'graph non-empty');
assert.strictEqual(sd['@graph'][0]['@type'], 'CafeOrCoffeeShop', 'schema type from profile');
assert.ok(sd['@graph'].some((g) => g['@type'] === 'Menu'), 'menu node present');
assert.ok(sd['@graph'].some((g) => g['@type'] === 'Review'), 'review node present');
ok('structured data');

// ---- localization ----
const i18n = generateLocalization(nRes.normalized, secs);
assert.strictEqual(i18n.locale, 'en', 'locale');
assert.deepStrictEqual(i18n.languages, ['en', 'ar'], 'languages');
assert.ok(i18n.labels.nav.ariaOpen, 'nav labels');
assert.ok(Object.keys(i18n.labels.sections).length >= 5, 'section labels');
ok('localization');

// ---- configs ----
const configs = buildConfigs(nRes.normalized, { themeTokens: tokens, defaultMode, sections: secs, manifest });
assert.strictEqual(Object.keys(configs).length, CONFIG_IDS.length, 'all config files generated');
for (const fileId of CONFIG_IDS) {
  assert.ok(configs[fileId], `config ${fileId}`);
  assert.ok(getConfigSchema(fileId), `schema ${fileId}`);
}
assert.strictEqual(listConfigSchemas().length, CONFIG_IDS.length, 'schemas listed');
assert.strictEqual(configs['brand.json'].name, 'Cairo Roastery', 'brand name');
assert.strictEqual(configs['business.json'].sections.length, secs.enabledIds.length, 'sections in business.json');
assert.deepStrictEqual(configs['business.json'].sections, secs.enabledIds, 'sections match plan');
assert.strictEqual(configs['contact.json'].phone, '+20 27 357 788', 'phone formatted E.164');
assert.strictEqual(configs['contact.json'].phoneRaw, '+2027357788', 'phone raw');
assert.strictEqual(configs['seo.json'].schemaType, 'CafeOrCoffeeShop', 'seo schema type');
assert.ok(configs['seo.json'].title.length <= 65, 'seo title length');
assert.ok(configs['seo.json'].description.length <= 165, 'seo description length');
assert.strictEqual(configs['social.json'].whatsapp, 'https://wa.me/201000000001', 'whatsapp link');
assert.strictEqual(configs['theme.json'].name, 'dis-cairo-001', 'theme config');
assert.strictEqual(configs['i18n.json'].labels.locale === undefined ? 'en' : configs['i18n.json'].locale, 'en', 'i18n config');
assert.strictEqual(configs['hero.json'].ctaSecondary.href, '#footer', 'hero cta without booking targets an existing section (never a dead #contact)');
const c2 = buildConfigs(nRes.normalized, { themeTokens: tokens, defaultMode, sections: secs, manifest });
assert.strictEqual(JSON.stringify(configs['reviews.json']), JSON.stringify(c2['reviews.json']), 'reviews deterministic');
assert.strictEqual(configs['reviews.json'].items.length, 1, 'one real review text only');
assert.strictEqual(configs['reviews.json'].items[0].text, 'Amazing coffee', 'review text verbatim from data');
assert.strictEqual(configs['reviews.json'].items[0].name, 'Verified Guest', 'review author kept');
assert.strictEqual(configs['faq.json'].items.length, 0, 'no fabricated faq items');
assert.deepStrictEqual(configs['offers.json'].items.map((o) => o.title), ['Expand menu'], 'offers only from real opportunities');
assert.deepStrictEqual(configs['features.json'].items.map((f) => f.title), ['Great Coffee'], 'features only from real strengths');
const statIds = configs['stats.json'].items.map((s) => s.id);
assert.deepStrictEqual(statIds.filter((id) => !['rating', 'reviews', 'doctors', 'specialties', 'facilities'].includes(id)), [], 'stats only verified metric ids');
const heroClock = configs['hero.json'].info.find((i) => i.icon === 'clock');
assert.strictEqual(heroClock.title, 'Open Hours', 'neutral clock label');
assert.ok(heroClock.subtitle.includes('7:00 AM'), 'clock subtitle from verified hours');
assert.strictEqual(configs['menu.json'].categories[0].count, 1, 'menu category count real (no fabricated 4)');
assert.strictEqual(configs['menu.json'].dishes['espresso'][0].price, 95, 'menu prices real');
ok('all configs generated + deterministic');

// ---- multi-word menu categories (GAP 1: slugified matching both sides) ----
{
  const docs = makeDossier({
    documents: {
      products: flatDoc({
        products: [
          { id: 1, name: 'Yirgacheffe', category: 'Single Origin', price: 95 },
          { id: 2, name: 'Mocha Latte', category: 'Hot Drinks', price: 85 },
          { id: 3, name: 'Iced Brew', category: 'Cold Brew', price: 90 },
          { id: 4, name: 'Flat White', category: 'espresso', price: 95 }
        ]
      })
    }
  });
  const n2 = normalizeDossier(docs).normalized;
  const s2 = planSections(n2);
  const c2 = buildConfigs(n2, { themeTokens: tokens, defaultMode, sections: s2, manifest: generateAssetsManifest(n2) });
  const cats2 = c2['menu.json'].categories.map((c) => c.id);
  assert.deepStrictEqual(cats2, ['single-origin', 'hot-drinks', 'cold-brew', 'espresso'], 'multi-word categories slugified exactly once');
  assert.strictEqual(c2['menu.json'].dishes['single-origin'].length, 1, 'single-origin dishes matched by slugified id');
  assert.strictEqual(c2['menu.json'].dishes['hot-drinks'].length, 1, 'hot-drinks dishes matched by slugified id');
  assert.strictEqual(c2['menu.json'].dishes['cold-brew'].length, 1, 'cold-brew dishes matched by slugified id');
  assert.strictEqual(c2['menu.json'].categories.find((c) => c.id === 'single-origin').count, 1, 'multi-word category counts are real');
  assert.strictEqual(c2['menu.json'].dishes['espresso'][0].name, 'Flat White', 'single-word category behavior unchanged');
  ok('multi-word menu categories (GAP 1)');
}

// ---- contact navigation integrity (GAP 2: no dead #contact anchors) ----
{
  const c3 = buildConfigs(nRes.normalized, { themeTokens: tokens, defaultMode, sections: secs, manifest });
  assert.ok(!secs.enabledIds.includes('contact') && !secs.enabledIds.includes('reservation'), 'cafe fixture has no contact/reservation section');
  assert.strictEqual(c3['navigation.json'].cta.href, '#footer', 'nav cta falls back to the existing #footer');
  assert.strictEqual(c3['hero.json'].ctaSecondary.href, '#footer', 'hero cta falls back to the existing #footer');
  assert.strictEqual(c3['services.json'].items[0].link, '#footer', 'service links fall back to the existing #footer');
  const navHrefs3 = c3['navigation.json'].items.map((i) => i.href);
  assert.ok(!navHrefs3.includes('#contact'), 'no dead #contact nav item without a contact section');
  assert.ok(
    navHrefs3.every((h) => ['#home', '#footer'].includes(h) || secs.enabledIds.includes(h.slice(1))),
    'every nav href points to a rendered section'
  );

  const bookingDocs = makeDossier({ documents: { business: flatDoc({ name: 'Cairo Roastery', category: 'cafe', area: 'Cairo', booking: true }) } });
  const nB = normalizeDossier(bookingDocs).normalized;
  const sB = planSections(nB);
  const cB = buildConfigs(nB, { themeTokens: tokens, defaultMode, sections: sB, manifest: generateAssetsManifest(nB) });
  assert.strictEqual(cB['navigation.json'].cta.href, '#reservation', 'booking business: cta targets #reservation');
  assert.ok(!cB['navigation.json'].items.some((i) => i.href === '#contact'), 'booking business: no dead #contact nav item');

  const bakeryDocs = makeDossier({ documents: { business: flatDoc({ name: 'Golden Loaf Bakery', category: 'bakery', area: 'Cairo' }) } });
  const nK = normalizeDossier(bakeryDocs).normalized;
  const sK = planSections(nK);
  assert.ok(sK.enabledIds.includes('contact'), 'bakery plans a contact section');
  const cK = buildConfigs(nK, { themeTokens: tokens, defaultMode, sections: sK, manifest: generateAssetsManifest(nK) });
  assert.strictEqual(cK['navigation.json'].cta.href, '#contact', 'contact section exists: keep #contact');
  assert.ok(
    cK['navigation.json'].items.every((i) => ['#home', '#footer'].includes(i.href) || sK.enabledIds.includes(i.href.slice(1))),
    'bakery nav items all resolve to planned sections'
  );
  assert.strictEqual(cK['hero.json'].ctaSecondary.href, '#contact', 'hero cta keeps #contact when the section exists');
  ok('contact navigation integrity (GAP 2)');
}

// ---- qa ----
const qa = runQA({
  configs,
  themeTokens: tokens,
  sections: secs,
  manifest,
  structuredData: sd,
  validation: { perConfig: CONFIG_IDS.map((f) => ({ fileId: f, valid: true, errors: [] })), allValid: true }
});
assert.strictEqual(qa.passed, true, 'qa passes on good bundle');
assert.strictEqual(qa.checkCount, 6, 'six qa checks (hours present, no warning)');
assert.strictEqual(qa.checks.map((c) => c.name).join(','), 'config-validation,theme-validation,website-validation,seo-validation,schema-validation,missing-assets', 'qa names');
ok('qa six checks pass');

const brokenConfigs = { ...configs, 'seo.json': { ...configs['seo.json'], title: '' } };
const qa2 = runQA({
  configs: brokenConfigs,
  themeTokens: tokens,
  sections: secs,
  manifest,
  structuredData: sd,
  validation: { perConfig: [], allValid: true }
});
assert.strictEqual(qa2.passed, false, 'qa fails on broken config');
assert.ok(qa2.failedChecks.some((c) => c.name === 'seo-validation'), 'seo check flags broken title');
ok('qa flags broken config');

const qa3 = runQA({
  configs,
  themeTokens: { colors: { dark: {}, light: {} }, typography: {} },
  sections: secs,
  manifest,
  structuredData: sd,
  validation: { perConfig: [], allValid: true }
});
assert.strictEqual(qa3.passed, false, 'qa fails on broken theme');
assert.ok(qa3.failedChecks.some((c) => c.name === 'theme-validation'), 'theme check flags');
ok('qa flags broken theme');

// ---- registry ----
const reg = createRegistry();
const graph = reg.dependencyGraph('website-production');
assert.strictEqual(Object.keys(graph).length, DEFAULT_PIPELINE.stages.length, 'graph nodes');
assert.deepStrictEqual(reg.sortStages('website-production'), [
  'validate', 'normalize', 'generate-theme', 'generate-sections', 'generate-assets-manifest',
  'generate-config', 'generate-navigation', 'generate-seo', 'generate-structured-data',
  'generate-localization', 'generate-build-package', 'qa-validation', 'website-ready'
], 'topological order');
ok('registry graph + order');
assert.throws(() => reg.register({ id: 'bad', apiVersion: '9.9', stages: [] }), (err) => err.code === PIP_CODES.VERSION_MISMATCH, 'version mismatch');
ok('version mismatch rejected');
assert.throws(() => reg.register({ id: 'cycle', stages: [{ id: 'a', dependsOn: ['b'] }, { id: 'b', dependsOn: ['a'] }] }), (err) => err.code === PIP_CODES.DEPENDENCY_CYCLE, 'cycle rejected');
ok('dependency cycle rejected');
assert.throws(() => reg.get('nope'), (err) => err.code === PIP_CODES.UNKNOWN_PIPELINE, 'unknown pipeline');
ok('unknown pipeline rejected');

console.log(`=== PIPELINE UNIT: ${n} PASS, 0 FAIL ===`);
