import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExecutionPlanRunner } from './index.js';
import { StateMachine } from '../state-machine/index.js';
import { xplError, XPL_CODES } from './errors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const PASS = [];
let n = 0;
function assert(cond, label, info = '') {
  n++;
  if (cond) { PASS.push(label); return; }
  throw new Error(`FAIL ${label} ${info}`);
}

const defaultPlan = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans', 'default.json'), 'utf8'));
const runner = new ExecutionPlanRunner();
assert(runner.loadPlan(defaultPlan).steps.length === 11, 'default plan has 11 steps');
let threw = false;
try { runner.loadPlan({ steps: [] }); } catch (e) { threw = e.code === XPL_CODES.INVALID_PLAN; }
assert(threw, 'empty steps rejected');
threw = false;
try { runner.loadPlan({ steps: [{ id: 'a', action: 'x' }] }); } catch (e) { threw = e.code === XPL_CODES.INVALID_PLAN; }
assert(threw, 'step without state rejected');
threw = false;
try { runner.loadPlan({ steps: [{ id: 'a', action: 'x', state: 'S' }, { id: 'a', action: 'y', state: 'S' }] }); } catch (e) { threw = e.code === XPL_CODES.INVALID_PLAN; }
assert(threw, 'duplicate step ids rejected');

const sm = new StateMachine();
const inst = sm.create({ id: 'plan-run-1' });
const ctx = { policyVerdict: 'pass', decisionVerdict: 'APPROVE', businessId: 'biz-1' };
const run = await runner.run(defaultPlan, { stateMachine: sm, instance: inst, context: ctx });
assert(run.ok === true, 'default plan completes');
assert(run.results.length === 11, 'all steps recorded');
assert(run.state === 'ARCHIVED', 'ends archived');
assert(inst.current === 'ARCHIVED', 'instance archived');
assert(run.results.every((r) => r.ok === true), 'every step ok');
assert(run.results[0].action === 'discovery', 'first step discovery');
assert(run.results[5].action === 'website-generation' && run.results[5].output.pages >= 6, 'generation produced website');
assert(run.results[6].action === 'qa', 'qa step present');
const history = inst.history.map((h) => h.to);
assert(history.includes('GENERATING') && history.includes('GENERATED') && history.includes('QA'), 'intermediate states visited');

const blocked = await runner.run(defaultPlan, { stateMachine: sm, instance: sm.create({ id: 'plan-blocked' }), context: { policyVerdict: 'fail', decisionVerdict: 'REJECT', businessId: 'biz-2' } });
assert(blocked.ok === false, 'gate blocks plan');
assert(blocked.currentStep === 'validation', 'blocked at validation');
assert(blocked.results.length === 2, 'only first two steps attempted');
assert(blocked.results[1].ok === false, 'validation step failed');

let genCalls = 0;
const flaky = {
  'website-generation': async () => {
    genCalls++;
    if (genCalls <= 2) throw new Error('generator flake');
    return { website: 'ok', pages: 8 };
  }
};
const inst2 = sm.create({ id: 'plan-retry-1' });
const run2 = await runner.run(defaultPlan, { stateMachine: sm, instance: inst2, executors: flaky, context: { policyVerdict: 'pass', decisionVerdict: 'APPROVE', businessId: 'biz-3' } });
assert(run2.ok === true, 'flaky generator recovers via retry');
assert(genCalls === 3, 'generator called 3 times (2 failures + success)');
const genResult = run2.results.find((r) => r.action === 'website-generation');
assert(genResult.attempts === 3, 'attempts recorded');
assert(sm.attempts(inst2, 'GENERATING', 'RETRY') === 2, 'state machine saw 2 retries');

let always = 0;
const broken = {
  'website-generation': async () => { always++; throw new Error('always broken'); }
};
const inst3 = sm.create({ id: 'plan-exhaust-1' });
const run3 = await runner.run(defaultPlan, { stateMachine: sm, instance: inst3, executors: broken, context: { policyVerdict: 'pass', decisionVerdict: 'APPROVE', businessId: 'biz-4' } });
assert(run3.ok === false, 'persistent failure aborts plan');
assert(always === 3, '3 attempts for step retry max 2');
assert(inst3.current === 'FAILED', 'instance ends FAILED');

let qaCalls = 0;
const qaFlaky = {
  qa: async () => {
    qaCalls++;
    if (qaCalls === 1) throw new Error('qa issue');
    return { pass: true };
  }
};
const inst4 = sm.create({ id: 'plan-qa-retry' });
const run4 = await runner.run(defaultPlan, { stateMachine: sm, instance: inst4, executors: qaFlaky, context: { policyVerdict: 'pass', decisionVerdict: 'APPROVE', businessId: 'biz-5' } });
assert(run4.ok === true, 'qa retry recovers');
assert(qaCalls === 2, 'qa ran twice');
const qaStep = run4.results.find((r) => r.action === 'qa');
assert(qaStep.attempts === 2, 'qa attempts recorded');

const customRunner = new ExecutionPlanRunner({ gates: { customGate: (c) => c.flag === 7 } });
const customPlan = { id: 'custom', steps: [{ id: 'only', name: 'Only', action: 'analysis', state: 'ANALYZED', gate: 'customGate' }] };
const inst5 = sm.create({ id: 'plan-custom' });
const okRun = await customRunner.run(customPlan, { stateMachine: sm, instance: inst5, context: { flag: 7 } });
assert(okRun.ok === true && inst5.current === 'ANALYZED', 'custom gate passes');
const inst6 = sm.create({ id: 'plan-custom2' });
const badRun = await customRunner.run(customPlan, { stateMachine: sm, instance: inst6, context: { flag: 1 } });
assert(badRun.ok === false, 'custom gate blocks');

const unknownGateRun = await runner.run(customPlan, { stateMachine: sm, instance: sm.create({ id: 'x' }), context: { flag: 9 } });
assert(unknownGateRun.ok === false && /gate/i.test(unknownGateRun.failure || ''), 'unknown gate reported as failure');

const deterministic = await runner.run(defaultPlan, { stateMachine: sm, instance: sm.create({ id: 'plan-det' }), context: { policyVerdict: 'pass', decisionVerdict: 'APPROVE', businessId: 'biz-det' } });
const deterministic2 = await runner.run(defaultPlan, { stateMachine: sm, instance: sm.create({ id: 'plan-det2' }), context: { policyVerdict: 'pass', decisionVerdict: 'APPROVE', businessId: 'biz-det' } });
assert(JSON.stringify(deterministic.results.map((r) => r.output)) === JSON.stringify(deterministic2.results.map((r) => r.output)), 'same business produces identical outputs');

console.log(`=== EXECUTION PLANS SMOKE: ${n} PASS, 0 FAIL ===`);
process.exit(0);
