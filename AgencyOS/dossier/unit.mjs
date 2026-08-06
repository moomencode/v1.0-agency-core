import { normalizePhone, normalizeEmail, normalizeUrl, normalizeCoordinates, normalizeName, normalizeHours, normalizeSocialUrl } from './normalizers/index.js';
import { runExtractors } from './extractors/index.js';
import { brandEnricher, weaknessesEnricher, strengthsEnricher, digitalPresenceScore } from './enrichers/index.js';
import { render } from './renderer.js';
import { categoryInfo } from './categories.js';

const PASS = [];
let n = 0;
function assert(cond, label, info = '') {
  n++;
  if (cond) { PASS.push(label); return; }
  throw new Error(`FAIL ${label} ${info}`);
}

assert(normalizePhone('01012345678') === '+201012345678', 'local mobile normalized');
assert(normalizePhone('2027357788') === '+2027357788', 'landline normalized');
assert(normalizePhone('+202 735 7788') === '+2027357788', 'international kept');
assert(normalizePhone(null) === null, 'null phone');
assert(normalizeEmail('  HI@Roastery.com ') === 'hi@roastery.com', 'email normalized');
assert(normalizeEmail('not-an-email') === null, 'invalid email rejected');
assert(normalizeUrl('roastery.example') === 'https://roastery.example', 'url scheme added');
assert(normalizeUrl('https://roastery.example/') === 'https://roastery.example', 'trailing slash removed');
assert(normalizeSocialUrl('instagram', 'roastery') === 'https://instagram.com/roastery', 'social handle to url');
assert(normalizeSocialUrl('facebook', 'https://facebook.com/roastery') === 'https://facebook.com/roastery', 'social url kept');
assert(JSON.stringify(normalizeCoordinates({ lat: 30.0444196, lng: 31.2357116 })) === JSON.stringify({ lat: 30.04442, lng: 31.235712 }), 'coordinates rounded');
assert(normalizeCoordinates({ lat: 999, lng: 0 }) === null, 'invalid coordinates rejected');
assert(normalizeName('  Cairo   Roastery ') === 'Cairo Roastery', 'name normalized');
assert(normalizeHours({ monday: '09:00-18:00' })[0].day === 'monday', 'hours object parsed');
assert(normalizeHours(null) === null, 'null hours');
assert(render('Hello {{name}}', { name: 'World' }) === 'Hello World', 'render placeholder');
assert(render('{{#each items}}- {{_item}};\n{{/each}}', { items: ['a', 'b'] }) === '- a;\n- b;\n', 'render each loop');
assert(categoryInfo('cafe').label === 'Cafe', 'category knowledge');
assert(categoryInfo('unknown-cat').label === 'Local Business', 'unknown category falls back');

const record = {
  id: 'dis-x', name: 'Test Cafe', category: 'cafe', area: 'Cairo',
  phone: '01012345678', email: 'x@y.com', whatsapp: '201000000001',
  instagram: 'https://instagram.com/x', facebook: '@xcafe',
  address: '1 Main St', photos: ['a', 'b', 'c'], menus: [{}], booking: '/book',
  rating: 4.3, reviews: 120, website: 'https://x.example', probe: { ok: true, timeMs: 300 },
  sources: ['a', 'b'], weaknesses: [{ id: 'no-booking', severity: 'minor' }],
  scores: { business: { value: 70, breakdown: { presence: 22 } }, opportunity: { value: 80 } }
};
const raw = runExtractors(record);
assert(raw.contact.phones.includes('+201012345678'), 'extractor phone');
assert(raw.contact.emails.includes('x@y.com'), 'extractor email');
assert(raw.contact.whatsapp === '+201000000001', 'extractor whatsapp');
assert(raw.profile.category === 'cafe', 'extractor category');
assert(raw.profile.branchCount === 1, 'extractor branch default');
assert(raw.digital.websiteStatus === 'ok', 'extractor website ok');
assert(raw.digital.social.length === 2, 'extractor social count', String(raw.digital.social.length));
assert(raw.digital.photos === 3, 'extractor photos');
assert(raw.digital.menus === 1, 'extractor menus');
assert(raw.digital.booking === '/book', 'extractor booking');
assert(raw.commerce.priceLevel === null, 'commerce price null default');

const ctx = { scores: { business: 70, opportunity: 80, presence: 22 }, presence: { websiteStatus: 'ok', seoPresent: true, socialActivity: 0.6, hasBooking: true, missingContact: false }, weaknesses: ['no-booking'], flags: {} };
const brand = brandEnricher(raw.profile, raw.digital, ctx);
assert(brand.personality.length > 5, 'brand personality estimated');
assert(brand.colorPalette.length === 3, 'brand palette');
assert(brand.uniqueSellingPoints.length > 0, 'brand usps');
assert(brand.origin.personality === 'estimated', 'brand origin marked');

const weak = weaknessesEnricher(ctx, record);
assert(weak.some((w) => w.id === 'no-booking' && w.severity === 'minor'), 'weakness severity from record');
const weak2 = weaknessesEnricher({ ...ctx, presence: { ...ctx.presence, websiteStatus: 'none', missingContact: true } }, {});
assert(weak2.some((w) => w.id === 'no-website' && w.severity === 'major'), 'no-website major');
assert(weak2.some((w) => w.id === 'missing-contact' && w.severity === 'major'), 'missing-contact major');

const strengths = strengthsEnricher(raw.profile, raw.digital, ctx);
assert(strengths.some((s) => s.id === 'strong-business-score'), 'strength from business score');
assert(strengths.some((s) => s.id === 'social-proof'), 'strength from reviews');

assert(digitalPresenceScore({ websiteStatus: 'ok', googleBusiness: { present: true }, social: [{ platform: 'instagram' }], booking: '/x', menus: 1, reviews: 5, photos: 2 }) >= 60, 'digital presence score');
assert(digitalPresenceScore({ websiteStatus: 'none', googleBusiness: {}, social: [], booking: null, menus: 0, reviews: 0, photos: 0 }) === 0, 'no presence scores zero');

console.log(`=== DOSSIER UNIT: ${n} PASS, 0 FAIL ===`);
process.exit(0);
