import { typedError } from '../runtime/errors.js';

export const DEC_CODES = {
  INVALID_CONTEXT: 'E_DEC_INVALID_CONTEXT',
  RULE_FAILED: 'E_DEC_RULE_FAILED'
};

export function decError(code, message, details = {}) {
  return typedError(code, message, { ...details, module: 'decision-engine' });
}
