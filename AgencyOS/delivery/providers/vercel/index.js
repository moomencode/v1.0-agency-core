import { VercelClient } from './client.js';
import { validateVercelConfig } from './preflight.js';
import { deliveryError, DEL_CODES } from '../../errors.js';

// Vercel deployment readyState taxonomy. `verify()` maps each state onto
// readiness metadata so the deployment manager can (a) treat READY as success,
// (b) keep polling through the in-progress states, and (c) fast-fail as soon as
// a deployment enters a terminal non-ready state instead of waiting out the
// whole verification window.
export const VERCEL_READY_STATE = 'READY';
export const VERCEL_IN_PROGRESS_STATES = ['INITIALIZING', 'QUEUED', 'BUILDING'];
export const VERCEL_TERMINAL_STATES = ['ERROR', 'CANCELED', 'ERRORED'];

// PRV-01 (4.7.0): verify() must never silently treat an unrecognized (or
// missing) readyState as an in-progress state — that burned the whole verify
// window and surfaced a misleading PROVIDER_ERROR. Missing or unknown states
// are classified as explicit transient errors (retryable) so the deployment
// manager's retry policy handles them honestly.
const VERCEL_KNOWN_STATES = new Set([VERCEL_READY_STATE, ...VERCEL_IN_PROGRESS_STATES, ...VERCEL_TERMINAL_STATES]);

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
    const readyState = data?.readyState ?? null;
    if (readyState === null) {
      throw deliveryError(DEL_CODES.PROVIDER_ERROR, 'vercel deployment response missing readyState', { status: 200, retryable: true });
    }
    if (!VERCEL_KNOWN_STATES.has(readyState)) {
      throw deliveryError(DEL_CODES.PROVIDER_ERROR, `vercel deployment returned unrecognized readyState "${readyState}"`, { status: 200, readyState, retryable: true });
    }
    return {
      status: readyState,
      ready: readyState === VERCEL_READY_STATE,
      terminal: VERCEL_TERMINAL_STATES.includes(readyState),
      errorCode: data?.errorCode || null,
      url: data?.url || null
    };
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
