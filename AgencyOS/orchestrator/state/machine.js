import { orcError, ORC_CODES } from '../errors.js';

export const ORC_STATES = [
  'CREATED',
  'DISCOVERING',
  'QUALIFYING',
  'EVALUATING',
  'ESCALATED',
  'APPROVED',
  'DOSSIER_BUILDING',
  'CONFIG_GENERATING',
  'SITE_RENDERING',
  'QA_RUNNING',
  'QA_FAILED',
  'READY_FOR_DELIVERY',
  'AWAITING_APPROVAL',
  'DEPLOYING',
  'VERIFYING',
  'DEPLOYED',
  'ROLLED_BACK',
  'REJECTED',
  'FAILED',
  'ARCHIVED'
];

export const ORC_CAMPAIGN_STATES = [
  'DRAFT',
  'QUEUED',
  'RUNNING',
  'PAUSED',
  'DRAINING',
  'COMPLETED',
  'STOPPED',
  'LIMITS_REACHED'
];

export const ORC_EVENTS = {
  START: 'START',
  RETRY: 'RETRY',
  DISCOVERED: 'DISCOVERED',
  QUALIFIED: 'QUALIFIED',
  DECIDED_APPROVE: 'DECIDED_APPROVE',
  DECIDED_REJECT: 'DECIDED_REJECT',
  DECIDED_ESCALATE: 'DECIDED_ESCALATE',
  DECIDED_PARK: 'DECIDED_PARK',
  APPROVAL_GRANTED: 'APPROVAL_GRANTED',
  APPROVAL_DENIED: 'APPROVAL_DENIED',
  DOSSIER_START: 'DOSSIER_START',
  CONFIG_START: 'CONFIG_START',
  SITE_START: 'SITE_START',
  QA_START: 'QA_START',
  QA_PASSED: 'QA_PASSED',
  QA_FAILED: 'QA_FAILED',
  QA_OVERRIDDEN: 'QA_OVERRIDDEN',
  REJECTED: 'REJECTED',
  DELIVERY_REQUESTED: 'DELIVERY_REQUESTED',
  DEPLOYED: 'DEPLOYED',
  VERIFIED: 'VERIFIED',
  FAIL: 'FAIL',
  ROLLBACK_REQUESTED: 'ROLLBACK_REQUESTED',
  ARCHIVE: 'ARCHIVE'
};

export const TRANSITIONS = {
  CREATED: { START: 'DISCOVERING', DISCOVERED: 'DISCOVERING', RETRY: 'CREATED', FAIL: 'FAILED' },
  DISCOVERING: { RETRY: 'DISCOVERING', DISCOVERED: 'QUALIFYING', FAIL: 'FAILED' },
  QUALIFYING: { QUALIFIED: 'EVALUATING', FAIL: 'FAILED' },
  EVALUATING: {
    DECIDED_APPROVE: 'APPROVED',
    DECIDED_REJECT: 'REJECTED',
    DECIDED_ESCALATE: 'ESCALATED',
    DECIDED_PARK: 'ARCHIVED',
    FAIL: 'FAILED'
  },
  ESCALATED: { APPROVAL_GRANTED: 'APPROVED', APPROVAL_DENIED: 'REJECTED', FAIL: 'FAILED', ARCHIVE: 'ARCHIVED' },
  APPROVED: { DOSSIER_START: 'DOSSIER_BUILDING', RETRY: 'APPROVED', FAIL: 'FAILED' },
  DOSSIER_BUILDING: { RETRY: 'DOSSIER_BUILDING', CONFIG_START: 'CONFIG_GENERATING', FAIL: 'FAILED' },
  CONFIG_GENERATING: { RETRY: 'CONFIG_GENERATING', SITE_START: 'SITE_RENDERING', FAIL: 'FAILED' },
  SITE_RENDERING: { RETRY: 'SITE_RENDERING', QA_START: 'QA_RUNNING', FAIL: 'FAILED' },
  QA_RUNNING: { QA_PASSED: 'READY_FOR_DELIVERY', QA_FAILED: 'QA_FAILED', RETRY: 'QA_RUNNING', FAIL: 'FAILED' },
  QA_FAILED: { QA_OVERRIDDEN: 'READY_FOR_DELIVERY', REJECTED: 'REJECTED', RETRY: 'SITE_RENDERING', FAIL: 'FAILED', ARCHIVE: 'ARCHIVED' },
  READY_FOR_DELIVERY: { DELIVERY_REQUESTED: 'AWAITING_APPROVAL', FAIL: 'FAILED' },
  AWAITING_APPROVAL: { APPROVAL_GRANTED: 'DEPLOYING', APPROVAL_DENIED: 'REJECTED', RETRY: 'AWAITING_APPROVAL', FAIL: 'FAILED', ARCHIVE: 'ARCHIVED' },
  DEPLOYING: { RETRY: 'DEPLOYING', DEPLOYED: 'VERIFYING', FAIL: 'FAILED' },
  VERIFYING: { VERIFIED: 'DEPLOYED', RETRY: 'VERIFYING', FAIL: 'FAILED' },
  DEPLOYED: { ROLLBACK_REQUESTED: 'ROLLED_BACK', ARCHIVE: 'ARCHIVED', FAIL: 'FAILED' },
  REJECTED: { ARCHIVE: 'ARCHIVED' },
  FAILED: { ARCHIVE: 'ARCHIVED' },
  ROLLED_BACK: { ARCHIVE: 'ARCHIVED' },
  ARCHIVED: {}
};

