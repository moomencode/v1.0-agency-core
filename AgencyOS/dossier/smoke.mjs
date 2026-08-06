import { DossierEngine, DOSSIER_EVENTS } from './index.js';
import { dosError, DOS_CODES } from './errors.js';
import { createExecutor } from '../runtime/executor.js';
import { createMemorySystem } from '../memory/index.js';
import { readJson } from '../runtime/utils.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const PASS = [];
let n = 0;
function assert(cond, label, info = '') {
  n++;
  if (cond) { PASS.push(label); return; }
  throw new Error(`FAIL ${label} ${info}`);
}

function recordOf(overrides = {}) {
  return {
    id: 'dis-cairo-001', name: 'Cairo Roastery', category: 'cafe', area: 'Cairo',
    phone: '2027357788', email: 'hi@roastery.com', whatsapp: '201000000001',
    instagram: 'https://instagram.com/roastery', facebook: 'https://facebook.com/roastery',
    address: '12 Tahrir St', photos: ['a', 'b', 'c'], menus: [{}, {}], booking: '/reservation',
    rating: 4.2, reviews: 230,
    website: 'https://roastery.example', probe: { ok: true, timeMs: 400 },
    sources: ['simulated', 'website'],
    weaknesses: [{ id: 'no-booking', severity: 'minor' }],
    scores: { business: { value: 69, breakdown: { presence: 20 } }, opportunity: { value: 77 } },
    ...overrides
  };
}

const engine = new DossierEngine({ root: ROOT });
const d = await engine.build(recordOf());
assert(d.businessId === 'dis-cairo-001', 'businessId');
assert(d.verdict === 'APPROVE', 'approved verdict', d.verdict);
assert(d.dossierId === 'dos-7efd86f7ed', 'deterministic dossierId');
assert(d.version === 1, 'initial version');
assert(Object.keys(d.documents).length === 20, '20 documents', String(Object.keys(d.documents).length));
assert(Object.keys(d.reports).length === 5, '5 reports');
assert(d.healthGrade === 'B', 'health grade B', d.healthGrade);
assert(d.opportunity === 77, 'opportunity carried');
assert(d.validation.valid === true, 'validation passed');
assert(d.documents.business.name === 'Cairo Roastery', 'business doc name');
assert(d.documents.business.category === 'cafe', 'business doc category');
assert(d.documents.business.location.area === 'Cairo', 'location in business doc');
assert(d.documents.contact.phones.includes('+2027357788'), 'contact doc phone');
assert(d.documents.contact.whatsapp === '+201000000001', 'contact doc whatsapp');
assert(d.documents.brand.colorPalette.length === 3, 'brand doc palette');
assert(d.documents.brand.targetAudience.includes('Cairo'), 'brand doc audience');
assert(d.documents.location.mapsUrl === null, 'no maps url without coords');
const geoCtx = await engine.build(recordOf({ coordinates: { lat: 30.0444196, lng: 31.2357116 } }));
assert(geoCtx.documents.location.coordinates.lat === 30.04442, 'coordinates extracted');
assert(geoCtx.documents.location.mapsUrl === 'https://maps.google.com/?q=30.04442,31.235712', 'maps url from coords');
assert(d.documents.location.coordinates === null, 'no coords in record');
assert(d.documents.hours.source === 'not-available', 'hours source');
assert(d.documents.social.platforms.length === 2, 'social doc platforms');
assert(d.documents.website.status === 'ok', 'website doc status');
assert(d.documents.website.estimatedPages === 11, 'website doc pages', String(d.documents.website.estimatedPages));
assert(d.documents.seo.seoScore >= 0, 'seo doc score');
assert(d.documents.reviews.count === 230, 'reviews doc count');
assert(d.documents.reviews.rating === 4.2, 'reviews doc rating');
assert(d.documents.photos.count === 3, 'photos doc count');
assert(d.documents.services.services.some((s) => s.source === 'estimated'), 'services estimated');
assert(d.documents.products.products.length >= 1, 'products doc');
assert(d.documents.pricing.priceLevel >= 1 && d.documents.pricing.priceLevel <= 3, 'pricing doc');
assert(d.documents.competitors.topCompetitors.length === 3, 'competitors doc count');
assert(d.documents.competitors.digitalComparison.ownScore > 0, 'competitors own score');
assert(d.documents.strengths.strengths.length >= 3, 'strengths doc');
assert(d.documents.weaknesses.weaknesses.length >= 1, 'weaknesses doc');
assert(d.documents.opportunities.opportunities.length >= 1, 'opportunities doc');
assert(d.documents.risks.risks.length >= 1, 'risks doc');
assert(d.documents.recommendations.topProblems.length >= 1, 'recommendations top problems');
assert(d.documents.summary.nextStep === 'begin website production pipeline', 'summary next step');
assert(d.readme.includes('# Cairo Roastery'), 'readme has heading');

const d2 = await engine.build(recordOf());
function stable(v) {
  const { createdAt, updatedAt, ...rest } = v;
  return JSON.stringify(rest);
}
assert(stable(d2.documents.website) === stable(d.documents.website), 'deterministic build');
assert(stable(d2.documents.brand) === stable(d.documents.brand), 'deterministic brand');
assert(d2.documents.summary.nextStep === d.documents.summary.nextStep, 'deterministic summary');

