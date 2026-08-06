import { StateMachine, STATES } from './index.js';
import { stmError, STM_CODES } from './errors.js';

const PASS = [];
let n = 0;
function assert(cond, label, info = '') {
  n++;
  if (cond) { PASS.push(label); return; }
  throw new Error(`FAIL ${label} ${info}`);
}

const sm = new StateMachine();
assert(sm.states().length === 17, '17 states defined', JSON.stringify(sm.states()));
assert(sm.states().every((s) => sm.stateInfo(s)), 'every state has a def');
assert(sm.states().includes('ARCHIVED') && sm.states().includes('FAILED') && sm.states().includes('RETRY'), 'terminal states present');

const inst = sm.create({ id: 'stm-test-1' });
assert(inst.current === 'NEW', 'instance starts at NEW');
assert(inst.history.length === 1, 'initial history entry');
assert(sm.canTransition('NEW', 'DISCOVERED'), 'NEW can go DISCOVERED');
assert(sm.canTransition('NEW', 'FAILED'), 'NEW can go FAILED');
assert(!sm.canTransition('NEW', 'ARCHIVED') === false, 'NEW -> ARCHIVED allowed');
assert(!sm.canTransition('DISCOVERED', 'APPROVED'), 'no skipping VALIDATED');
assert(!sm.canTransition('CLOSED', 'SENT'), 'terminal progression blocked');
assert(sm.transitions('GENERATING').includes('GENERATED'), 'transitions list');

sm.transition(inst, 'DISCOVERED', { by: 'brain', reason: 'found' });
sm.transition(inst, 'VALIDATED');
sm.transition(inst, 'ANALYZED');
sm.transition(inst, 'APPROVED');
assert(inst.current === 'APPROVED', 'happy path to APPROVED');
assert(sm.summary(inst).transitions === 4, 'transition count');
assert(inst.attempts['NEW>DISCOVERED'] === 1, 'attempts tracked');
let threw = false;
try { sm.transition(inst, 'QA'); } catch (e) { threw = e.code === STM_CODES.ILLEGAL_TRANSITION; }
assert(threw, 'illegal transition throws ILLEGAL_TRANSITION');
threw = false;
try { sm.transition(inst, 'NOWHERE'); } catch (e) { threw = e.code === STM_CODES.UNKNOWN_STATE; }
assert(threw, 'unknown target throws UNKNOWN_STATE');

const guard = sm.create({ id: 'stm-guard' });
let guarded = false;
try { sm.transition(guard, 'DISCOVERED', { guard: () => false }); } catch (e) { guarded = e.code === STM_CODES.ILLEGAL_TRANSITION; }
assert(guarded, 'guard can reject transition');
sm.transition(guard, 'DISCOVERED', { guard: () => true });
assert(guard.current === 'DISCOVERED', 'guard pass allows transition');

const retry = sm.create({ id: 'stm-retry' });
sm.transition(retry, 'DISCOVERED');
sm.transition(retry, 'VALIDATED');
sm.transition(retry, 'ANALYZED');
sm.transition(retry, 'APPROVED');
sm.transition(retry, 'GENERATING');
const failed = sm.fail(retry, { reason: 'generator error', retryable: true });
assert(failed.current === 'RETRY', 'GENERATING failure retries once');
assert(sm.attempts(retry, 'GENERATING', 'RETRY') === 1, 'retry attempt counted');
sm.retryTo(retry, 'GENERATING', { reason: 'retry now' });
assert(retry.current === 'GENERATING', 'RETRY -> GENERATING');
sm.transition(retry, 'GENERATED');
sm.transition(retry, 'QA');
sm.transition(retry, 'READY');
assert(retry.current === 'READY', 'full happy path');

const exhaust = sm.create({ id: 'stm-exhaust' });
for (const s of ['DISCOVERED', 'VALIDATED', 'ANALYZED', 'APPROVED', 'GENERATING']) sm.transition(exhaust, s);
sm.fail(exhaust, { reason: 'fail 1' });
sm.retryTo(exhaust, 'GENERATING');
sm.fail(exhaust, { reason: 'fail 2' });
sm.retryTo(exhaust, 'GENERATING');
sm.fail(exhaust, { reason: 'fail 3' });
assert(exhaust.current === 'FAILED', 'retries exhausted -> FAILED');

