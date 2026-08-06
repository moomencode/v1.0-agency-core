import { PlannerEngine } from './index.js';
import { StrategyEngine } from '../strategy/index.js';
import { plrError, PLR_CODES } from './errors.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_STRATEGIES = JSON.parse(readFileSync(join(__dirname, '..', 'strategy', 'strategies', 'default.json'), 'utf8'));

const PASS = [];
let n = 0;
function assert(cond, label, info = '') {
  n++;
  if (cond) { PASS.push(label); return; }
  throw new Error(`FAIL ${label} ${info}`);
}

const planner = new PlannerEngine();
const strategies = new StrategyEngine({ strategies: DEFAULT_STRATEGIES.strategies });

assert(planner.resolve('premium') === 'default', 'premium hint maps to default');
assert(planner.resolve('standard') === 'default', 'standard hint maps to default');
assert(planner.resolve('light') === 'default', 'light hint maps to default');
assert(planner.resolve('unknown-hint') === 'default', 'unknown hint falls back');
assert(planner.resolve(null) === 'default', 'null hint falls back');
assert(planner.resolve(undefined) === 'default', 'undefined hint falls back');

const premium = strategies.select({ business: 80, opportunity: 85, presence: 70, brandQuality: 0.5, reviews: 200, rating: 4.5, social: 0.4, contactComplete: true, hasWhatsapp: true, websiteStatus: 'none', seo: false, sourceCount: 3, weaknesses: [], estimates: { roi: 2, closingProbability: 0.9 } });
assert(premium.id === 'premium', 'strategy select picks premium');
assert(planner.pick(premium) === 'default', 'pick from strategy');

const plan = planner.planFor('default');
assert(plan.id === 'default', 'plan loads');
assert(plan.steps.length === 11, '11 steps', String(plan.steps.length));
assert(plan.steps[0].id === 'discovery', 'first step discovery');

let threw = false;
try { planner.planFor('nope'); } catch (e) { threw = e.code === PLR_CODES.UNKNOWN_PLAN; }
assert(threw, 'unknown plan throws UNKNOWN_PLAN');

const decision = { decisionId: 'dec-x', businessId: 'dis-biz-1', verdict: 'APPROVE' };
const policySummary = { verdict: 'pass', mandatoryFailed: 0, summary: 'all policies satisfied', reasons: [] };
const gc = planner.gateContext(decision, { summary: policySummary });
assert(gc.policyVerdict === 'pass', 'gate policyVerdict');
assert(gc.decisionVerdict === 'APPROVE', 'gate decisionVerdict');
assert(gc.businessId === 'dis-biz-1', 'gate businessId');
assert(gc.decisionId === 'dec-x', 'gate decisionId');

const gcNoPolicies = planner.gateContext(decision, null);
assert(gcNoPolicies.policyVerdict === 'pass', 'no policies defaults to pass');

const gates = planner.expectedGates(plan);
assert(gates.length === 2, 'two gated steps', String(gates.length));
assert(gates[0].stepId === 'validation' && gates[0].gate === 'policiesPass', 'validation gate');
assert(gates[1].stepId === 'approval' && gates[1].gate === 'decisionApprove', 'approval gate');

const sel = planner.select(premium, decision, { summary: policySummary });
assert(sel.planId === 'default', 'select planId');
assert(sel.gateContext.decisionVerdict === 'APPROVE', 'select gate context');
assert(sel.expectedGates.length === 2, 'select expected gates');

assert(planner.proceed({ verdict: 'APPROVE' }).ok === true, 'proceed approve');
assert(planner.proceed({ verdict: 'ESCALATE' }).ok === true, 'proceed escalate');
assert(planner.proceed({ verdict: 'ESCALATE' }).escalated === true, 'escalate flagged');
assert(planner.proceed({ verdict: 'PARK' }).ok === false, 'proceed park blocked');
assert(planner.proceed({ verdict: 'REJECT' }).ok === false, 'proceed reject blocked');

threw = false;
try { planner.proceed({}); } catch (e) { threw = e.code === PLR_CODES.NO_DECISION; }
assert(threw, 'proceed without verdict throws NO_DECISION');

const custom = new PlannerEngine({ catalog: { defaultPlan: 'main', hints: { premium: 'main' } }, plans: { main: { id: 'main', steps: [{ id: 'a', action: 'discovery', state: 'DISCOVERED' }] } } });
assert(custom.resolve('premium') === 'main', 'custom catalog');
assert(custom.planFor('main').steps.length === 1, 'custom plan');
assert(custom.planFor('main').id === 'main', 'custom plan id');
assert(custom.planFor('default').id === 'default', 'default plan still available');

const c2 = new PlannerEngine();
const s2 = c2.select(strategies.select({ business: 10, opportunity: 10, presence: 5, brandQuality: 0.1, reviews: 0, rating: 0, social: 0, contactComplete: false, hasWhatsapp: false, websiteStatus: 'none', seo: false, sourceCount: 1, weaknesses: [], estimates: { roi: 0, closingProbability: 0 } }), decision, null);
assert(s2.planId === 'default', 'light strategy still routes to default');

console.log(`=== PLANNER SMOKE: ${n} PASS, 0 FAIL ===`);
process.exit(0);
