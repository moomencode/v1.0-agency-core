import { Brain, BRAIN_EVENTS } from './index.js';
import { brnError, BRN_CODES } from './errors.js';
import { createExecutor } from '../runtime/executor.js';
import { EventBus } from '../runtime/eventBus.js';
import { Logger } from '../runtime/logger.js';

const PASS = [];
let n = 0;
function assert(cond, label, info = '') {
  n++;
  if (cond) { PASS.push(label); return; }
  throw new Error(`FAIL ${label} ${info}`);
}

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

const brain = new Brain();
const heard = [];
brain.bus = new EventBus(new Logger({ runId: 'brain-smoke', root: '.' }));
brain.bus.emitter.on('brain.decision_made', (ev) => heard.push(ev));

const result = await brain.runBusiness(recordOf());
assert(result.businessId === 'dis-biz-1', 'businessId returned');
assert(result.decision.verdict === 'APPROVE', 'strong business approved');
assert(result.policy.verdict === 'pass', 'policy pass');
assert(result.strategy.id === 'premium', 'premium strategy for strong record', result.strategy.id);
assert(result.route.ok === true, 'route proceeds');
assert(result.plan.ok === true, 'plan completes', JSON.stringify(result.plan.failure || ''));
assert(result.plan.currentStep === null, 'all steps ran');
assert(result.state === 'ARCHIVED', 'final state archived', result.state);
assert(result.trace.verdict === 'APPROVE', 'trace present');
assert(result.trace.chain.length >= 7, 'trace chain complete');
assert(result.context.businessId === 'dis-biz-1', 'context present');
assert(result.snapshot.businesses.discovered === 1, 'metrics discovered', String(result.snapshot.businesses.discovered));
assert(result.snapshot.businesses.approved === 1, 'metrics approved', String(result.snapshot.businesses.approved));
assert(heard.length === 1, 'decision event emitted', String(heard.length));
assert(heard[0].detail.verdict === 'APPROVE', 'event carries verdict');

const summary = brain.summarize(result);
assert(summary.verdict === 'APPROVE', 'summary verdict');
assert(summary.finalState === 'ARCHIVED', 'summary state');
assert(summary.planOk === true, 'summary planOk');
assert(summary.estimatedRevenue === result.decision.estimates.salesValue, 'summary revenue');

const det2 = await brain.runBusiness(recordOf());
function outputsOnly(results) {
  return JSON.stringify(results.map((r) => ({ stepId: r.stepId, action: r.action, state: r.state, ok: r.ok, attempts: r.attempts, output: r.output })));
}
assert(outputsOnly(det2.plan.results) === outputsOnly(result.plan.results), 'deterministic plan outputs');
assert(det2.decision.decisionId === result.decision.decisionId, 'deterministic decision id');

const rejected = await brain.runBusiness(recordOf({ scores: { business: { value: 30 }, opportunity: { value: 20 } } }));
assert(rejected.decision.verdict === 'REJECT', 'low opp rejected');
assert(rejected.route.ok === false, 'route blocked');
assert(rejected.plan === null, 'no plan for rejected');
assert(rejected.state === 'NEW', 'rejected stays NEW', rejected.state);
assert(rejected.snapshot.businesses.discovered === 3, 'discovered counts all runs');

const parked = await brain.runBusiness({ id: 'dis-ghost', name: 'Ghost', category: 'other' });
assert(parked.decision.verdict === 'REJECT', 'no-data + mandatory policy failures rejects', parked.decision.verdict);
assert(parked.decision.ruleResults.find((r) => r.ruleId === 'no-data').matched === true, 'no-data rule still traced');
assert(parked.plan === null, 'no plan for rejected ghost');

const escalated = await brain.runBusiness(recordOf({ weaknesses: [{ id: 'a', severity: 'major' }, { id: 'b', severity: 'major' }] }));
assert(escalated.decision.verdict === 'ESCALATE', 'risk escalates');
assert(escalated.route.escalated === true, 'escalated route flag');
assert(escalated.plan !== null, 'plan attempted for escalate');
assert(escalated.plan.ok === false, 'plan blocked at approval gate', JSON.stringify(escalated.plan.failure));
assert(escalated.plan.failure.includes('gate "decisionApprove" blocked'), 'gate failure message');
assert(escalated.state === 'ANALYZED' || escalated.state === 'ANALYZING', 'plan stopped after analysis', escalated.state);
assert(escalated.snapshot.businesses.approved === 2, 'only approved runs counted for approval', String(escalated.snapshot.businesses.approved));

const custom = new Brain({});
custom.registerExecutor('proposal', async () => ({ custom: true, ok: true }));
const customRun = await custom.runBusiness(recordOf());
assert(customRun.plan.ok === true, 'custom executor accepted');

const wf = await brain.executeWorkflow('does-not-exist', {});
assert(wf.status === 'unavailable', 'workflow unavailable without executor');

const realExecutor = await createExecutor({ runId: 'brain-integration' });
const wiredBrain = new Brain({ executor: realExecutor });
assert(wiredBrain.bus !== null, 'bus wired from executor');
assert(wiredBrain.validator !== null, 'validator wired from executor');
assert(wiredBrain.executor.workflowRunner !== null, 'workflow runner available');
const wf2 = await wiredBrain.executeWorkflow('no-such-workflow', {});
assert(wf2.status === 'unavailable', 'unregistered workflow unavailable');

let threw = false;
try { await brain.runBusiness(null); } catch (e) { threw = e.code === BRN_CODES.INVALID_RECORD; }
assert(threw, 'null record throws INVALID_RECORD');
threw = false;
try { await brain.runBusiness({ name: 'x' }); } catch (e) { threw = e.code === BRN_CODES.INVALID_RECORD; }
assert(threw, 'record without id throws INVALID_RECORD');

const all = await brain.runBusiness(recordOf({ scores: { business: { value: 85, breakdown: { presence: 30 } }, opportunity: { value: 91 } }, rating: 4.8, reviews: 800, presence: undefined }));
assert(all.strategy.id === 'premium', 'high score gets premium', all.strategy.id);

console.log(`=== BRAIN SMOKE: ${n} PASS, 0 FAIL ===`);
process.exit(0);
