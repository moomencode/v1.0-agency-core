export const STATES = {
  NEW: { label: 'New', allowed: ['DISCOVERED', 'FAILED', 'ARCHIVED'], timeoutMs: 3600000, timeoutAction: 'archive' },
  DISCOVERED: { label: 'Discovered', allowed: ['VALIDATED', 'FAILED', 'ARCHIVED'], timeoutMs: 3600000, timeoutAction: 'archive' },
  VALIDATED: { label: 'Validated', allowed: ['ANALYZED', 'FAILED', 'ARCHIVED'], timeoutMs: 3600000, timeoutAction: 'fail' },
  ANALYZED: { label: 'Analyzed', allowed: ['APPROVED', 'FAILED', 'ARCHIVED'], timeoutMs: 3600000, timeoutAction: 'fail' },
  APPROVED: { label: 'Approved', allowed: ['GENERATING', 'FAILED', 'ARCHIVED'], timeoutMs: 1800000, timeoutAction: 'retry' },
  GENERATING: { label: 'Generating', allowed: ['GENERATED', 'FAILED', 'RETRY'], timeoutMs: 7200000, timeoutAction: 'retry', rollback: [] },
  GENERATED: { label: 'Generated', allowed: ['QA', 'FAILED'], timeoutMs: 1800000, timeoutAction: 'fail', rollback: ['GENERATING'] },
  QA: { label: 'In QA', allowed: ['READY', 'RETRY', 'FAILED'], timeoutMs: 3600000, timeoutAction: 'retry', rollback: ['GENERATED'] },
  READY: { label: 'Ready', allowed: ['PROPOSAL', 'ARCHIVED'], timeoutMs: 86400000, timeoutAction: 'escalate', rollback: [] },
  PROPOSAL: { label: 'Proposal prepared', allowed: ['SENT', 'CLOSED', 'ARCHIVED'], timeoutMs: 86400000, timeoutAction: 'escalate', rollback: [] },
  SENT: { label: 'Proposal sent', allowed: ['FOLLOW_UP', 'CLIENT_RESPONSE', 'CLOSED', 'ARCHIVED'], timeoutMs: 172800000, timeoutAction: 'escalate', rollback: ['PROPOSAL'] },
  FOLLOW_UP: { label: 'Following up', allowed: ['SENT', 'CLIENT_RESPONSE', 'CLOSED', 'ARCHIVED'], timeoutMs: 172800000, timeoutAction: 'escalate', rollback: ['SENT'] },
  CLIENT_RESPONSE: { label: 'Client responded', allowed: ['PROPOSAL', 'SENT', 'CLOSED', 'ARCHIVED'], timeoutMs: 259200000, timeoutAction: 'escalate', rollback: ['PROPOSAL'] },
  CLOSED: { label: 'Closed', allowed: ['ARCHIVED'], timeoutMs: 0, timeoutAction: 'archive', rollback: [] },
  ARCHIVED: { label: 'Archived', allowed: [], timeoutMs: 0, timeoutAction: 'none', rollback: [] },
  FAILED: { label: 'Failed', allowed: ['RETRY', 'ARCHIVED'], timeoutMs: 86400000, timeoutAction: 'archive', rollback: [] },
  RETRY: { label: 'Retrying', allowed: ['GENERATING', 'QA', 'FAILED', 'ARCHIVED'], timeoutMs: 86400000, timeoutAction: 'fail', rollback: [] }
};

export const START_STATE = 'NEW';
export const END_STATES = ['ARCHIVED'];

export const TIMEOUT_ACTIONS = ['none', 'archive', 'fail', 'retry', 'escalate'];

export const FAILURE_RULES = {
  default: { maxRetries: 2, action: 'fail' },
  GENERATING: { maxRetries: 2, action: 'retry' },
  GENERATED: { maxRetries: 0, action: 'fail' },
  QA: { maxRetries: 2, action: 'retry' },
  APPROVED: { maxRetries: 1, action: 'retry' },
  SENT: { maxRetries: 3, action: 'follow_up' },
  FOLLOW_UP: { maxRetries: 3, action: 'follow_up' }
};

export function stateDef(state) {
  return STATES[state] || null;
}

export function failureRule(state) {
  return FAILURE_RULES[state] || FAILURE_RULES.default;
}
