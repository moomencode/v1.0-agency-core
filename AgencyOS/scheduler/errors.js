import { typedError } from '../runtime/errors.js';

export const SCH_CODES = {
  UNKNOWN_JOB: 'E_SCH_UNKNOWN_JOB',
  DUPLICATE_JOB: 'E_SCH_DUPLICATE_JOB',
  INVALID_JOB: 'E_SCH_INVALID_JOB',
  CRON_INVALID: 'E_SCH_CRON_INVALID',
  SCHEDULE_INVALID: 'E_SCH_SCHEDULE_INVALID',
  INPUT_INVALID: 'E_SCH_INPUT_INVALID',
  JOB_DISABLED: 'E_SCH_JOB_DISABLED',
  EXECUTOR_ERROR: 'E_SCH_EXECUTOR_ERROR',
  STORE_ERROR: 'E_SCH_STORE_ERROR'
};

export function schError(code, message, details = {}) {
  return typedError(code, message, details);
}
