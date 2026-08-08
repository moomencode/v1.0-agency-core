import { assert, runTests } from './helpers.mjs';
import {
  ORC_STATES,
  ORC_CAMPAIGN_STATES,
  ORC_EVENTS,
  TRANSITIONS,
  TERMINAL_STATES,
  RETRYABLE_STATES,
  RECOVERY_STATES,
  CAMPAIGN_TRANSITIONS,
  TERMINAL_CAMPAIGN_STATES,
  canTransition,
  applyOrcTransition,
  applyCampaignTransition,
  isTerminal,
  isRetryableState,
  isRecoverable
} from '../state/machine.js';
import { ORC_CODES, orcError } from '../errors.js';

const HAPPY_PATH = [
  ['CREATED', 'START', 'DISCOVERING'],
  ['DISCOVERING', 'DISCOVERED', 'QUALIFYING'],
  ['QUALIFYING', 'QUALIFIED', 'EVALUATING'],
  ['EVALUATING', 'DECIDED_APPROVE', 'APPROVED'],
  ['APPROVED', 'DOSSIER_START', 'DOSSIER_BUILDING'],
  ['DOSSIER_BUILDING', 'CONFIG_START', 'CONFIG_GENERATING'],
  ['CONFIG_GENERATING', 'SITE_START', 'SITE_RENDERING'],
  ['SITE_RENDERING', 'QA_START', 'QA_RUNNING'],
  ['QA_RUNNING', 'QA_PASSED', 'READY_FOR_DELIVERY'],
  ['READY_FOR_DELIVERY', 'DELIVERY_REQUESTED', 'AWAITING_APPROVAL'],
  ['AWAITING_APPROVAL', 'APPROVAL_GRANTED', 'DEPLOYING'],
  ['DEPLOYING', 'DEPLOYED', 'VERIFYING'],
  ['VERIFYING', 'VERIFIED', 'DEPLOYED']
];

const REJECT_PATHS = [
  ['EVALUATING', 'DECIDED_REJECT', 'REJECTED'],
  ['EVALUATING', 'DECIDED_PARK', 'ARCHIVED'],
  ['ESCALATED', 'APPROVAL_DENIED', 'REJECTED'],
  ['AWAITING_APPROVAL', 'APPROVAL_DENIED', 'REJECTED']
];

const QA_PATHS = [
  ['QA_RUNNING', 'QA_FAILED', 'QA_FAILED'],
  ['QA_FAILED', 'QA_OVERRIDDEN', 'READY_FOR_DELIVERY'],
  ['QA_FAILED', 'REJECTED', 'REJECTED'],
  ['QA_FAILED', 'RETRY', 'SITE_RENDERING']
];

const RETRY_PATHS = [
  ['DISCOVERING', 'RETRY', 'DISCOVERING'],
  ['DOSSIER_BUILDING', 'RETRY', 'DOSSIER_BUILDING'],
  ['CONFIG_GENERATING', 'RETRY', 'CONFIG_GENERATING'],
  ['SITE_RENDERING', 'RETRY', 'SITE_RENDERING'],
  ['QA_RUNNING', 'RETRY', 'QA_RUNNING'],
  ['DEPLOYING', 'RETRY', 'DEPLOYING']
];

const ROLLBACK_PATHS = [
  ['DEPLOYED', 'ROLLBACK_REQUESTED', 'ROLLED_BACK'],
  ['DEPLOYED', 'ARCHIVE', 'ARCHIVED'],
  ['REJECTED', 'ARCHIVE', 'ARCHIVED'],
  ['FAILED', 'ARCHIVE', 'ARCHIVED'],
  ['ROLLED_BACK', 'ARCHIVE', 'ARCHIVED']
];

const CAMPAIGN_PATHS = [
  ['DRAFT', 'QUEUE', 'QUEUED'],
  ['QUEUED', 'START', 'RUNNING'],
  ['RUNNING', 'PAUSE', 'PAUSED'],
  ['PAUSED', 'RESUME', 'RUNNING'],
  ['RUNNING', 'COMPLETE', 'COMPLETED'],
  ['QUEUED', 'STOP', 'STOPPED'],
  ['RUNNING', 'STOP', 'STOPPED'],
  ['RUNNING', 'LIMITS', 'LIMITS_REACHED'],
  ['QUEUED', 'DRAIN', 'DRAINING'],
  ['DRAINING', 'COMPLETE', 'COMPLETED'],
  ['PAUSED', 'COMPLETE', 'COMPLETED']
];

