import { deliveryError, DEL_CODES } from '../errors.js';
import { shouldRetry, retry } from '../../runtime/retry.js';
import { sleep } from '../../runtime/utils.js';

export function classifyProviderError(code, message, { status = null, retryable = null } = {}) {
  let retry = retryable;
  if (retry === null) {
    retry = status === 429 || (status !== null && /^5\d\d$/.test(String(status)));
  }
  return deliveryError(code, message, { status, retryable: retry });
}

export function shouldRetryDelivery(err) {
  if (!err) return false;
  if (err.retryable === false) return false;
  return shouldRetry(err);
}

export async function deliveryRetry(fn, { maxAttempts = 3, initialDelayMs = 50, backoff = 'exponential', jitter = 0, onAttempt = null } = {}) {
  return retry(fn, { maxAttempts, initialDelayMs, backoff, jitter: jitter ?? 0, retryable: shouldRetryDelivery, onAttempt });
}

export async function pollUntil(fn, { maxAttempts = 10, initialDelayMs = 50, backoff = 'linear', jitter = 0, predicate = null, stopWhen = null, timeoutMs = null } = {}) {
  let last = null;
  const deadline = timeoutMs && timeoutMs > 0 ? Date.now() + timeoutMs : null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await fn(attempt);
    if (predicate ? predicate(last) : last) return last;
    // Terminal states (e.g. a Vercel readyState of ERROR/CANCELED) should stop
    // the poll immediately instead of waiting out the remaining window.
    if (stopWhen && stopWhen(last)) return last;
    if (attempt < maxAttempts) {
      const delay = (initialDelayMs * attempt) * (jitter ? 1 + (Math.random() * 2 - 1) * jitter : 1);
      // Wall-clock budget: never schedule a sleep that would push us past it.
      if (deadline && Date.now() + delay >= deadline) break;
      await sleep(delay);
    }
  }
  return last;
}
