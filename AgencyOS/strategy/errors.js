import { typedError } from '../runtime/errors.js';

export const STR_CODES = {
  INVALID_STRATEGY: 'E_STR_INVALID_STRATEGY',
  NO_STRATEGY: 'E_STR_NO_STRATEGY'
};

export function strError(code, message, details = {}) {
  return typedError(code, message, { ...details, module: 'strategy' });
}
