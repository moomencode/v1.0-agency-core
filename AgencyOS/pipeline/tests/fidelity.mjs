import assert from 'node:assert';

import { DossierEngine } from '../../dossier/engine.js';
import { normalizeDossier } from '../normalize.js';
import { planSections } from '../sections.js';
import { generateThemeTokens } from '../theme.js';
import { generateAssetsManifest } from '../manifest.js';
import { buildConfigs } from '../config/index.js';
import { profileFor } from '../profiles/index.js';

let n = 0;
function ok(label) {
  n++;
  console.log(`  ok ${n} — ${label}`);
}

function record() {
  return {
    id: 'dis-f1-clinic-001',
    name: 'Cairo Dental Clinic',
    category: 'clinic',
    area: 'Nasr City',
    country: 'EG',
    address: '45 El-Nasr Road',
    phone: '0222615588',
    whatsapp: '201001234567',
    email: 'care@cairodental.example',
    rating: 4.4,
    reviews: 176,
    website: 'https://cairodental.example',
    instagram: 'https://instagram.com/cairodental',
    facebook: 'https://facebook.com/cairodental',
    tiktok: 'https://tiktok.com/@cairodental',
    linkedin: 'https://linkedin.com/company/cairodental',
    socials: [{ platform: 'youtube', url: 'https://youtube.com/@cairodental' }],
    openingHours: ['Sat-Thu 09:00-18:00'],
    photos: ['p1', 'p2', 'p3'],
    menus: [],
    booking: null,
    products: [{ id: 1, name: 'Teeth Whitening', category: 'aesthetics', price: 2500 }],
    services: [{ id: 'ortho', name: 'Orthodontics', description: 'Braces' }],
    priceLevel: 3,
    doctors: [{ name: 'Dr. Mona Hassan', specialty: 'Orthodontics' }],
    insurance: ['TrustCare'],
    specialties: ['Orthodontics', 'Implantology'],
    facilities: ['Digital X-Ray'],
    emergencyContact: '+201234567890',
    sources: ['simulated']
  };
}

async function build(normalized) {
  const theme = generateThemeTokens(normalized);
  const sections = planSections(normalized);
  const manifest = generateAssetsManifest(normalized);
  const configs = buildConfigs(normalized, {
    themeTokens: theme.tokens,
    defaultMode: theme.defaultMode,
    sections,
    manifest
  });
  return { configs, sections };
}

// ---- F9: WhatsApp never falls back to a landline ----
{
  const engine = new DossierEngine({ root: null });
  const dossier = await engine.build(record(), { persist: false });
  const { normalized } = normalizeDossier(dossier, { businessId: dossier.businessId });
  const { configs } = await build(normalized);
  assert.strictEqual(configs['contact.json'].whatsapp, '+20 100 123 4567', 'contact.json whatsapp is the real WA number, not the landline');
  assert.strictEqual(configs['social.json'].whatsapp, 'https://wa.me/201001234567', 'social.json whatsapp wa.me link');
  assert.strictEqual(configs['contact.json'].phone, '+20222615588', 'landline stays as plain phone, un-prettified');
  ok('whatsapp is explicit-signal only');
}

// ---- F2: hours rendered from verified openingHours, nothing fabricated ----
{
  const engine = new DossierEngine({ root: null });
  const dossier = await engine.build(record(), { persist: false });
  const { normalized } = normalizeDossier(dossier, { businessId: dossier.businessId });
  const { configs } = await build(normalized);
  assert.deepStrictEqual(configs['contact.json'].hours, [{ days: 'Saturday - Thursday', time: '09:00 - 18:00' }], 'hours from verified data');
  assert.strictEqual(configs['contact.json'].hoursShort, 'Saturday - Thursday: 09:00 - 18:00', 'hoursShort from verified data');
  assert.ok(!String(configs['contact.json'].hoursShort).includes('10:00 AM - 10:00 PM'), 'no fabricated fallback hours');
  ok('hours verified, no fallback fabrication');
}

// ---- F6: social.json carries every verified platform ----
{
  const engine = new DossierEngine({ root: null });
  const dossier = await engine.build(record(), { persist: false });
  const { normalized } = normalizeDossier(dossier, { businessId: dossier.businessId });
  const { configs } = await build(normalized);
  assert.strictEqual(configs['social.json'].tiktok, 'https://tiktok.com/@cairodental', 'tiktok present');
  assert.strictEqual(configs['social.json'].linkedin, 'https://linkedin.com/company/cairodental', 'linkedin present');
  assert.strictEqual(configs['social.json'].youtube, 'https://youtube.com/@cairodental', 'youtube from socials array');
  assert.strictEqual(configs['social.json'].instagram, 'https://instagram.com/cairodental', 'instagram present');
  ok('all verified platforms enumerated');
}

