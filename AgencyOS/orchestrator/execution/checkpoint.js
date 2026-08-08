import fs from 'node:fs';
import path from 'node:path';
import { checkpointFile, instanceRoot, ensureDir, atomicWrite, readJson, nowIso } from '../utils.js';

export const CHECKPOINT_VERSION = 1;

export function checkpointPayload(execution) {
  return {
    version: CHECKPOINT_VERSION,
    executionId: execution.executionId,
    campaignId: execution.campaignId,
    businessId: execution.businessId,
    status: execution.status,
    stepIndex: execution.stepIndex,
    attempts: { ...(execution.attempts || {}) },
    startedAt: execution.startedAt,
    outputs: { ...(execution.outputs || {}) },
    error: execution.error || null,
    outcome: execution.outcome || null,
    timeline: Array.isArray(execution.timeline) ? execution.timeline.slice(-5) : [],
    updatedAt: nowIso()
  };
}

export class CheckpointStore {
  constructor({ root = null } = {}) {
    this.root = root;
  }

  _file(executionId) {
    return checkpointFile(this.root, executionId);
  }

  exists(executionId) {
    return !!this.root && fs.existsSync(this._file(executionId));
  }

  save(execution) {
    if (!this.root) return null;
    ensureDir(instanceRoot(this.root, execution.executionId));
    atomicWrite(this._file(execution.executionId), JSON.stringify(checkpointPayload(execution), null, 2));
    return this._file(execution.executionId);
  }

  load(executionId) {
    if (!this.root) return null;
    return readJson(this._file(executionId), null);
  }

  listInstances() {
    if (!this.root) return [];
    const dir = path.join(this.root, 'instances');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'checkpoint.json')));
  }
}
