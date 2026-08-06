export const BRN_CODES = {
  INVALID_RECORD: 'BRN001',
  INVALID_INPUT: 'BRN002',
  EXECUTION_FAILED: 'BRN003'
};

export function brnError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}
