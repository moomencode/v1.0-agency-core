import { classifyProviderError } from '../deployment/retry.js';
import { deliveryError, DEL_CODES } from '../errors.js';

export class MockProvider {
  constructor(config = {}, ctx = {}) {
    this.id = 'mock';
    this.config = { project: 'mock-project', ...config };
    this.ctx = ctx;
    this.deployments = new Map();
    this.alias = null;
    this.failures = [];
  }

  queueFailure({ op = 'deploy', status = 500, retryable = true, code = null } = {}) {
    this.failures.push({ op, status, retryable, code });
    return this;
  }

  _maybeFail(op) {
    const idx = this.failures.findIndex((f) => f.op === op);
    if (idx === -1) return;
    const [failure] = this.failures.splice(idx, 1);
    if (failure.code) {
      throw deliveryError(failure.code, `mock ${op} failure (${failure.status})`, { status: failure.status, retryable: failure.retryable });
    }
    throw classifyProviderError(DEL_CODES.PROVIDER_ERROR, `mock ${op} transient failure`, { status: failure.status, retryable: failure.retryable });
  }

  async validateConfig() {
    return { ok: true, project: this.config.project };
  }

  async health() {
    return { ok: true, provider: 'mock' };
  }

  async deploy(packageInfo) {
    this._maybeFail('deploy');
    const deploymentId = `mock-${packageInfo.packageId}`;
    this.deployments.set(deploymentId, { id: deploymentId, state: 'READY', url: `https://${this.config.project}.vercel.mock/${packageInfo.packageId}` });
    if (!this.alias) this.alias = deploymentId;
    return { deploymentId, url: this.deployments.get(deploymentId).url, state: 'READY' };
  }

  async verify(deploymentId) {
    this._maybeFail('verify');
    const d = this.deployments.get(deploymentId);
    if (!d) {
      throw classifyProviderError(DEL_CODES.PROVIDER_ERROR, `unknown deployment ${deploymentId}`, { status: 404, retryable: false });
    }
    return { status: d.state, url: d.url };
  }

  async urlFor(deploymentId) {
    const d = this.deployments.get(deploymentId);
    return d ? d.url : null;
  }

  async promote(deploymentId) {
    this._maybeFail('promote');
    if (!this.deployments.has(deploymentId)) {
      throw classifyProviderError(DEL_CODES.PROVIDER_ERROR, `cannot promote unknown deployment ${deploymentId}`, { status: 404, retryable: false });
    }
    this.alias = deploymentId;
    return { alias: this.config.project, deploymentId };
  }

  async listDeployments() {
    return [...this.deployments.values()].map((d) => ({ id: d.id, state: d.state, url: d.url }));
  }

  dryRun(packageInfo) {
    return {
      provider: 'mock',
      deploymentId: `mock-${packageInfo.packageId}`,
      url: `https://${this.config.project}.vercel.mock/${packageInfo.packageId}`,
      simulated: true
    };
  }
}
