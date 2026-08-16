export const EXM_CODES = {
  INVALID_SPEC: 'E_EXM_INVALID_SPEC',
  UNKNOWN_CAMPAIGN: 'E_EXM_UNKNOWN_CAMPAIGN',
  UNKNOWN_POLICY_SET: 'E_EXM_UNKNOWN_POLICY_SET',
  AUTO_APPLY_DENIED: 'E_EXM_AUTO_APPLY_DENIED',
  SCOPE_EXCEEDED: 'E_EXM_SCOPE_EXCEEDED',
  REPORT_ERROR: 'E_EXM_REPORT_ERROR'
};

export function exmError(code, message, meta = {}) {
  const err = new Error(message);
  err.code = code;
  err.meta = meta;
  return err;
}