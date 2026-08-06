import { typedError } from '../runtime/errors.js';

export const DIS_CODES = {
  UNKNOWN_SOURCE: 'E_DIS_UNKNOWN_SOURCE',
  SOURCE_UNAVAILABLE: 'E_DIS_SOURCE_UNAVAILABLE',
  SOURCE_FAILED: 'E_DIS_SOURCE_FAILED',
  QUERY_INVALID: 'E_DIS_QUERY_INVALID',
  NO_CANDIDATES: 'E_DIS_NO_CANDIDATES',
  RECORD_INVALID: 'E_DIS_RECORD_INVALID',
  SCHEMA_INVALID: 'E_DIS_SCHEMA_INVALID',
  NOT_FOUND: 'E_DIS_NOT_FOUND',
  STORE_ERROR: 'E_DIS_STORE_ERROR'
};

export function disError(code, message, details = {}) {
  return typedError(code, message, details);
}
