import { typedError } from '../runtime/errors.js';

export const STM_CODES = {
  UNKNOWN_STATE: 'E_STM_UNKNOWN_STATE',
  ILLEGAL_TRANSITION: 'E_STM_ILLEGAL_TRANSITION',
  INVALID_INSTANCE: 'E_STM_INVALID_INSTANCE'
};

export function stmError(code, message, details = {}) {
  return typedError(code, message, { ...details, module: 'state-machine' });
}