const nonRetry = sm.create({ id: 'stm-nonretry' });
for (const s of ['DISCOVERED', 'VALIDATED', 'ANALYZED', 'APPROVED', 'GENERATING', 'GENERATED']) sm.transition(nonRetry, s);
sm.fail(nonRetry, { reason: 'bad generated artifact' });
assert(nonRetry.current === 'FAILED', 'GENERATED failure goes straight to FAILED');

const roll = sm.create({ id: 'stm-roll' });
for (const s of ['DISCOVERED', 'VALIDATED', 'ANALYZED', 'APPROVED', 'GENERATING', 'GENERATED', 'QA']) sm.transition(roll, s);
const rolled = sm.rollback(roll, 'GENERATED', { reason: 'qa found issue' });
assert(rolled.current === 'GENERATED', 'QA rollback to GENERATED');
threw = false;
try { sm.rollback(roll, 'ANALYZED'); } catch (e) { threw = e.code === STM_CODES.ILLEGAL_TRANSITION; }
assert(threw, 'deep rollback rejected');

const timed = sm.create({ id: 'stm-timeout' });
sm.transition(timed, 'DISCOVERED');
sm.applyTimeout(timed, 0);
assert(timed.current === 'DISCOVERED', 'no timeout when elapsed < limit');
sm.applyTimeout(timed, 7200000);
assert(timed.current === 'ARCHIVED', 'DISCOVERED timeout archives');
assert(timed.timeoutTriggered === true, 'timeout flagged');

const esc = sm.create({ id: 'stm-esc' });
for (const s of ['DISCOVERED', 'VALIDATED', 'ANALYZED', 'APPROVED', 'GENERATING', 'GENERATED', 'QA', 'READY', 'PROPOSAL']) sm.transition(esc, s);
sm.applyTimeout(esc, 2 * 86400000);
assert(esc.current === 'PROPOSAL', 'escalate keeps state');
assert(esc.escalation.length === 1 && esc.escalation[0].from === 'PROPOSAL', 'escalation recorded');

const failedArch = sm.create({ id: 'stm-failarch' });
for (const s of ['DISCOVERED', 'VALIDATED', 'ANALYZED', 'APPROVED', 'GENERATING']) sm.transition(failedArch, s);
sm.fail(failedArch); sm.retryTo(failedArch, 'GENERATING'); sm.fail(failedArch); sm.retryTo(failedArch, 'GENERATING'); sm.fail(failedArch);
assert(failedArch.current === 'FAILED', 'failed state reached');
sm.applyTimeout(failedArch, 2 * 86400000);
assert(failedArch.current === 'ARCHIVED', 'FAILED timeout archives');

const closed = sm.create({ id: 'stm-closed' });
for (const s of ['DISCOVERED', 'VALIDATED', 'ANALYZED', 'APPROVED', 'GENERATING', 'GENERATED', 'QA', 'READY', 'PROPOSAL', 'SENT', 'CLIENT_RESPONSE', 'CLOSED']) sm.transition(closed, s);
assert(closed.current === 'CLOSED', 'deal closed path');
sm.transition(closed, 'ARCHIVED');
assert(closed.current === 'ARCHIVED', 'archived after close');

const summary = sm.summary(closed);
assert(summary.transitions === 13 && summary.updatedAt, 'summary complete');
assert(JSON.stringify(sm.states()) === JSON.stringify(Object.keys(STATES)), 'states() order matches defs');
let invalid = false;
try { sm.transition(null, 'ARCHIVED'); } catch (e) { invalid = e.code === STM_CODES.INVALID_INSTANCE; }
assert(invalid, 'null instance rejected');

const happy = sm.create({ id: 'stm-happy' });
for (const s of ['DISCOVERED', 'VALIDATED', 'ANALYZED', 'APPROVED', 'GENERATING', 'GENERATED', 'QA', 'READY', 'PROPOSAL', 'SENT', 'FOLLOW_UP', 'CLIENT_RESPONSE', 'CLOSED', 'ARCHIVED']) sm.transition(happy, s);
assert(happy.current === 'ARCHIVED', 'complete lifecycle ends ARCHIVED');

console.log(`=== STATE MACHINE SMOKE: ${n} PASS, 0 FAIL ===`);
process.exit(0);
