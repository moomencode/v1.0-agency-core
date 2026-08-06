import { typedError } from '../runtime/errors.js';

export const RUL_CODES = {
  INVALID_RULE: 'E_RUL_INVALID_RULE',
  UNKNOWN_RULE: 'E_RUL_UNKNOWN_RULE',
  EVAL_FAILED: 'E_RUL_EVAL_FAILED'
};

export function rulError(code, message, details = {}) {
  return typedError(code, message, { ...details, module: 'rules' });
}
