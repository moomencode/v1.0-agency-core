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
