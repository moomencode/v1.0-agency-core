import { typedError } from '../runtime/errors.js';

export const MET_CODES = {
  INVALID_EVENT: 'E_MET_INVALID_EVENT',
  STORE_ERROR: 'E_MET_STORE_ERROR'
};

export function metError(code, message, details = {}) {
  return typedError(code, message, { ...details, module: 'metrics' });
}
