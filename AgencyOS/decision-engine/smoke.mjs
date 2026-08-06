import { DecisionEngine } from './index.js';
import { ContextEngine } from '../context/index.js';
import { PolicyEngine } from '../policies/index.js';
import { decError, DEC_CODES } from './errors.js';

const PASS = [];
let n = 0;
function assert(cond, label, info = '') {
  n++;
  if (cond) { PASS.push(label); return; }
  throw new Error(`FAIL ${label} ${info}`);
}

const engine = new DecisionEngine();
const ctxEngine = new ContextEngine();
const policies = new PolicyEngine({
  policies: [
    { id: 'minOpp', kind: 'threshold', field: 'scores.opportunity', op: 'gte', value: 50, mandatory: true },
    { id: 'noClosed', kind: 'ignore', flag: 'flags.closed', expect: false, mandatory: true }
  ]
});

function recordOf(overrides = {}) {
  return {
    id: 'dis-biz-1', name: 'Cairo Roastery', category: 'cafe', area: 'Cairo',
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

const strong = ctxEngine.build(recordOf());
const policyResult = policies.evaluate(strong);
const dec = engine.evaluate(strong, { policies });
assert(dec.verdict === 'APPROVE', 'strong business approved');
assert(dec.businessId === 'dis-biz-1', 'businessId carried');
assert(dec.risk.level === 'low', 'low risk');
assert(dec.confidence >= 0.7, 'high confidence', String(dec.confidence));
assert(dec.estimates.devCost > 900 && dec.estimates.devCost <= 25000, 'dev cost range');
assert(dec.estimates.salesValue >= 3500, 'high sales value', String(dec.estimates.salesValue));
assert(dec.estimates.roi > 0.5, 'positive ROI', String(dec.estimates.roi));
assert(dec.estimates.closingProbability > 0.5, 'decent closing probability');
assert(dec.estimates.pages >= 6 && dec.estimates.pages <= 12, 'pages estimate');
assert(dec.priority.opportunity.tier === 'high', 'opportunity priority high');
assert(dec.priority.resource.tier === 'high', 'resource priority high');
assert(dec.priority.business.tier === 'medium', 'business priority medium (69)');
assert(dec.priority.execution.tier === 'high', 'execution priority high');
assert(dec.qualificationScore > 3, 'qualification score', String(dec.qualificationScore));
assert(dec.ruleResults.length === 8, 'all rules evaluated', String(dec.ruleResults.length));
assert(dec.ruleResults.filter((r) => r.matched).some((r) => r.ruleId === 'strong-demand'), 'strong-demand matched');
assert(dec.ruleResults.filter((r) => r.matched).some((r) => r.ruleId === 'profitable'), 'profitable matched');
assert(dec.policySummary.verdict === 'pass', 'policy summary pass');
assert(policyResult.verdict === 'pass', 'policy engine agrees');

const rejected = engine.evaluate(ctxEngine.build(recordOf({ scores: { business: { value: 30 }, opportunity: { value: 20 } } })), { policies });
assert(rejected.verdict === 'REJECT', 'low opportunity rejected by policy');
assert(rejected.ruleResults.find((r) => r.ruleId === 'policy-blocked').matched === true, 'policy-blocked rule matched');
assert(rejected.policySummary.verdict === 'fail', 'policy summary fail');

const risky = engine.evaluate(ctxEngine.build(recordOf({ weaknesses: [{ id: 'x', severity: 'major' }, { id: 'y', severity: 'major' }, { id: 'z', severity: 'minor' }] })));
assert(risky.verdict === 'ESCALATE', 'high risk escalates');
assert(risky.risk.level === 'high', 'risk high');
assert(risky.risk.reason.includes('major'), 'risk reason mentions majors');

const parked = engine.evaluate(ctxEngine.build({ id: 'dis-ghost', name: 'Ghost', category: 'other' }));
assert(parked.verdict === 'PARK', 'no-data parks');
assert(parked.estimates.closingProbability === 0.15, 'minimal closing probability', String(parked.estimates.closingProbability));

const broken = engine.evaluate(ctxEngine.build(recordOf({ website: 'https://x.example', probe: { ok: false, status: 500 } })));
assert(broken.risk.level === 'medium', 'broken website medium risk');
assert(broken.risk.reason.includes('broken'), 'risk reason');
assert(broken.estimates.closingProbability < dec.estimates.closingProbability, 'broken site lowers closing');

const cold = engine.evaluate(ctxEngine.build(recordOf({ rating: 3.1, reviews: 12, phone: null, email: null, address: null, whatsapp: null })));
assert(cold.confidence < strongConfidence(dec) , 'sparse data lowers confidence');

const det2 = engine.evaluate(ctxEngine.build(recordOf()));
assert(JSON.stringify(det2.estimates) === JSON.stringify(dec.estimates), 'deterministic estimates');
assert(det2.decisionId === dec.decisionId, 'deterministic decision id');

const withoutPolicies = engine.evaluate(ctxEngine.build(recordOf()));
assert(withoutPolicies.verdict === 'APPROVE', 'works without policies');
assert(withoutPolicies.policySummary === null, 'no policy summary when none given');

const noPoliciesButLow = engine.evaluate(ctxEngine.build(recordOf({ scores: { business: { value: 10 }, opportunity: { value: 10 } } })));
assert(noPoliciesButLow.verdict === 'APPROVE', 'approve when no policies configured');

let threw = false;
try { engine.evaluate(null); } catch (e) { threw = e.code === DEC_CODES.INVALID_CONTEXT; }
assert(threw, 'null context throws INVALID_CONTEXT');
threw = false;
try { engine.evaluate({ name: 'x' }); } catch (e) { threw = e.code === DEC_CODES.INVALID_CONTEXT; }
assert(threw, 'context without businessId throws');

function strongConfidence(d) { return d.confidence; }

console.log(`=== DECISION ENGINE SMOKE: ${n} PASS, 0 FAIL ===`);
process.exit(0);
