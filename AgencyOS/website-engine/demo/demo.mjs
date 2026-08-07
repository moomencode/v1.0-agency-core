import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DossierEngine } from '../../dossier/index.js';
import { createPipelineRunner } from '../../pipeline/index.js';
import { createWebsiteEngine } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITES = path.join(__dirname, 'sites');

const BUSINESSES = [
  {
    id: 'dis-cairo-001', name: 'Cairo Roastery', category: 'cafe', area: 'Cairo',
    phone: '2027357788', email: 'hi@roastery.com', whatsapp: '201000000001',
    instagram: 'https://instagram.com/roastery', facebook: 'https://facebook.com/roastery',
    address: '12 Tahrir St', photos: ['a', 'b', 'c'], menus: [{}, {}], booking: '/reservation',
    rating: 4.2, reviews: 230, website: 'https://roastery.example', probe: { ok: true, timeMs: 400 },
    sources: ['simulated', 'website'], weaknesses: [{ id: 'no-booking', severity: 'minor' }],
    scores: { business: { value: 69, breakdown: { presence: 20 } }, opportunity: { value: 77 } }
  },
  {
    id: 'dis-cairo-010', name: 'Nile Terrace', category: 'restaurant', area: 'Cairo',
    phone: '2027381111', email: 'hello@nileterrace.example', whatsapp: '201000000011',
    address: '1 Nile Corniche', menus: [{}, {}, {}, {}], booking: '/reserve',
    rating: 4.6, reviews: 512, website: 'https://nileterrace.example', probe: { ok: true, timeMs: 300 },
    sources: ['simulated', 'website'], weaknesses: [],
    scores: { business: { value: 81, breakdown: { presence: 26 } }, opportunity: { value: 88 } }
  },
  {
    id: 'dis-heliopolis-011', name: 'Heliopolis Clinic', category: 'clinic', area: 'Cairo',
    phone: '2022401234', email: 'care@helioclinic.example', whatsapp: '201000000012',
    address: '45 El Thawra St', photos: ['a'], booking: '/appointments',
    rating: 4.4, reviews: 176, website: 'https://helioclinic.example', probe: { ok: true, timeMs: 700 },
    sources: ['simulated'], weaknesses: [],
    scores: { business: { value: 63, breakdown: { presence: 18 } }, opportunity: { value: 71 } }
  },
  {
    id: 'dis-newcairo-012', name: 'Prime Properties', category: 'realestate', area: 'New Cairo',
    phone: '2022555666', email: 'sales@primeprops.example', whatsapp: '201000000013',
    address: '8 Fifth Settlement', photos: ['a', 'b'],
    rating: 4.8, reviews: 64, website: 'https://primeprops.example', probe: { ok: true, timeMs: 450 },
    sources: ['simulated', 'website'], weaknesses: [],
    scores: { business: { value: 74, breakdown: { presence: 22 } }, opportunity: { value: 80 } }
  },
  {
    id: 'dis-giza-013', name: 'Delta Logistics', category: 'shop', area: 'Giza',
    phone: '2023777888', email: 'ops@deltalogistics.example', whatsapp: '201000000014',
    address: '22 Sudan St', photos: ['a'],
    rating: 4.1, reviews: 39, website: 'https://deltalogistics.example', probe: { ok: true, timeMs: 600 },
    sources: ['simulated', 'website'], weaknesses: [{ id: 'no-online-menu', severity: 'minor' }],
    scores: { business: { value: 58, breakdown: { presence: 16 } }, opportunity: { value: 62 } }
  },
  {
    id: 'dis-zamalek-014', name: 'Atelier Cairo', category: 'tailor', area: 'Cairo',
    phone: null, email: 'studio@ateliercairo.example', whatsapp: '201000000015',
    address: '3 Zamalek St', photos: ['a', 'b', 'c'],
    rating: 4.7, reviews: 91, website: 'https://ateliercairo.example', probe: { ok: true, timeMs: 380 },
    sources: ['simulated'], weaknesses: [],
    scores: { business: { value: 66, breakdown: { presence: 20 } }, opportunity: { value: 70 } }
  },
  {
    id: 'dis-downtown-015', name: 'Nile Books', category: 'other', area: 'Cairo',
    phone: '2027334455', email: 'books@nilebooks.example', whatsapp: '201000000016',
    address: '7 Kasr El Nil', photos: ['a'], menus: [],
    rating: 4.0, reviews: 55, website: 'https://nilebooks.example', probe: { ok: true, timeMs: 520 },
    sources: ['simulated'], weaknesses: [],
    scores: { business: { value: 50, breakdown: { presence: 14 } }, opportunity: { value: 52 } }
  }
];

console.log('UNIVERSAL WEBSITE ENGINE DEMO — Phase 4.3 (7 businesses, 7 layouts)');
console.log('='.repeat(72));
console.log('Chain: Business Dossier → Pipeline → Website Config Bundle → Website Engine → Website');

const de = new DossierEngine({ root: null });
const engine = createWebsiteEngine();
const rows = [];

for (const record of BUSINESSES) {
  const dossier = await de.build(record, { persist: false });
  const runner = createPipelineRunner({ root: null });
  const ctx = await runner.run(dossier, { businessId: record.id });
  const site = engine.build(ctx.configs, { manifest: ctx.manifest, structuredData: ctx.structuredData });
  const validation = engine.validate(site);
  const outDir = path.join(SITES, record.id);
  await engine.export(site, { format: 'all', root: outDir, validation });
  await engine.preview(site, { root: path.join(outDir, 'preview') });
  rows.push({
    id: record.id, name: record.name, category: record.category, layout: site.layout.id,
    pages: site.pages.map((p) => p.path).join(','),
    checks: validation.totals.checks, failed: validation.totals.failed,
    assets: site.assets.count, missing: site.assets.missing.length
  });
  console.log(`  ${record.id.padEnd(18)} ${record.name.padEnd(18)} ${record.category.padEnd(12)} → ${site.layout.id.padEnd(10)} validation ${validation.passed ? 'PASS' : 'FAIL'} (${validation.totals.checks} checks)`);
}

const totalChecks = rows.reduce((s, r) => s + r.checks, 0);
console.log('='.repeat(72));
console.log(`Generated ${rows.length} websites under demo/sites/ — ${totalChecks} validation checks, ${rows.filter((r) => r.failed === 0).length}/${rows.length} clean.`);
console.log('Each site: static/ (hostable HTML), react/ (Vite project), json/ (bundle), vercel/ (deployable), preview/ (single-file preview).');
