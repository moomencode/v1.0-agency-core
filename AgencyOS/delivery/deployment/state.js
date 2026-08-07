import { deliveryError, DEL_CODES } from '../errors.js';

export const DEPLOY_STATES = [
  'created',
  'packaged',
  'awaiting_approval',
  'approved',
  'deploying',
  'deployed',
  'verified',
  'recorded',
  'simulated',
  'rejected',
  'failed',
  'rollback_requested',
  'rolling_back',
  'rolled_back',
  'revert_requested',
  'reverting',
  'reverted'
];

export const DEPLOY_EVENTS = {
  PACKAGED: 'PACKAGED',
  QA_PASS: 'QA_PASS',
  QA_FAIL: 'QA_FAIL',
  APPROVAL_NEEDED: 'APPROVAL_NEEDED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  DEPLOY_START: 'DEPLOY_START',
  DEPLOY_OK: 'DEPLOY_OK',
  DEPLOY_FAIL: 'DEPLOY_FAIL',
  VERIFY_OK: 'VERIFY_OK',
  VERIFY_FAIL: 'VERIFY_FAIL',
  RETRY: 'RETRY',
  RECORDED: 'RECORDED',
  SIMULATED: 'SIMULATED',
  ROLLBACK_START: 'ROLLBACK_START',
  ROLLBACK_OK: 'ROLLBACK_OK',
  REVERT_START: 'REVERT_START',
  REVERT_OK: 'REVERT_OK',
  ABORT: 'ABORT'
};

const TRANSITIONS = {
  created: {
    [DEPLOY_EVENTS.PACKAGED]: 'packaged',
    [DEPLOY_EVENTS.APPROVAL_NEEDED]: 'awaiting_approval',
    [DEPLOY_EVENTS.ABORT]: 'failed'
  },
  packaged: {
    [DEPLOY_EVENTS.APPROVED]: 'approved',
    [DEPLOY_EVENTS.APPROVAL_NEEDED]: 'awaiting_approval',
    [DEPLOY_EVENTS.SIMULATED]: 'simulated',
    [DEPLOY_EVENTS.ABORT]: 'failed'
  },
  awaiting_approval: {
    [DEPLOY_EVENTS.APPROVED]: 'approved',
    [DEPLOY_EVENTS.REJECTED]: 'rejected',
    [DEPLOY_EVENTS.ABORT]: 'failed'
  },
  approved: {
    [DEPLOY_EVENTS.DEPLOY_START]: 'deploying',
    [DEPLOY_EVENTS.ABORT]: 'failed'
  },
  deploying: {
    [DEPLOY_EVENTS.DEPLOY_OK]: 'deployed',
    [DEPLOY_EVENTS.DEPLOY_FAIL]: 'failed',
    [DEPLOY_EVENTS.RETRY]: 'deploying',
    [DEPLOY_EVENTS.ABORT]: 'failed'
  },
  deployed: {
    [DEPLOY_EVENTS.VERIFY_OK]: 'verified',
    [DEPLOY_EVENTS.VERIFY_FAIL]: 'failed',
    [DEPLOY_EVENTS.RETRY]: 'deployed',
    [DEPLOY_EVENTS.ROLLBACK_START]: 'rollback_requested',
    [DEPLOY_EVENTS.ABORT]: 'failed'
  },
  verified: {
    [DEPLOY_EVENTS.RECORDED]: 'recorded',
    [DEPLOY_EVENTS.ROLLBACK_START]: 'rollback_requested',
    [DEPLOY_EVENTS.ABORT]: 'failed'
  },
  recorded: {
    [DEPLOY_EVENTS.ROLLBACK_START]: 'rollback_requested',
    [DEPLOY_EVENTS.REVERT_START]: 'revert_requested'
  },
  rollback_requested: {
    [DEPLOY_EVENTS.ROLLBACK_OK]: 'rolled_back',
    [DEPLOY_EVENTS.ABORT]: 'failed'
  },
  rolled_back: {
    [DEPLOY_EVENTS.REVERT_START]: 'reverting',
    [DEPLOY_EVENTS.ROLLBACK_OK]: 'rolled_back'
  },
  revert_requested: {
    [DEPLOY_EVENTS.REVERT_OK]: 'reverted',
    [DEPLOY_EVENTS.ABORT]: 'failed'
  },
  reverting: {
    [DEPLOY_EVENTS.REVERT_OK]: 'reverted',
    [DEPLOY_EVENTS.ABORT]: 'failed'
  }
};

export const TERMINAL_STATES = new Set(['simulated', 'rejected', 'failed', 'recorded', 'rolled_back', 'reverted']);

export function assertState(state) {
  if (!DEPLOY_STATES.includes(state)) {
    throw deliveryError(DEL_CODES.BAD_STATE, `unknown deployment state "${state}"`, { state });
  }
  return state;
}

export function canTransition(from, event) {
  const targets = TRANSITIONS[from];
  return targets ? Boolean(targets[event]) : false;
}

export function applyTransition(record, event, { actor = 'system', note = null, mode = null } = {}) {
  const from = record.status;
  const targets = TRANSITIONS[from];
  const to = targets ? targets[event] : undefined;
  if (!to) {
    throw deliveryError(DEL_CODES.BAD_STATE, `cannot transition ${from} via ${event}`, { from, event });
  }
  record.status = to;
  record.timeline = record.timeline || [];
  record.timeline.push({
    event,
    from,
    to,
    at: new Date().toISOString(),
    actor,
    ...(note ? { note } : {}),
    ...(mode ? { mode } : {})
  });
  return record;
}
