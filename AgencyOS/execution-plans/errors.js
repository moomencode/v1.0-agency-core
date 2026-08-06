import { typedError } from '../runtime/errors.js';

export const XPL_CODES = {
  INVALID_PLAN: 'E_XPL_INVALID_PLAN',
  UNKNOWN_STEP: 'E_XPL_UNKNOWN_STEP',
  STEP_FAILED: 'E_XPL_STEP_FAILED',
  UNKNOWN_GATE: 'E_XPL_UNKNOWN_GATE',
  UNREACHABLE: 'E_XPL_UNREACHABLE'
};

export function xplError(code, message, details = {}) {
  return typedError(code, message, { ...details, module: 'execution-plans' });
}