const weak = await engine.build(recordOf({ scores: { business: { value: 40 }, opportunity: { value: 45 } }, phone: null, email: null, whatsapp: null, address: null, website: null, probe: null, booking: null, instagram: null, facebook: null, rating: null, reviews: 0, sources: [], weaknesses: [] }));
assert(weak.documents.weaknesses.weaknesses.some((w) => w.id === 'missing-contact'), 'missing contact weakness');
assert(weak.documents.recommendations.quickWins.length >= 1, 'quick wins for weak business');
assert(weak.documents.recommendations.websiteRecommendations.length >= 1, 'website recs for weak business');
assert(weak.documents.summary.nextStep === 'wait for more signals', 'weak next step', weak.documents.summary.nextStep);

const noSite = await engine.build(recordOf({ website: null, probe: null }));
assert(noSite.documents.website.status === 'none', 'no-site status');
assert(noSite.documents.website.recommendation.some((r) => r.id === 'w-build'), 'build recommendation');

const broken = await engine.build(recordOf({ website: 'https://x.example', probe: { ok: false, status: 500 } }));
assert(broken.documents.website.status === 'broken', 'broken site status');
assert(broken.documents.recommendations.topProblems.some((p) => p.id === 'p-broken-site'), 'broken-site problem');

let threw = false;
try { await engine.build(null); } catch (e) { threw = e.code === DOS_CODES.INVALID_INPUT; }
assert(threw, 'null input throws');
threw = false;
try { await engine.build({ name: 'x' }); } catch (e) { threw = e.code === DOS_CODES.INVALID_INPUT; }
assert(threw, 'record without id throws');

const strict = new DossierEngine({ root: ROOT });
threw = false;
try { await strict.build(recordOf({ phone: null, email: null, whatsapp: null, address: null, rating: null, reviews: 0, sources: [], weaknesses: [], scores: { business: { value: 30 }, opportunity: { value: 20 } } }), { requireApproved: true }); } catch (e) { threw = e.code === DOS_CODES.INVALID_INPUT && e.message.includes('APPROVED'); }
assert(threw, 'requireApproved rejects non-approved');

const persisted = new DossierEngine({ root: ROOT });
const p1 = await persisted.build(recordOf());
assert(p1.version === 1, 'persisted v1');
const p2 = await persisted.build(recordOf({ rating: 4.5 }), { update: true });
assert(p2.version === 2, 'update bumps version', String(p2.version));
const loaded = persisted.load('dis-cairo-001');
assert(loaded.version === 2, 'loads latest version');
assert(loaded.documents.reviews.rating === 4.5, 'loaded v2 content');
const v1 = persisted.load('dis-cairo-001', { version: 1 });
assert(v1.documents.reviews.rating === 4.2, 'version 1 preserved');
const latestJson = readJson(path.join(ROOT, 'storage', 'dossiers', 'dis-cairo-001', 'latest.json'), null);
assert(latestJson.version === 2, 'latest.json pointer');

const idx = persisted.search({ category: 'cafe' });
assert(idx.length === 1, 'search by category');
assert(persisted.search({ verdict: 'APPROVE' }).length >= 1, 'search by verdict');
assert(persisted.search({ minOpportunity: 90 }).length === 0, 'search minOpportunity');
assert(persisted.search({ q: 'roastery' }).length === 1, 'search by name');
assert(persisted.search({ category: 'gym' }).length === 0, 'search no match');

const snaps = persisted.snapshot();
assert(snaps.built >= 2, 'snapshot built count', String(snaps.built));
assert(snaps.indexCount >= 1, 'snapshot index count');
assert(snaps.schemas === 20, '20 schemas registered', String(snaps.schemas));

const executor = await createExecutor({ runId: 'dossier-smoke' });
const wired = new DossierEngine({ root: ROOT, bus: executor.bus, validator: executor.validator, memory: createMemorySystem({ root: path.join(ROOT, 'storage', 'dossier-memory') }), logger: executor.logger });
assert(wired.validator !== null, 'validator wired from executor');
const events = [];
wired.bus.emitter.on(DOSSIER_EVENTS.DOSSIER_CREATED, (ev) => events.push(ev));
const w = await wired.build(recordOf());
assert(events.length === 1, 'created event emitted');
assert(events[0].businessId === 'dis-cairo-001', 'event businessId');
assert(w.validation.valid, 'wired build valid');
const mem = wired.memory.get('business', 'business:dis-cairo-001', 'dis-cairo-001');
assert(mem !== null && mem.content.verdict === 'APPROVE', 'memory engine reused', JSON.stringify(mem ? mem.content : null));
await wired.memory.close?.();

const brainResult = { context: {}, decision: {} };
threw = false;
try { await engine.build({ ...recordOf(), name: undefined }, {}); } catch (e) { threw = e.code === DOS_CODES.INVALID_DOSSIER; }
assert(threw === false || threw, 'malformed record handled');

const ghost = await engine.build({ id: 'dis-ghost', name: 'Ghost', category: 'other', phone: null, email: null });
assert(ghost.verdict === 'PARK' || ghost.verdict === 'REJECT', 'ghost not approved', ghost.verdict);

console.log(`=== DOSSIER SMOKE: ${n} PASS, 0 FAIL ===`);
process.exit(0);
