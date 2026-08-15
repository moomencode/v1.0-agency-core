export const OBS_CODES = {
  INVALID_BATCH: 'E_OBS_INVALID_BATCH',
  SECRET_REJECTED: 'E_OBS_SECRET_REJECTED',
  SIZE_EXCEEDED: 'E_OBS_SIZE_EXCEEDED',
  STORE_ERROR: 'E_OBS_STORE_ERROR',
  UNKNOWN_OBSERVATION: 'E_OBS_UNKNOWN_OBSERVATION'
};

export function obsError(code, message, meta = {}) {
  const err = new Error(message);
  err.code = code;
  err.meta = meta;
  return err;
}