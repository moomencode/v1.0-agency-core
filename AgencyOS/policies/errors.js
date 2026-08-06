import { typedError } from '../runtime/errors.js';

export const POL_CODES = {
  INVALID_POLICY: 'E_POL_INVALID_POLICY',
  UNKNOWN_POLICY: 'E_POL_UNKNOWN_POLICY'
};

export function polError(code, message, details = {}) {
  return typedError(code, message, { ...details, module: 'policies' });
}
