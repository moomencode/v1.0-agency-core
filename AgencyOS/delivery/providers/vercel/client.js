import { classifyProviderError } from '../../deployment/retry.js';
import { deliveryError, DEL_CODES } from '../../errors.js';
import { redactText } from '../../security/redaction.js';

function mapError(status, body = '') {
  if (status === 401 || status === 403) {
    return classifyProviderError(DEL_CODES.AUTH_FAILED, `vercel auth failed (${status})`, { status, retryable: false });
  }
  if (status === 429) {
    return classifyProviderError(DEL_CODES.RATE_LIMITED, 'vercel rate limited', { status, retryable: true });
  }
  if (/^5\d\d$/.test(String(status))) {
    return classifyProviderError(DEL_CODES.NETWORK_ERROR, `vercel server error (${status})`, { status, retryable: true });
  }
  if (status >= 400) {
    return classifyProviderError(DEL_CODES.PROVIDER_ERROR, `vercel request failed (${status}): ${redactText(body).slice(0, 200)}`, { status, retryable: false });
  }
  return null;
}

export class VercelClient {
  constructor({ token, project, team = null, baseUrl = 'https://api.vercel.com', http = null, timeoutMs = 15000, logger = null } = {}) {
    this.token = token;
    this.project = project;
    this.team = team;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.http = http || (async (url, opts) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { ...opts, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    });
    this.logger = logger;
  }

  _headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  _qs(params = {}) {
    const parts = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
    return parts.length ? `?${parts.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}` : '';
  }

  async _request(method, path, { params = {}, body = null } = {}) {
    const url = `${this.baseUrl}${path}${this._qs(params)}`;
    let res;
    try {
      res = await this.http(url, {
        method,
        headers: this._headers(),
        body: body !== null ? JSON.stringify(body) : undefined
      });
    } catch (err) {
      const networkErr = classifyProviderError(DEL_CODES.NETWORK_ERROR, `vercel network error: ${err?.message || 'unknown'}`, { retryable: true });
      networkErr.cause = err;
      throw networkErr;
    }
    if (!res || typeof res.status !== 'number') {
      throw classifyProviderError(DEL_CODES.NETWORK_ERROR, 'vercel response malformed', { retryable: true });
    }
    let data = null;
    try {
      data = typeof res.json === 'function' ? await res.json() : null;
    } catch {
      data = null;
    }
    const mapped = mapError(res.status, JSON.stringify(data));
    if (mapped) throw mapped;
    return { status: res.status, data };
  }

  async getProject() {
    const { data } = await this._request('GET', `/v9/projects/${encodeURIComponent(this.project)}`, { params: this.team ? { teamId: this.team } : {} });
    return data;
  }

  async createDeployment(files, { name = 'agency-site', target = 'production' } = {}) {
    const body = {
      name,
      target,
      files: Object.entries(files).map(([file, content]) => ({
        file,
        data: Buffer.from(String(content), 'utf8').toString('base64')
      }))
    };
    const { data } = await this._request('POST', '/v13/deployments', { params: { projectId: this.project }, body });
    return data;
  }

  async getDeployment(deploymentId) {
    const { data } = await this._request('GET', `/v13/deployments/${encodeURIComponent(deploymentId)}`);
    return data;
  }

  async promote(deploymentId) {
    const { data } = await this._request('POST', `/v10/projects/${encodeURIComponent(this.project)}/promote/${encodeURIComponent(deploymentId)}`, { params: this.team ? { teamId: this.team } : {} });
    return data;
  }

  async listDeployments({ limit = 50 } = {}) {
    const { data } = await this._request('GET', '/v13/deployments', { params: { projectId: this.project, limit } });
    return data;
  }
}