export const TERMINAL_STATES = new Set(['REJECTED', 'FAILED', 'ARCHIVED', 'DEPLOYED', 'ROLLED_BACK']);

export const RETRYABLE_STATES = new Set([
  'CREATED',
  'DISCOVERING',
  'APPROVED',
  'DOSSIER_BUILDING',
  'CONFIG_GENERATING',
  'SITE_RENDERING',
  'QA_RUNNING',
  'AWAITING_APPROVAL',
  'DEPLOYING',
  'VERIFYING'
]);

export const RECOVERY_STATES = new Set(['QA_FAILED', 'ESCALATED', 'AWAITING_APPROVAL', 'FAILED']);

export const CAMPAIGN_TRANSITIONS = {
  DRAFT: { QUEUE: 'QUEUED' },
  QUEUED: { START: 'RUNNING', STOP: 'STOPPED', DRAIN: 'DRAINING' },
  RUNNING: { PAUSE: 'PAUSED', DRAIN: 'DRAINING', COMPLETE: 'COMPLETED', STOP: 'STOPPED', LIMITS: 'LIMITS_REACHED' },
  PAUSED: { RESUME: 'RUNNING', STOP: 'STOPPED', COMPLETE: 'COMPLETED' },
  DRAINING: { COMPLETE: 'COMPLETED', STOP: 'STOPPED', LIMITS: 'LIMITS_REACHED' },
  COMPLETED: {},
  STOPPED: {},
  LIMITS_REACHED: {}
};

export const TERMINAL_CAMPAIGN_STATES = new Set(['COMPLETED', 'STOPPED', 'LIMITS_REACHED']);

export function canTransition(state, event) {
  const row = TRANSITIONS[state];
  return !!row && Object.prototype.hasOwnProperty.call(row, event);
}

export function applyOrcTransition(execution, event, meta = {}) {
  if (!canTransition(execution.status, event)) {
    throw orcError(ORC_CODES.STATE_INVALID, `cannot apply event ${event} to state ${execution.status}`, {
      from: execution.status,
      event,
      retryable: false
    });
  }
  const from = execution.status;
  const to = TRANSITIONS[from][event];
  execution.status = to;
  if (!Array.isArray(execution.timeline)) execution.timeline = [];
  execution.timeline.push({
    event,
    from,
    to,
    at: new Date().toISOString(),
    ...meta
  });
  return to;
}

export function applyCampaignTransition(campaign, event, meta = {}) {
  const row = CAMPAIGN_TRANSITIONS[campaign.state];
  if (!row || !Object.prototype.hasOwnProperty.call(row, event)) {
    throw orcError(ORC_CODES.STATE_INVALID, `cannot apply campaign event ${event} to state ${campaign.state}`, {
      from: campaign.state,
      event,
      retryable: false
    });
  }
  const from = campaign.state;
  campaign.state = row[event];
  if (!Array.isArray(campaign.timeline)) campaign.timeline = [];
  campaign.timeline.push({ event, from, to: campaign.state, at: new Date().toISOString(), ...meta });
  return campaign.state;
}

export function isTerminal(state) {
  return TERMINAL_STATES.has(state);
}

export function isRetryableState(state) {
  return RETRYABLE_STATES.has(state);
}

export function isRecoverable(execution) {
  if (!execution) return false;
  if (execution.status === 'FAILED') {
    return !!execution.error && ['TRANSIENT', 'SYSTEM'].includes(execution.error.class);
  }
  return RECOVERY_STATES.has(execution.status);
}