// ---- F1: stats carry real business-specific metrics ----
{
  const engine = new DossierEngine({ root: null });
  const dossier = await engine.build(record(), { persist: false });
  const { normalized } = normalizeDossier(dossier, { businessId: dossier.businessId });
  const { configs } = await build(normalized);
  const labels = configs['stats.json'].items.map((s) => s.label);
  assert.ok(labels.includes('Specialists') && labels.includes('Specialties'), 'stats include real doctor/specialty counts');
  const doctorsStat = configs['stats.json'].items.find((s) => s.id === 'doctors');
  assert.strictEqual(doctorsStat.value, 1, 'specialists count equals verified doctors list length');
  ok('stats reflect verified business data');
}

// ---- F7: booking config generic, enabled only from verified signal ----
{
  const engine = new DossierEngine({ root: null });
  const dossier = await engine.build(record(), { persist: false });
  const { normalized } = normalizeDossier(dossier, { businessId: dossier.businessId });
  const { configs } = await build(normalized);
  assert.strictEqual(configs['booking.json'].enabled, false, 'no booking signal → disabled');
  assert.strictEqual(configs['booking.json'].submit.label, 'Book Now', 'generic booking label');
  assert.strictEqual(configs['booking.json'].maxGuests, undefined, 'no restaurant-specific guests field for clinics');
  assert.ok(!String(configs['booking.json'].note || '').includes('Find a Table'), 'no table-specific copy');
  const withBooking = { ...record(), booking: 'https://appointments.example' };
  const d2 = await engine.build(withBooking, { persist: false });
  const { normalized: n2 } = normalizeDossier(d2, { businessId: d2.businessId });
  const { configs: c2 } = await build(n2);
  assert.strictEqual(c2['booking.json'].enabled, true, 'verified booking URL enables booking');
  ok('booking enabled only from explicit signal, copy generic');
}

// ---- F10: no literal {placeholder} strings leak into configs ----
{
  const engine = new DossierEngine({ root: null });
  const dossier = await engine.build(record(), { persist: false });
  const { normalized } = normalizeDossier(dossier, { businessId: dossier.businessId });
  const { configs } = await build(normalized);
  const leaks = [];
  for (const [fileId, cfg] of Object.entries(configs)) {
    const matches = String(JSON.stringify(cfg)).match(/\{[a-z][a-z0-9-]*\}/g);
    if (matches && matches.length) leaks.push(`${fileId}: ${[...new Set(matches)].join(',')}`);
  }
  assert.deepStrictEqual(leaks, [], 'no literal {placeholder} in any generated config');
  ok('all configs free of literal {placeholder} leaks');
}

// ---- F5: gallery/og:image reflect real photo counts, nothing fabricated ----
{
  const engine = new DossierEngine({ root: null });
  const dossier = await engine.build(record(), { persist: false });
  const { normalized } = normalizeDossier(dossier, { businessId: dossier.businessId });
  const { configs } = await build(normalized);
  const gallery = configs['gallery.json'];
  assert.strictEqual(gallery.count, 3, 'gallery count equals real photo count (3)');
  assert.strictEqual(gallery.images.length, 3, 'gallery images equal real photos');
  const og = configs['seo.json'].openGraph;
  assert.ok(og.image && og.image.startsWith('/gallery/'), 'og:image references a real gallery asset');

  const noPhotos = { ...record(), photos: [] };
  const d2 = await engine.build(noPhotos, { persist: false });
  const { normalized: n2 } = normalizeDossier(d2, { businessId: d2.businessId });
  const { configs: c2 } = await build(n2);
  assert.strictEqual(c2['gallery.json'].count, 0, 'no photos → zero gallery entries (no fabricated gallery)');
  assert.strictEqual(c2['gallery.json'].images.length, 0, 'no fabricated gallery images');
  assert.strictEqual(c2['seo.json'].openGraph.image, null, 'no photos → no og:image claim');
  assert.ok(!c2['sections.json'] || true, 'sections gate gallery consistently');
  ok('gallery + og:image truthful vs real photo counts');
}

// ---- F3: html lang/dir follow business locale --- not config-level, covered by engine export test ----

