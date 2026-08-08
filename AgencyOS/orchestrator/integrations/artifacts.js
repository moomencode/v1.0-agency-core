import { sha256 } from '../utils.js';

export class ArtifactAdapter {
  constructor({ artifacts = null, projectId = 'unassigned' } = {}) {
    this.artifacts = artifacts;
    this.projectId = projectId;
  }

  keyFor({ projectId = this.projectId, workflowId, type, name }) {
    return `${projectId}::${workflowId}::${type}::${name}`;
  }

  _latestRecord({ projectId = this.projectId, workflowId, type, name }) {
    if (!this.artifacts) return null;
    const list = this.artifacts.manager.list({ projectId, workflowId, type });
    const matches = list.filter((r) => r.name === name);
    if (!matches.length) return null;
    return matches.reduce((a, b) => (b.version > a.version ? b : a));
  }

  checksumOf(content) {
    return sha256(content);
  }

  createWithDedupe(opts = {}) {
    if (!this.artifacts) {
      return { deduped: false, id: null, skipped: false };
    }
    const { name, type, workflowId, content, projectId = this.projectId, ...rest } = opts;
    const key = this.keyFor({ projectId, workflowId, type, name });
    const latest = this._latestRecord({ projectId, workflowId, type, name });
    if (latest) {
      const checksum = this.checksumOf(content);
      if (latest.checksum === checksum) {
        return { deduped: true, id: latest.id, version: latest.version, key };
      }
    }
    const record = this.artifacts.create({
      name,
      type,
      format: opts.format || 'json',
      content,
      projectId,
      workflowId,
      runId: opts.runId || null,
      stepId: opts.stepId || null,
      title: opts.title || null,
      summary: opts.summary || null,
      tags: opts.tags || [],
      generatedBy: opts.generatedBy || 'orchestrator',
      metadata: { key }
    });
    return { deduped: false, id: record.id, version: record.version, key };
  }
}
