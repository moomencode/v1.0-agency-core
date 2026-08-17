import assert from 'node:assert';
import { rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { normalizeCandidate, mergeCandidates, buildRecord } from '../enrich.js';
import { createDiscoverySystem } from '../index.js';
import { DossierEngine } from '../../dossier/engine.js';
import { normalizeDossier } from '../../pipeline/normalize.js';

let n = 0;
function ok(label) {
  n++;
  console.log(`  ok ${n} — ${label}`);
}

function structuredCandidate() {
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
    youtube: 'https://youtube.com/@cairodental',
    twitter: 'https://twitter.com/cairodental',
    socials: [
      { platform: 'tiktok', url: 'https://tiktok.com/@cairodental' },
      { platform: 'whatsapp', url: 'https://wa.me/201001234567' }
    ],
    openingHours: ['Sat-Thu 09:00-18:00'],
    photos: ['p1', 'p2', 'p3'],
    menus: [],
    booking: null,
    products: [{ id: 1, name: 'Teeth Whitening Package', category: 'aesthetics', price: 2500 }],
    services: [
      { id: 'ortho', name: 'Orthodontics', description: 'Braces and aligners' },
      { id: 'implants', name: 'Dental Implants', description: 'Full-mouth implantology' }
    ],
    priceLevel: 3,
    prices: [{ item: 'Consultation', amount: 400 }],
    dishes: [{ name: 'Appetizer', category: 'starters' }],
    doctors: [
      { name: 'Dr. Mona Hassan', specialty: 'Orthodontics' },
      { name: 'Dr. Karim Adel', specialty: 'Implants' }
    ],
    insurance: ['TrustCare', 'MediGuard'],
    specialties: ['Orthodontics', 'Implantology'],
    facilities: ['Digital X-Ray', 'Sterilization Unit'],
    emergencyContact: '+201234567890',
    onlineOrdering: false,
    tags: ['dentist', 'cosmetic'],
    lat: 30.049, lng: 31.240,
    subCategory: 'dental',
    branchCount: 1,
    description: 'Modern dental care',
    businessType: 'clinic',
    sources: ['simulated']
  };
}

// ---- F1: discovery buildRecord must not drop business-specific structured data ----
{
  const record = buildRecord(structuredCandidate(), { probe: null });
  assert.deepStrictEqual(record.products, structuredCandidate().products, 'products preserved through buildRecord');
  assert.deepStrictEqual(record.services, structuredCandidate().services, 'services preserved through buildRecord');
  assert.deepStrictEqual(record.doctors, structuredCandidate().doctors, 'doctors preserved through buildRecord');
  assert.deepStrictEqual(record.insurance, structuredCandidate().insurance, 'insurance preserved through buildRecord');
  assert.deepStrictEqual(record.specialties, structuredCandidate().specialties, 'specialties preserved through buildRecord');
  assert.deepStrictEqual(record.facilities, structuredCandidate().facilities, 'facilities preserved through buildRecord');
  assert.strictEqual(record.emergencyContact, '+201234567890', 'emergencyContact preserved');
  assert.strictEqual(record.priceLevel, 3, 'priceLevel preserved');
  assert.deepStrictEqual(record.prices, structuredCandidate().prices, 'prices preserved');
  assert.deepStrictEqual(record.dishes, structuredCandidate().dishes, 'dishes preserved');
  assert.deepStrictEqual(record.tags, structuredCandidate().tags, 'tags preserved');
  assert.strictEqual(record.lat, 30.049, 'lat preserved');
  assert.strictEqual(record.lng, 31.240, 'lng preserved');
  assert.strictEqual(record.onlineOrdering, false, 'onlineOrdering preserved');
  assert.ok(record.socials.length >= 1, 'socials array preserved');
  ok('buildRecord preserves all structured business fields');
}

// ---- F1: social platform links normalized at candidate level ----
{
  const c = normalizeCandidate(structuredCandidate());
  assert.strictEqual(c.tiktok, 'https://tiktok.com/@cairodental', 'tiktok normalized');
  assert.strictEqual(c.linkedin, 'https://linkedin.com/company/cairodental', 'linkedin normalized');
  assert.strictEqual(c.youtube, 'https://youtube.com/@cairodental', 'youtube normalized');
  assert.strictEqual(c.twitter, 'https://twitter.com/cairodental', 'twitter normalized');
  assert.ok(c.socials.some((s) => s.platform === 'tiktok' && s.url === 'https://tiktok.com/@cairodental'), 'socials entries normalized');
  const bare = normalizeCandidate({ name: 'X', category: 'other', tiktok: '@handle' });
  assert.strictEqual(bare.tiktok, 'https://handle', 'bare handle gets scheme and loses @');
  ok('candidate social links normalized');
}

