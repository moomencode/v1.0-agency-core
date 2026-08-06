import { ContextEngine } from './index.js';
import { ctxError, CTX_CODES } from './errors.js';

const PASS = [];
let n = 0;
function assert(cond, label, info = '') {
  n++;
  if (cond) { PASS.push(label); return; }
  throw new Error(`FAIL ${label} ${info}`);
}

const record = {
  id: 'dis-abc123', name: 'Cairo Roastery', category: 'cafe', area: 'Cairo',
  phone: '2027357788', email: 'hi@roastery.com', whatsapp: '201000000001',
  instagram: 'https://instagram.com/roastery', facebook: 'https://facebook.com/roastery',
  address: '12 Tahrir St', photos: ['a', 'b', 'c'], menus: [{}, {}], booking: '/reservation',
  rating: 4.2, reviews: 230,
  website: 'https://roastery.example', probe: { ok: true, timeMs: 400 },
  sources: ['simulated', 'website'],
  weaknesses: [{ id: 'no-booking', severity: 'minor' }, { id: 'missing-seo', severity: 'major' }],
  scores: { business: { value: 69, breakdown: { presence: 20 } }, opportunity: { value: 77 } }
};

const engine = new ContextEngine();
const ctx = engine.build(record);
assert(ctx.businessId === 'dis-abc123', 'businessId carried over');
assert(ctx.scores.business === 69 && ctx.scores.opportunity === 77, 'scores extracted');
assert(ctx.scores.presence === 20, 'presence from breakdown');
assert(ctx.presence.websiteStatus === 'ok', 'website status ok');
assert(ctx.presence.seoPresent === false, 'missing-seo weakness => seoPresent false');
assert(ctx.presence.contactComplete === true, 'contact complete (phone+email)');
assert(ctx.presence.hasWhatsapp === true, 'whatsapp detected');
assert(ctx.presence.hasBooking === true, 'booking detected');
assert(ctx.presence.socialActivity > 0.5, 'social activity high', JSON.stringify(ctx.presence.socialActivity));
assert(ctx.presence.brandQuality > 0.7, 'brand quality high');
assert(ctx.weaknesses.length === 2 && ctx.weaknessMajor === 1 && ctx.weaknessMinor === 1, 'weakness counts');
assert(ctx.flags.closed === false && ctx.flags.duplicate === false && ctx.flags.premiumWebsite === false, 'default flags');
assert(ctx.flags.missingContact === false, 'not missing contact');
assert(ctx.sourceCount === 2, 'source count deduped');

const broken = engine.build({ ...record, website: 'https://x.example', probe: { ok: false, status: 500 } });
assert(broken.presence.websiteStatus === 'broken', 'broken website status');
const slow = engine.build({ ...record, probe: { ok: true, timeMs: 4200 } });
assert(slow.presence.websiteStatus === 'slow', 'slow website status');
const none = engine.build({ ...record, website: null, probe: null });
assert(none.presence.websiteStatus === 'none', 'no website status');
assert(none.scores.presence === 20, 'presence falls back to recorded breakdown');

const sparse = engine.build({ id: 'x1', name: 'Ghost Shop', category: 'other' });
assert(sparse.presence.missingContact === true, 'missing contact flag');
assert(sparse.presence.contactComplete === false, 'contact incomplete');
assert(sparse.flags.missingContact === true, 'missing contact flag mirrored');
assert(sparse.presence.socialActivity === 0, 'zero social activity');
assert(sparse.presence.brandQuality === 0, 'zero brand quality');
assert(sparse.scores.rating === 0 && sparse.scores.reviews === 0, 'zero rating/reviews');
assert(sparse.weaknessCount === 0, 'zero weaknesses');

const flagged = engine.build({ ...record, closed: true, duplicate: true, premiumWebsite: true });
assert(flagged.flags.closed && flagged.flags.duplicate && flagged.flags.premiumWebsite, 'flags from record');

const tags = engine.build({ ...record }, { tags: ['retail'] });
assert(tags.tags[0] === 'retail', 'extras honored');
const noId = engine.build({ name: 'No Id Shop' }, { businessId: 'brn-extra-id', tags: ['x'] });
assert(noId.businessId === 'brn-extra-id', 'extras businessId used when record has no id');

let threw = false;
try { engine.build(null); } catch (e) { threw = e.code === CTX_CODES.INVALID_RECORD; }
assert(threw, 'build(null) throws INVALID_RECORD');
threw = false;
try { engine.build('nope'); } catch (e) { threw = e.code === CTX_CODES.INVALID_RECORD; }
assert(threw, 'build(string) throws INVALID_RECORD');

const merged = engine.merge({ a: 1 }, { b: 2 });
assert(merged.a === 1 && merged.b === 2, 'merge combines');

const v = new ContextEngine({ validator: true });
assert(v.validate(ctx).valid === true, 'no-op validator accepts (truthy config)' );

console.log(`=== CONTEXT SMOKE: ${n} PASS, 0 FAIL ===`);
process.exit(0);
