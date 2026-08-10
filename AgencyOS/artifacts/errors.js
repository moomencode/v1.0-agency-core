import { typedError } from '../runtime/errors.js';

export const ART_CODES = {
  FORMAT_UNKNOWN: 'E_AR_FORMAT_UNKNOWN',
  TYPE_UNKNOWN: 'E_AR_TYPE_UNKNOWN',
  NOT_FOUND: 'E_AR_NOT_FOUND',
  VERSION_NOT_FOUND: 'E_AR_VERSION_NOT_FOUND',
  SCHEMA_INVALID: 'E_AR_SCHEMA_INVALID',
  CHECKSUM_MISMATCH: 'E_AR_CHECKSUM_MISMATCH',
  STORE_CLOSED: 'E_AR_STORE_CLOSED',
  PATH_INVALID: 'E_AR_PATH_INVALID'
};

export function artError(code, message, meta = {}) {
  return typedError(code, message, meta);
}
