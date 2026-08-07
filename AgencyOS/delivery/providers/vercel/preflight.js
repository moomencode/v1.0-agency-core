import { deliveryError, DEL_CODES } from '../../errors.js';

export async function validateVercelConfig({ config, secrets, clientFactory }) {
  if (!config || typeof config !== 'object' || !config.project) {
    throw deliveryError(DEL_CODES.CONFIG_INVALID, 'vercel provider config requires "project"', { hint: 'set provider target.project to the Vercel project name or id' });
  }
  const token = secrets.require('VERCEL_TOKEN');
  const client = clientFactory(token);
  const project = await client.getProject();
  return { ok: true, project, tokenPresent: true };
}
