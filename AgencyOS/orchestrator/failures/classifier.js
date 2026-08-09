import { ORC_CODES, orcError, failureOf } from '../errors.js';

const TRANSIENT_CODES = new Set([
  'E_TR_RATE_LIMITED',
  'E_TR_NETWORK',
  'E_TR_TIMEOUT',
  'E_TR_UNKNOWN',
  'E_ORC_LOCK_CONFLICT',
  'E_ORC_TRANSIENT'
]);

const POLICY_CODES = new Set([
  'E_ORC_LIMIT_REACHED',
  'E_ORC_LIMITS_REACHED',
  'E_DEL_APPROVAL_REQUIRED',
  'E_DEL_APPROVAL_NOT_PENDING',
  'E_DEL_AUTO_DISABLED',
  'E_DEL_BAD_MODE'
]);

const VALIDATION_CODES = new Set([
  'E_DEL_SCHEMA_INVALID',
  'E_DEL_CONFIG_INVALID',
  'E_DEL_SECRET_MISSING',
  'E_DEL_SECRET_SCAN_FAILED',
  'E_ORC_SCHEMA_INVALID',
  'E_ORC_SECRET_DETECTED',
  'E_ORC_CAMPAIGN_INVALID',
  'PIP_INVALID_DOSSIER',
  'PIP_SCHEMA_INVALID',
  'DOS_INVALID_INPUT',
  'DOS_INVALID_DOSSIER',
  'DIS_QUERY_INVALID',
  'DIS_RECORD_INVALID',
  'WEB_SCHEMA_INVALID',
  'BRN_INVALID_RECORD',
  'CTX_INVALID_RECORD',
  'CTX_INVALID_CONTEXT',
  'ORC_SCHEMA_INVALID'
]);

const BUSINESS_CODES = new Set([
  'E_DEL_PROVIDER_ERROR',
  'E_DEL_PROVIDER_UNKNOWN',
  'E_DEL_PACKAGE_MISSING',
  'E_DEL_UNKNOWN_BUILD',
  'E_DEL_UNKNOWN_RECORD',
  'E_DEL_QA_FAILED',
  'E_DEL_ROLLBACK_INVALID',
  'E_ORC_BUSINESS'
]);

const SYSTEM_CODES = new Set([
  'E_ORC_KILL_SWITCH',
  'E_ORC_EMERGENCY_STOP',
  'E_ORC_HALTED',
  'E_ORC_SYSTEM',
  'E_ORC_STATE_INVALID'
]);

export function classifyError(err, { phase = null } = {}) {
  const code = (err && err.code) || ORC_CODES.UNKNOWN;
  const message = (err && err.message) || 'unknown error';
  const meta = (err && err.meta) || {};

  let cls;
  if (TRANSIENT_CODES.has(code)) cls = 'TRANSIENT';
  else if (POLICY_CODES.has(code)) cls = 'POLICY';
  else if (VALIDATION_CODES.has(code)) cls = 'VALIDATION';
  else if (BUSINESS_CODES.has(code)) cls = 'BUSINESS';
  else if (SYSTEM_CODES.has(code)) cls = 'SYSTEM';
  else if (meta.retryable === true) cls = 'TRANSIENT';
  else if (code.startsWith('E_TR_')) cls = 'TRANSIENT';
  else cls = 'SYSTEM';

  if (err && typeof err.retryable === 'boolean' && err.retryable === false && cls === 'TRANSIENT' && TRANSIENT_CODES.has(code)) {
    cls = 'SYSTEM';
  }

  return {
    class: cls,
    code,
    message,
    attempts: meta.attempts ?? null,
    at: new Date().toISOString(),
    phase: phase || null,
    retryable: cls === 'TRANSIENT'
  };
}

export function toOrcError(classified) {
  const codeMap = {
    BUSINESS: ORC_CODES.BUSINESS_FAILURE,
    POLICY: ORC_CODES.POLICY_FAILURE,
    VALIDATION: ORC_CODES.VALIDATION_FAILURE,
    TRANSIENT: ORC_CODES.TRANSIENT_FAILURE,
    SYSTEM: ORC_CODES.SYSTEM_FAILURE
  };
  const code = codeMap[classified.class] || ORC_CODES.SYSTEM_FAILURE;
  const err = orcError(code, classified.message, { class: classified.class, retryable: classified.retryable });
  err.class = classified.class;
  return err;
}

export { failureOf };
