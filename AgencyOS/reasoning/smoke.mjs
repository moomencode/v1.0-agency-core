import { ReasoningEngine } from './index.js';
import { DecisionEngine } from '../decision-engine/index.js';
import { ContextEngine } from '../context/index.js';
import { rsnError, RSN_CODES } from './errors.js';

const PASS = [];
let n = 0;
function assert(cond, label, info = '') {
  n++;
  if (cond) { PASS.push(label); return; }
  throw new Error(`FAIL ${label} ${info}`);
}

const engine = new ReasoningEngine();
const ctxEngine = new ContextEngine();
const decEngine = new DecisionEngine();

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

const strongCtx = ctxEngine.build(recordOf());
const strongDec = decEngine.evaluate(strongCtx, { policies: new (await import('../policies/index.js')).PolicyEngine({ policies: [{ id: 'minOpp', kind: 'threshold', field: 'scores.opportunity', op: 'gte', value: 50, mandatory: true }] }) });
const trace = engine.trace(strongDec, strongCtx);
assert(trace.verdict === 'APPROVE', 'trace carries verdict');
assert(trace.businessId === 'dis-biz-1', 'trace businessId');
assert(trace.decisionId === strongDec.decisionId, 'trace decisionId');
assert(trace.headline.startsWith('Business dis-biz-1 approved'), 'headline');
assert(trace.influences.rule.includes('strong-demand'), 'influences rules');
assert(trace.influences.rule.includes('profitable'), 'profitable in influences');
assert(trace.influences.topRule === 'strong-demand', 'top rule first');
assert(trace.influences.risk === 'low', 'risk influence');
assert(trace.influences.policy.verdict === 'pass', 'policy influence');
assert(trace.influences.estimation.roi === strongDec.estimates.roi, 'estimation influence');
assert(trace.chain.length >= 7, 'chain has all steps', String(trace.chain.length));
assert(trace.chain[0].step === 'context', 'chain starts with context');
assert(trace.chain[trace.chain.length - 1].step === 'verdict', 'chain ends with verdict');
assert(trace.chain.some((s) => s.step === 'risk'), 'risk step present');
assert(trace.chain.some((s) => s.step === 'policy'), 'policy step present');
assert(trace.rationale.includes('Approved'), 'rationale prose');
assert(engine.explain(strongDec, strongCtx).includes('- verdict:'), 'explain prose includes chain');

const lowCtx = ctxEngine.build(recordOf({ scores: { business: { value: 30 }, opportunity: { value: 20 } } }));
const lowDec = decEngine.evaluate(lowCtx, { policies: new (await import('../policies/index.js')).PolicyEngine({ policies: [{ id: 'minOpp', kind: 'threshold', field: 'scores.opportunity', op: 'gte', value: 50, mandatory: true }] }) });
const lowTrace = engine.trace(lowDec, lowCtx);
assert(lowTrace.verdict === 'REJECT', 'reject trace');
assert(lowTrace.rationale.includes('mandatory polic'), 'reject rationale');
assert(lowTrace.influences.policy.verdict === 'fail', 'policy fail influence');

const riskCtx = ctxEngine.build(recordOf({ weaknesses: [{ id: 'x', severity: 'major' }, { id: 'y', severity: 'major' }] }));
const riskDec = decEngine.evaluate(riskCtx);
const riskTrace = engine.trace(riskDec, riskCtx);
assert(riskTrace.verdict === 'ESCALATE', 'escalate trace');
assert(riskTrace.rationale.includes('risk is high'), 'escalate rationale');
assert(riskTrace.influences.risk === 'high', 'risk high influence');

const parkCtx = ctxEngine.build({ id: 'dis-ghost', name: 'Ghost', category: 'other' });
const parkDec = decEngine.evaluate(parkCtx);
const parkTrace = engine.trace(parkDec, parkCtx);
assert(parkTrace.verdict === 'PARK', 'park trace');
assert(parkTrace.rationale.includes('no-data'), 'park rationale');

const t2 = engine.trace(strongDec, strongCtx);
assert(JSON.stringify(t2.chain) === JSON.stringify(trace.chain), 'deterministic chain');
assert(t2.headline === trace.headline, 'deterministic headline');

let threw = false;
try { engine.trace(null, strongCtx); } catch (e) { threw = e.code === RSN_CODES.MISSING_DECISION; }
assert(threw, 'null decision throws MISSING_DECISION');
threw = false;
try { engine.trace(strongDec, null); } catch (e) { threw = e.code === RSN_CODES.MISSING_CONTEXT; }
assert(threw, 'null context throws MISSING_CONTEXT');

console.log(`=== REASONING SMOKE: ${n} PASS, 0 FAIL ===`);
process.exit(0);