export const stateMachine = {
  'orchestrator states are complete': () => {
    assert(ORC_STATES.length === 20, `expected 20 states, got ${ORC_STATES.length}`);
    for (const s of ORC_STATES) assert(TRANSITIONS[s], `state ${s} must have a transitions entry`);
    assert(TERMINAL_STATES.has('DEPLOYED'));
    assert(TERMINAL_STATES.has('REJECTED'));
    assert(TERMINAL_STATES.has('FAILED'));
    assert(TERMINAL_STATES.has('ARCHIVED'));
    assert(TERMINAL_STATES.has('ROLLED_BACK'));
    assert(!TERMINAL_STATES.has('APPROVED'));
  },

  'happy path transitions are valid': () => {
    for (const [from, event, to] of HAPPY_PATH) {
      assert(TRANSITIONS[from][event] === to, `expected ${from} --${event}--> ${to}`);
      assert(canTransition(from, event), `canTransition(${from}, ${event})`);
      const ex = { status: from };
      applyOrcTransition(ex, event);
      assert(ex.status === to, `apply moved to ${ex.status}, expected ${to}`);
    }
  },

  'reject/park paths': () => {
    for (const [from, event, to] of REJECT_PATHS) {
      const ex = { status: from };
      applyOrcTransition(ex, event);
      assert(ex.status === to, `${from} --${event}--> ${to}`);
      assert(isTerminal(ex.status), `${to} must be terminal`);
    }
  },

  'qa failure and recovery paths': () => {
    for (const [from, event, to] of QA_PATHS) {
      const ex = { status: from };
      applyOrcTransition(ex, event);
      assert(ex.status === to);
    }
    assert(RECOVERY_STATES.has('QA_FAILED'));
    assert(RECOVERY_STATES.has('ESCALATED'));
    assert(RECOVERY_STATES.has('AWAITING_APPROVAL'));
  },

  'retry keeps step state': () => {
    for (const [from, event, to] of RETRY_PATHS) {
      const ex = { status: from };
      applyOrcTransition(ex, event);
      assert(ex.status === to);
      assert(isRetryableState(ex.status), `${ex.status} must be retryable`);
    }
  },

  'rollback and archive paths': () => {
    for (const [from, event, to] of ROLLBACK_PATHS) {
      const ex = { status: from };
      applyOrcTransition(ex, event);
      assert(ex.status === to);
    }
  },

  'invalid transitions throw STATE_INVALID': () => {
    const ex = { status: 'CREATED' };
    let threw = null;
    try {
      applyOrcTransition(ex, 'VERIFIED');
    } catch (err) {
      threw = err;
    }
    assert(threw && threw.code === ORC_CODES.STATE_INVALID, 'invalid transition must throw STATE_INVALID');
    assert(ex.status === 'CREATED', 'state must not change on invalid transition');
  },

  'FAIL is available from all non-terminal states': () => {
    for (const state of ORC_STATES) {
      if (TERMINAL_STATES.has(state)) continue;
      assert(TRANSITIONS[state].FAIL === 'FAILED', `state ${state} must support FAIL`);
    }
  },

  'campaign machine': () => {
    assert(ORC_CAMPAIGN_STATES.length === 8);
    for (const [from, event, to] of CAMPAIGN_PATHS) {
      const c = { state: from };
      applyCampaignTransition(c, event);
      assert(c.state === to, `${from} --${event}--> ${to} (got ${c.state})`);
    }
    assert(TERMINAL_CAMPAIGN_STATES.has('COMPLETED'));
    assert(TERMINAL_CAMPAIGN_STATES.has('STOPPED'));
    assert(TERMINAL_CAMPAIGN_STATES.has('LIMITS_REACHED'));
    assert(!TERMINAL_CAMPAIGN_STATES.has('RUNNING'));
  },

  'campaign invalid transition throws': () => {
    const c = { state: 'COMPLETED' };
    let threw = null;
    try {
      applyCampaignTransition(c, 'START');
    } catch (err) {
      threw = err;
    }
    assert(threw && threw.code === ORC_CODES.STATE_INVALID);
  },

  'isRecoverable covers recovery states': () => {
    for (const s of ['QA_FAILED', 'ESCALATED', 'AWAITING_APPROVAL']) {
      assert(isRecoverable({ status: s }), `${s} must be recoverable`);
    }
    assert(isRecoverable({ status: 'FAILED', error: { class: 'TRANSIENT' } }), 'transient failure must be recoverable');
    assert(isRecoverable({ status: 'FAILED', error: { class: 'SYSTEM' } }), 'system failure must be recoverable');
    assert(!isRecoverable({ status: 'FAILED', error: { class: 'BUSINESS' } }), 'business failure must not auto-recover');
    assert(!isRecoverable({ status: 'DEPLOYED' }));
    assert(!isRecoverable({ status: 'CREATED' }));
    assert(!isRecoverable(null));
  },

  'events namespace is consistent': () => {
    const events = Object.values(ORC_EVENTS);
    assert(events.includes('DISCOVERED'));
    assert(events.includes('DECIDED_ESCALATE'));
    assert(events.includes('QA_OVERRIDDEN'));
    assert(events.includes('VERIFIED'));
    assert(events.includes('ROLLBACK_REQUESTED'));
  }
};

async function main() {
  const ok = await runTests('state-machine', stateMachine);
  process.exit(ok ? 0 : 1);
}

main();
