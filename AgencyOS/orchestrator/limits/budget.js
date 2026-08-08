import { orcError, ORC_CODES } from '../errors.js';

export const LIMIT_FIELDS = [
  'maxBusinesses',
  'maxConcurrent',
  'maxRetries',
  'maxDeployments',
  'maxAiCalls',
  'maxProviderCalls',
  'maxExecutionDurationMs',
  'maxCampaignDurationMs'
];

export function defaultLimits() {
  return {
    maxBusinesses: 20,
    maxConcurrent: 3,
    maxRetries: 3,
    maxDeployments: 20,
    maxAiCalls: 100,
    maxProviderCalls: 200,
    maxExecutionDurationMs: 1800000,
    maxCampaignDurationMs: 86400000
  };
}

export function resolveLimits(spec) {
  const limits = defaultLimits();
  for (const k of LIMIT_FIELDS) {
    if (spec && spec[k] !== undefined) limits[k] = spec[k];
  }
  return limits;
}

export function isExhausted(budgetObj) {
  if (!budgetObj) return false;
  return Array.isArray(budgetObj.reached) && budgetObj.reached.length > 0;
}

export function limitKeyFor(kind) {
  return 'max' + kind.charAt(0).toUpperCase() + kind.slice(1);
}

export class Budget {
  constructor({ limits = null, state = null, campaignStartedAt = null } = {}) {
    this.limits = resolveLimits(limits);
    this.counters = {
      businesses: 0,
      deployments: 0,
      aiCalls: 0,
      providerCalls: 0,
      retries: 0,
      steps: 0,
      ...(state && state.counters ? state.counters : {})
    };
    this.startedAt = (state && state.startedAt) || campaignStartedAt || new Date().toISOString();
    this.reached = state && state.reached ? [...state.reached] : [];
  }

  snapshot() {
    return {
      limits: { ...this.limits },
      counters: { ...this.counters },
      startedAt: this.startedAt,
      reached: [...this.reached]
    };
  }

  canConsume(kind) {
    const limit = this.limits[limitKeyFor(kind)];
    if (typeof limit !== 'number') return true;
    return this.counters[kind] < limit;
  }

  consume(kind, n = 1) {
    const limit = this.limits[limitKeyFor(kind)];
    const next = (this.counters[kind] || 0) + n;
    if (typeof limit === 'number' && next > limit) {
      if (!this.reached.includes(kind)) this.reached.push(kind);
      throw orcError(ORC_CODES.LIMIT_REACHED, `campaign limit "${kind}" reached (${limit})`, {
        kind,
        limit,
        next,
        retryable: false
      });
    }
    this.counters[kind] = next;
    return next;
  }

  tryConsume(kind, n = 1) {
    try {
      this.consume(kind, n);
      return true;
    } catch {
      return false;
    }
  }

  markBusiness() {
    return this.consume('businesses', 1);
  }

  markDeployment() {
    return this.consume('deployments', 1);
  }

  markAiCall() {
    return this.consume('aiCalls', 1);
  }

  markProviderCall() {
    return this.consume('providerCalls', 1);
  }

  markRetry() {
    this.counters.retries = (this.counters.retries || 0) + 1;
  }

  markStep() {
    this.counters.steps = (this.counters.steps || 0) + 1;
  }

  checkDuration({ executionStartedAt = null, now = null } = {}) {
    const t = now || Date.now();
    const out = [];
    if (this.limits.maxCampaignDurationMs && this.startedAt) {
      if (t - Date.parse(this.startedAt) > this.limits.maxCampaignDurationMs) {
        out.push('maxCampaignDurationMs');
      }
    }
    if (executionStartedAt && this.limits.maxExecutionDurationMs) {
      if (t - Date.parse(executionStartedAt) > this.limits.maxExecutionDurationMs) {
        out.push('maxExecutionDurationMs');
      }
    }
    for (const kind of out) {
      if (!this.reached.includes(kind)) this.reached.push(kind);
    }
    return out;
  }

  isExhausted() {
    return this.reached.length > 0;
  }

  toString() {
    return JSON.stringify(this.snapshot());
  }
}