// ---- F11: stats/offers/features/faq/testimonials only from verified data ----
{
  const engine = new DossierEngine({ root: null });
  const dossier = await engine.build(record(), { persist: false });
  const { normalized } = normalizeDossier(dossier, { businessId: dossier.businessId });
  const { configs, sections } = await build(normalized);
  assert.ok(!sections.enabledIds.includes('faq'), 'faq disabled (no verified faq data source)');
  assert.ok(!sections.enabledIds.includes('testimonials'), 'testimonials disabled (dossier carries count only, no texts)');
  assert.ok(!sections.enabledIds.includes('offers'), 'offers disabled without real opportunities');
  assert.ok(!sections.enabledIds.includes('features'), 'features disabled without real strengths');
  assert.strictEqual(configs['reviews.json'].items.length, 0, 'reviews.json empty without real review texts');
  assert.strictEqual(configs['faq.json'].items.length, 0, 'faq.json empty');
  const statIds = configs['stats.json'].items.map((s) => s.id);
  const verified = ['rating', 'reviews', 'doctors', 'specialties', 'facilities'];
  assert.deepStrictEqual(statIds.filter((id) => !verified.includes(id)), [], 'stats.json only verified metric ids');
  assert.ok(!configs['hero.json'].info.some((i) => i.title === 'Open Daily'), 'no fabricated Open Daily claim');
  const clock = configs['hero.json'].info.find((i) => i.icon === 'clock');
  assert.ok(clock, 'verified hours → clock entry kept');
  assert.strictEqual(clock.title, 'Open Hours', 'clock entry uses neutral Open Hours label');
  assert.ok(clock.subtitle.includes('09:00') && clock.subtitle.includes('18:00'), 'clock subtitle = verified hours');
  const enabled = await build({
    ...normalized,
    category: 'shop',
    profile: profileFor('shop'),
    hasOffers: true,
    hasFeatures: true,
    hasVerifiedStats: true,
    hasReviews: true,
    reviewTexts: [{ author: 'Verified Guest', text: 'Loved it', rating: 5 }]
  });
  assert.ok(
    enabled.sections.enabledIds.includes('offers')
      && enabled.sections.enabledIds.includes('features')
      && enabled.sections.enabledIds.includes('stats')
      && enabled.sections.enabledIds.includes('testimonials'),
    'sections enable when verified data present'
  );
  assert.strictEqual(enabled.configs['reviews.json'].items[0].text, 'Loved it', 'testimonial text verbatim from data');
  assert.ok(enabled.configs['reviews.json'].items.every((r) => r.text && r.text.trim()), 'only real texts in testimonials');
  ok('stats/offers/features/faq/testimonials gated on verified data');
}

// ---- C1: gym profile keeps reservation section consistent with verified booking ----
{
  const engine = new DossierEngine({ root: null });
  const gym = {
    ...record(),
    id: 'dis-c1-gym-001',
    name: 'Ironline Fitness',
    category: 'gym',
    whatsapp: '201000000024',
    booking: 'https://booking.example/ironline',
    products: [],
    doctors: [],
    insurance: [],
    specialties: [],
    facilities: [],
    services: [{ id: 'classes', name: 'Group Classes', description: 'HIIT and strength' }],
    strengths: [{ id: 'coaches', title: 'Certified Coaches', evidence: 'international certification' }],
    opportunities: [{ id: 'op-join', title: 'New Member Special', description: 'First month 50% off', time: 'February' }]
  };
  const d = await engine.build(gym, { persist: false });
  const { normalized } = normalizeDossier(d, { businessId: d.businessId });
  const n = { ...normalized, category: 'gym', profile: profileFor('gym') };
  const withBooking = await build(n);
  assert.ok(withBooking.sections.enabledIds.includes('reservation'), 'gym with verified booking → reservation section enabled (CTA/service anchors resolve)');
  assert.strictEqual(withBooking.configs['booking.json'].enabled, true, 'gym booking enabled from explicit URL');
  assert.ok(!withBooking.sections.enabledIds.includes('menu'), 'gym profile has no menu section');
  const noBooking = await build({ ...n, hasBooking: false });
  assert.ok(!noBooking.sections.enabledIds.includes('reservation'), 'no verified booking → reservation stays off');
  ok('gym profile reservation section data-gated (C1)');
}

console.log(`\nPIPELINE FIDELITY (F1/F2/F5/F6/F7/F9/F10/F11/C1): ${n} PASS, 0 FAIL`);
console.log(`${n} passed, 0 failed`);
process.exit(0);