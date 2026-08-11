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
    this.dispatchesFile = path.join(baseDir, '_dispatches.json');
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

  // SCH-01: dispatch-intent journal. A scheduled run is persisted here BEFORE the
  // in-memory queue enqueue, so a crash between "job persisted" and "queue
  // enqueued" can never drop a run: on restart the engine replays pending
  // dispatches from the store. Removal happens only after the entry is enqueued.
  listDispatches() {
    const raw = readJson(this.dispatchesFile, []);
    return Array.isArray(raw) ? raw : [];
  }

  saveDispatch(entry) {
    const list = this.listDispatches().filter((d) => d && d.id !== entry.id);
    list.push(entry);
    writeJson(this.dispatchesFile, list);
    return entry;
  }

  removeDispatch(id) {
    const list = this.listDispatches().filter((d) => d && d.id !== id);
    writeJson(this.dispatchesFile, list);
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
