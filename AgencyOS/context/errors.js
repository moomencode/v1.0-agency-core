import { typedError } from '../runtime/errors.js';

export const CTX_CODES = {
  INVALID_CONTEXT: 'E_CTX_INVALID_CONTEXT',
  INVALID_RECORD: 'E_CTX_INVALID_RECORD'
};

export function ctxError(code, message, details = {}) {
  return typedError(code, message, { ...details, module: 'context' });
}
