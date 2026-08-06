export const PLR_CODES = {
  INVALID_CATALOG: 'PLR001',
  UNKNOWN_STRATEGY: 'PLR002',
  UNKNOWN_PLAN: 'PLR003',
  NO_DECISION: 'PLR004'
};

export function plrError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}