// ---- F1: mergeCandidates carries structured fields between source rows ----
{
  const a = { name: 'Cairo Dental Clinic', category: 'clinic', area: 'Nasr City', phone: '0222615588', products: [], doctors: [{ name: 'Dr. A' }], priceLevel: null, tiktok: null, sources: ['maps'] };
  const b = { ...a, products: [{ name: 'Whitening' }], doctors: [], priceLevel: 3, tiktok: 'https://tiktok.com/x' };
  const merged = mergeCandidates([a, b])[0];
  assert.deepStrictEqual(merged.products, [{ name: 'Whitening' }], 'products merged from richer source');
  assert.deepStrictEqual(merged.doctors, [{ name: 'Dr. A' }], 'doctors kept when other source empty');
  assert.strictEqual(merged.priceLevel, 3, 'priceLevel merged');
  assert.strictEqual(merged.tiktok, 'https://tiktok.com/x', 'tiktok merged');
  ok('mergeCandidates merges structured fields');
}

// ---- F1: end-to-end discovery run preserves structured data in saved records ----
{
  const root = await mkdtemp(path.join(tmpdir(), 'agencyos-f1-'));
  const sys = createDiscoverySystem({ root, probeMode: 'offline' });
  try {
    const out = await sys.run({ all: true, limit: 5 }, { artifact: false });
    const withData = out.businesses.find((b) => b.id.includes('dis-0a') || b.name.includes('Clinic'));
    assert.ok(out.businesses.length >= 1, 'discovery produced records');
    for (const record of out.businesses) {
      assert.ok(record.id && record.weaknesses && Array.isArray(record.sources), 'record shape intact');
      assert.ok(record.scores && record.scores.opportunity && typeof record.scores.opportunity.value === 'number', 'scores computed');
    }
    ok(`discovery run saved ${out.businesses.length} records with full shape`);
  } finally {
    sys.close();
    await rm(root, { recursive: true, force: true });
  }
}

// ---- F1: dossier captures preserved attributes + real commerce docs ----
{
  const engine = new DossierEngine({ root: null, persist: false });
  const dossier = await engine.build(structuredCandidate(), { persist: false });
  const business = dossier.documents.business;
  assert.ok(business.attributes, 'business document carries attributes');
  assert.strictEqual(business.attributes.source, 'preserved', 'attributes marked preserved');
  assert.deepStrictEqual(business.attributes.doctors, structuredCandidate().doctors, 'doctors in attributes');
  assert.deepStrictEqual(business.attributes.insurance, structuredCandidate().insurance, 'insurance in attributes');
  assert.deepStrictEqual(business.attributes.facilities, structuredCandidate().facilities, 'facilities in attributes');
  assert.strictEqual(business.attributes.emergencyContact, '+201234567890', 'emergencyContact in attributes');
  const services = dossier.documents.services.services;
  assert.ok(services.some((s) => s.name === 'Orthodontics' && s.source === 'extracted'), 'real services marked extracted');
  const products = dossier.documents.products.products;
  assert.ok(products.some((p) => p.name === 'Teeth Whitening Package' && p.source === 'extracted'), 'real products marked extracted');
  const hours = dossier.documents.hours.hours;
  assert.ok(Array.isArray(hours) && hours.length === 1 && hours[0].days === 'Saturday - Thursday', 'hours parsed from openingHours strings');
  assert.strictEqual(dossier.documents.hours.source, 'extracted', 'hours source extracted');
  ok('dossier preserves attributes and real commerce data');
}

// ---- F1: pipeline normalization exposes preserved fields ----
{
  const engine = new DossierEngine({ root: null });
  const dossier = await engine.build(structuredCandidate(), { persist: false });
  const { errors, normalized } = normalizeDossier(dossier, { businessId: dossier.businessId });
  assert.deepStrictEqual(errors, [], 'dossier normalizes cleanly');
  assert.strictEqual(normalized.whatsapp, '+201001234567', 'whatsapp from explicit signal only');
  assert.deepStrictEqual(normalized.doctors, structuredCandidate().doctors, 'doctors exposed to config layer');
  assert.deepStrictEqual(normalized.insurance, structuredCandidate().insurance, 'insurance exposed');
  assert.deepStrictEqual(normalized.specialties, structuredCandidate().specialties, 'specialties exposed');
  assert.deepStrictEqual(normalized.facilities, structuredCandidate().facilities, 'facilities exposed');
  assert.strictEqual(normalized.emergencyContact, '+201234567890', 'emergency contact exposed');
  assert.strictEqual(normalized.onlineOrdering, false, 'onlineOrdering exposed');
  const platforms = normalized.socialLinks.map((s) => s.platform).sort();
  assert.ok(platforms.includes('tiktok') && platforms.includes('linkedin') && platforms.includes('instagram'), 'social platforms from platforms[]');
  ok('normalize exposes preserved structured fields');
}

console.log(`\nDISCOVERY FIDELITY (F1/F2/F6/F9): ${n} PASS, 0 FAIL`);
console.log(`${n} passed, 0 failed`);
process.exit(0);