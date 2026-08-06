import { DossierEngine } from './index.js';
import { createMemorySystem } from '../memory/index.js';
import { createExecutor } from '../runtime/executor.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STORAGE = path.join(ROOT, 'storage', 'dossier-demo');

const executor = await createExecutor({ runId: 'dossier-demo' });
const engine = new DossierEngine({
  root: STORAGE,
  bus: executor.bus,
  validator: executor.validator,
  memory: createMemorySystem({ root: path.join(STORAGE, 'memory') }),
  logger: executor.logger
});

console.log('BUSINESS DOSSIER ENGINE DEMO — Phase 4.1');
console.log('='.repeat(72));
console.log('Engines: extractors + normalizers + enrichers + 20 schemas + 5 report builders + renderer');
console.log('Runtime wiring: EventBus + Validator + Memory via createExecutor()');
console.log('='.repeat(72));

const CAIRO_ROASTERY = {
  id: 'dis-cairo-001', name: 'Cairo Roastery', category: 'cafe', area: 'Cairo',
  phone: '2027357788', email: 'hi@roastery.com', whatsapp: '201000000001',
  instagram: 'https://instagram.com/roastery', facebook: 'https://facebook.com/roastery',
  address: '12 Tahrir St', coordinates: { lat: 30.0444196, lng: 31.2357116 },
  photos: ['a', 'b', 'c'], menus: [{}, {}], booking: '/reservation',
  rating: 4.2, reviews: 230,
  website: 'https://roastery.example', probe: { ok: true, timeMs: 400 },
  sources: ['simulated', 'website'],
  weaknesses: [{ id: 'no-booking', severity: 'minor' }],
  scores: { business: { value: 69, breakdown: { presence: 20 } }, opportunity: { value: 77 } }
};

const GIZA_TAILOR = {
  id: 'dis-giza-003', name: 'Giza Tailor', category: 'tailor', area: 'Giza',
  phone: null, email: null, whatsapp: null, address: '10 Mariouteya', rating: 3.1, reviews: 12,
  website: 'https://gizatailor.example', probe: { ok: false, status: 500, timeMs: 3100 },
  sources: ['simulated'],
  weaknesses: [{ id: 'no-contact', severity: 'major' }, { id: 'broken-site', severity: 'major' }],
  scores: { business: { value: 41, breakdown: { presence: 12 } }, opportunity: { value: 48 } }
};

const d = await engine.build(CAIRO_ROASTERY);
const dDocs = d.documents;
console.log(`\n${d.businessId} — ${d.businessName} (v${d.version})`);
console.log(`  verdict: ${d.verdict} | health: ${d.healthGrade} | digital: ${d.digitalGrade} | opp: ${d.opportunity}`);
console.log(`  documents: ${Object.keys(dDocs).length} | reports: ${Object.keys(d.reports).length} | validation: ${d.validation.valid ? 'SCHEMA-VALID' : d.validation.errors.length + ' errors'}`);
console.log(`  dossierId: ${d.dossierId}`);
for (const docId of ['business', 'brand', 'contact', 'location', 'social', 'website', 'recommendations', 'summary']) {
  const doc = dDocs[docId];
  const label = doc ? (typeof doc.content === 'string' ? doc.content.slice(0, 60) + '...' : '(structured)') : '(missing)';
  console.log(`    - ${docId}: ${label}`);
}

const r = await engine.build(GIZA_TAILOR, { requireApproved: false });
console.log(`\n${r.businessId} — ${r.businessName} (v${r.version})`);
console.log(`  verdict: ${r.verdict} | health: ${r.healthGrade} | top problems: ${r.documents.recommendations.topProblems.map((p) => p.id).join(', ')}`);
console.log(`  website status: ${r.documents.website.status} | recs: ${r.documents.recommendations.websiteRecommendations.map((w) => w.id).join(', ')}`);

const exec = d.reports['executive-report'];
const execTitle = exec.split('\n')[0].replace(/^#\s*/, '');
console.log(`\nEXECUTIVE REPORT SAMPLE (${execTitle})`);
console.log('='.repeat(72));
console.log(exec.split('\n').slice(0, 18).join('\n'));

console.log('\n' + '='.repeat(72));
console.log('REPORTS (rendered from templates)');
console.log('='.repeat(72));
for (const [repId, rep] of Object.entries(d.reports)) {
  const title = rep.split('\n')[0].replace(/^#\s*/, '');
  console.log(`  ${repId.padEnd(30)} ${title} (${rep.length} chars)`);
}

const v2 = await engine.build({ ...CAIRO_ROASTERY, rating: 4.6 }, { update: true });
console.log(`\nupdate: v${d.version} -> v${v2.version} (rating ${d.documents.reviews.rating} -> ${v2.documents.reviews.rating})`);

console.log(`\nSEARCH: category=cafe -> ${engine.search({ category: 'cafe' }).map((x) => x.businessId).join(', ')}`);
console.log(`SEARCH: q=tailor -> ${engine.search({ q: 'tailor' }).map((x) => x.businessId).join(', ')}`);
const snap = engine.snapshot();
console.log(`SNAPSHOT: built ${snap.built}, schemas ${snap.schemas}, index ${snap.indexCount}`);

const mem = engine.memory.get('business', 'business:dis-cairo-001', 'dis-cairo-001');
console.log(`MEMORY: business entry verdict=${mem.content.verdict} health=${mem.content.healthGrade} v${mem.content.version}`);

await engine.memory.close?.();
await executor.close?.();
console.log('\nDEMO COMPLETE');
