import { deliveryError, DEL_CODES } from '../errors.js';

export const PROVIDER_METHODS = [
  'validateConfig',
  'deploy',
  'verify',
  'urlFor',
  'promote',
  'listDeployments',
  'health',
  'dryRun'
];

export function assertProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw deliveryError(DEL_CODES.PROVIDER_UNKNOWN, 'provider must be an object implementing DeploymentProvider');
  }
  for (const method of PROVIDER_METHODS) {
    if (typeof provider[method] !== 'function') {
      throw deliveryError(DEL_CODES.PROVIDER_UNKNOWN, `provider "${provider.id}" is missing method ${method}()`);
    }
  }
  return provider;
}
