import { sleep } from './utils.js';

export const RETRYABLE_CODES = ['E_TR_TIMEOUT', 'E_TR_NETWORK', 'E_TR_RATE_LIMITED', 'E_TR_UNKNOWN'];

export function shouldRetry(err) {
  if (!err) return false;
  if (err.retryable === false) return false;
  if (err.code && RETRYABLE_CODES.includes(err.code)) return true;
  const status = String(err.status ?? err.statusCode ?? '');
  return status === '429' || /^5\d\d$/.test(status);
}

export function retryDelay(attempt, { initialDelayMs = 500, backoff = 'exponential', jitter = 0.2 } = {}) {
  const base = backoff === 'linear' ? initialDelayMs * attempt : initialDelayMs * Math.pow(2, attempt - 1);
  const j = base * (1 + (Math.random() * 2 - 1) * jitter);
  return Math.max(0, Math.round(j));
}

export async function retry(fn, {
  maxAttempts = 3,
  initialDelayMs = 500,
  backoff = 'exponential',
  jitter = 0.2,
  retryable = shouldRetry,
  onAttempt = null
} = {}) {
  let lastError = null;
  const attempts = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now();
    try {
      const result = await fn(attempt);
      return {
        ok: true,
        result,
        attempts,
        attemptCount: attempts.length,
        durationMs: Date.now() - started
      };
    } catch (err) {
      lastError = err;
      attempts.push({
        attempt,
        code: err.code || 'E_TR_UNKNOWN',
        message: err.message,
        durationMs: Date.now() - started
      });
      const canRetry = attempt < maxAttempts && retryable(err);
      if (!canRetry) {
        if (attempts.length > 1) lastError.meta = { ...(lastError.meta || {}), attempts };
        throw lastError;
      }
      const delay = retryDelay(attempt, { initialDelayMs, backoff, jitter });
      if (onAttempt) onAttempt({ attempt, delay, code: err.code, message: err.message });
      await sleep(delay);
    }
  }
  if (attempts.length > 1) lastError.meta = { ...(lastError.meta || {}), attempts };
  throw lastError;
}

export function createRetryPolicy(config = {}) {
  return {
    maxAttempts: config.maxAttempts ?? 3,
    initialDelayMs: config.initialDelayMs ?? 500,
    backoff: config.backoff ?? 'exponential',
    jitter: 0.2
  };
}
