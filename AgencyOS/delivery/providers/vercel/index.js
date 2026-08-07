import { VercelClient } from './client.js';
import { validateVercelConfig } from './preflight.js';
import { deliveryError, DEL_CODES } from '../../errors.js';

export class VercelProvider {
  constructor(config = {}, ctx = {}) {
    this.id = 'vercel';
    this.config = { project: null, team: null, region: null, framework: 'static', ...config };
    this.ctx = ctx;
    this.secrets = ctx.secrets;
    this.logger = ctx.logger;
    this.http = ctx.http;
  }

  _client() {
    if (!this._clientInstance) {
      this._clientInstance = new VercelClient({
        token: this.secrets.require('VERCEL_TOKEN'),
        project: this.config.project,
        team: this.config.team || null,
        http: this.http,
        logger: this.logger
      });
    }
    return this._clientInstance;
  }

  async validateConfig() {
    const result = await validateVercelConfig({
      config: this.config,
      secrets: this.secrets,
      clientFactory: (token) => new VercelClient({ token, project: this.config.project, team: this.config.team || null, http: this.http, logger: this.logger })
    });
    return result;
  }

  async health() {
    try {
      await this.validateConfig();
      return { ok: true, provider: 'vercel', project: this.config.project };
    } catch (err) {
      return { ok: false, error: err.message, code: err.code };
    }
  }

  async deploy(packageInfo) {
    const files = packageInfo.tree;
    if (!files || typeof files !== 'object' || !Object.keys(files).length) {
      throw deliveryError(DEL_CODES.PACKAGE_MISSING, 'vercel deploy requires a file tree', { retryable: false });
    }
    const data = await this._client().createDeployment(files, { name: packageInfo.businessId, target: 'production' });
    const deploymentId = data?.id;
    if (!deploymentId) {
      throw deliveryError(DEL_CODES.PROVIDER_ERROR, 'vercel deployment response missing id', { status: 200, retryable: false });
    }
    return { deploymentId, url: data.url || null, state: data.readyState || 'QUEUED' };
  }

  async verify(deploymentId) {
    const data = await this._client().getDeployment(deploymentId);
    return { status: data?.readyState || 'BUILDING', url: data?.url || null };
  }

  async urlFor(deploymentId) {
    const data = await this._client().getDeployment(deploymentId);
    return data?.url || null;
  }

  async promote(deploymentId) {
    await this._client().promote(deploymentId);
    return { alias: this.config.project, deploymentId };
  }

  async listDeployments() {
    const data = await this._client().listDeployments();
    return (data?.deployments || []).map((d) => ({ id: d.uid, state: d.readyState, url: d.url }));
  }

  dryRun(packageInfo) {
    return {
      provider: 'vercel',
      deploymentId: `vercel-${packageInfo.packageId}`,
      url: `https://${this.config.project}.vercel.app`,
      project: this.config.project,
      simulated: true
    };
  }
}
