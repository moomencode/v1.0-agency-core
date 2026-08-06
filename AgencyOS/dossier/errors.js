export const DOS_CODES = {
  INVALID_INPUT: 'DOS001',
  UNKNOWN_BUSINESS: 'DOS002',
  BUILD_FAILED: 'DOS003',
  INVALID_DOSSIER: 'DOS004',
  UNKNOWN_DOCUMENT: 'DOS005',
  SCHEMA_MISSING: 'DOS006',
  STORE_ERROR: 'DOS007'
};

export function dosError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}
