export const RSN_CODES = {
  INVALID_INPUT: 'RSN001',
  MISSING_DECISION: 'RSN002',
  MISSING_CONTEXT: 'RSN003',
  TRACE_FAILED: 'RSN004'
};

export function rsnError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}
