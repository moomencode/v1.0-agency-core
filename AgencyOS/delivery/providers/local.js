import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, writeJson, readJson, exists, listSorted } from '../utils.js';
import { readZip } from '../packaging/zip.js';
import { classifyProviderError } from '../deployment/retry.js';
import { deliveryError, DEL_CODES } from '../errors.js';

export class LocalProvider {
  constructor(config = {}, ctx = {}) {
    this.id = 'local';
    this.config = { project: 'local-site', ...config };
    this.ctx = ctx;
    this.root = path.join(ctx.root || '.', 'storage', 'delivery', 'local', this.config.project);
  }

  _currentPath() {
    return path.join(this.root, 'current.json');
  }

  _deployDir(deploymentId) {
    return path.join(this.root, deploymentId);
  }

  async validateConfig() {
    ensureDir(this.root);
    return { ok: true, project: this.config.project, root: this.root };
  }

  async health() {
    try {
      ensureDir(this.root);
      return { ok: true, provider: 'local', root: this.root };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async deploy(packageInfo) {
    const { bundlePath } = packageInfo;
    if (!bundlePath || !exists(bundlePath)) {
      throw classifyProviderError(DEL_CODES.PACKAGE_MISSING, 'bundle file missing for local deploy', { status: 404, retryable: false });
    }
    const deploymentId = `local-${packageInfo.packageId}`;
    const dir = ensureDir(this._deployDir(deploymentId));
    const rootDir = path.resolve(dir);
    const files = readZip(fs.readFileSync(bundlePath));
    for (const [rel, content] of Object.entries(files)) {
      const target = path.resolve(dir, rel);
      if (target !== rootDir && !target.startsWith(rootDir + path.sep)) {
        throw classifyProviderError(DEL_CODES.PROVIDER_ERROR, `bundle entry escapes deploy root: "${rel}"`, { status: 400, retryable: false });
      }
      ensureDir(path.dirname(target));
      fs.writeFileSync(target, content);
    }
    const url = `file://${path.join(dir, 'index.html')}`;
    writeJson(this._currentPath(), { deploymentId, packageId: packageInfo.packageId, url, updatedBy: 'local-provider' });
    return { deploymentId, url, state: 'READY' };
  }

  async verify(deploymentId) {
    const dir = this._deployDir(deploymentId);
    if (!exists(path.join(dir, 'index.html'))) {
      return { status: 'ERROR', url: null };
    }
    const current = exists(this._currentPath()) ? readJson(this._currentPath()) : null;
    return { status: 'READY', url: current && current.deploymentId === deploymentId ? current.url : `file://${path.join(dir, 'index.html')}` };
  }

  async urlFor(deploymentId) {
    const v = await this.verify(deploymentId);
    return v.status === 'READY' ? v.url : null;
  }

  async promote(deploymentId) {
    const dir = this._deployDir(deploymentId);
    if (!exists(path.join(dir, 'index.html'))) {
      throw classifyProviderError(DEL_CODES.PROVIDER_ERROR, `cannot promote unknown local deployment ${deploymentId}`, { status: 404, retryable: false });
    }
    const packageId = deploymentId.replace(/^local-/, '');
    const url = `file://${path.join(dir, 'index.html')}`;
    writeJson(this._currentPath(), { deploymentId, packageId, url, updatedBy: 'local-provider' });
    return { alias: this.config.project, deploymentId };
  }

  async listDeployments() {
    const out = [];
    for (const entry of listSorted(this.root)) {
      if (entry === 'current.json') continue;
      if (exists(path.join(this.root, entry, 'index.html'))) {
        out.push({ id: entry, state: 'READY', url: `file://${path.join(this.root, entry, 'index.html')}` });
      }
    }
    return out;
  }

  dryRun(packageInfo) {
    return {
      provider: 'local',
      deploymentId: `local-${packageInfo.packageId}`,
      url: `file://${this._deployDir(`local-${packageInfo.packageId}`)}/index.html`,
      root: this.root,
      simulated: true
    };
  }
}
