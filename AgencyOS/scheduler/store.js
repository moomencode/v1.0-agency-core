import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, atomicWrite, readJson, writeJson } from '../runtime/utils.js';

const MAX_RUNS_PER_JOB = 100;
const MAX_TOTAL_RUNS = 2000;

export class JobStore {
  constructor({ baseDir }) {
    this.baseDir = baseDir;
    this.jobsFile = path.join(baseDir, '_jobs.json');
    this.historyFile = path.join(baseDir, '_history.json');
    this.jobs = new Map();
    this.history = new Map();
    ensureDir(baseDir);
    this._load();
  }

  _load() {
    const raw = readJson(this.jobsFile, []);
    if (Array.isArray(raw)) for (const job of raw) if (job && job.id) this.jobs.set(job.id, job);
    const history = readJson(this.historyFile, {});
    if (history && typeof history === 'object') {
      for (const [id, runs] of Object.entries(history)) {
        if (Array.isArray(runs)) this.history.set(id, runs);
      }
    }
  }

  saveJob(job) {
    this.jobs.set(job.id, job);
    this._persist();
  }

  deleteJob(id) {
    this.jobs.delete(id);
    this.history.delete(id);
    this._persist();
  }

  get(id) {
    return this.jobs.get(id) || null;
  }

  list() {
    return [...this.jobs.values()];
  }

  appendRun(jobId, run) {
    const runs = this.history.get(jobId) || [];
    runs.push(run);
    if (runs.length > MAX_RUNS_PER_JOB) runs.splice(0, runs.length - MAX_RUNS_PER_JOB);
    this.history.set(jobId, runs);
    let total = 0;
    for (const list of this.history.values()) total += list.length;
    while (total > MAX_TOTAL_RUNS) {
      let oldestId = null;
      let oldestAt = Infinity;
      for (const [id, list] of this.history) {
        const first = list[0];
        if (first && first.startedAt && new Date(first.startedAt).getTime() < oldestAt) {
          oldestAt = new Date(first.startedAt).getTime();
          oldestId = id;
        }
      }
      if (!oldestId) break;
      const list = this.history.get(oldestId);
      list.shift();
      total--;
    }
    this._persistHistory();
  }

  historyOf(jobId) {
    return this.history.get(jobId) || [];
  }

  _persist() {
    writeJson(this.jobsFile, [...this.jobs.values()]);
  }

  _persistHistory() {
    const out = {};
    for (const [id, runs] of this.history) out[id] = runs;
    writeJson(this.historyFile, out);
  }
}
