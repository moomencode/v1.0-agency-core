import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite, readJson } from '../../runtime/utils.js';
import { intError, INT_CODES } from '../errors.js';
import { windowsBetween } from '../utils.js';
import { insightIdFor } from '../ids.js';

// Deterministic insight envelope. computedAt is pinned to the window end so a
// recompute over the same inputs produces byte-identical records.
export function buildInsight({ kind, scope, window, job, jobVersion = 1, data, summary = '', inputs = {}, schemaVersion = 1, artifactIds = [] }) {
  return {
    schema: 'https://agency.os/intelligence/insight',
    schemaVersion,
    insightId: insightIdFor(kind, scope.type, scope.id, window.start, window.end),
    kind,
    scope: { type: scope.type, id: scope.id },
    window: { start: window.start, end: window.end },
    job,
    jobVersion,
    computedAt: window.end,
    data,
    summary,
    inputs,
    artifactIds
  };
}

// Scheduled, idempotent job runner. A job receives {window, now, ctx}; it must
// return {insightId, kind, scope, window, data, summary, inputs}. Insights are
// recompute-over-write (deterministic per window) and progress is persisted in
// a job marker, so crashes resume from the last completed window.
export class JobFramework {
  constructor({ root, killswitchRoot = null, scheduler = null, clock = null, logger = null } = {}) {
    this.root = root;
    this.dir = path.join(root, 'jobs');
    this.killswitchRoot = killswitchRoot;
    this.scheduler = scheduler;
    this.now = clock?.now || (() => new Date());
    this.logger = logger;
    this.jobs = new Map();
    this.stats = { runs: 0, windows: 0, aborted: 0, markers: 0 };
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }

  markerFile(jobId) {
    return path.join(this.dir, `${String(jobId).replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
  }

  loadMarker(jobId) {
    return readJson(this.markerFile(jobId), null);
  }

  saveMarker(jobId, marker) {
    atomicWrite(this.markerFile(jobId), JSON.stringify(marker, null, 2));
    this.stats.markers++;
  }

  killswitchActive() {
    if (process.env.ORC_EMERGENCY_STOP === '1' || process.env.ORC_EMERGENCY_STOP === 'true') return true;
    return this.killswitchRoot ? fs.existsSync(path.join(this.killswitchRoot, 'EMERGENCY_STOP')) : false;
  }

  // Register a job definition. When a scheduler is present, registers both the
  // handler and the scheduled job (schedule from def.schedule).
  define(name, def) {
    if (!def || typeof def.run !== 'function') throw intError(INT_CODES.UNKNOWN_JOB, `job "${name}" requires a run() function`, { name });
    this.jobs.set(name, { name, version: def.version || 1, schedule: def.schedule || null, windowMs: def.windowMs || 3600000, maxWindows: def.maxWindows || 24, run: def.run });
    if (this.scheduler && typeof this.scheduler.registerHandler === 'function') {
      this.scheduler.registerHandler(name, async (job, ctx) => this.execute(job.id, { job, ctx }));
      if (def.schedule && typeof this.scheduler.registerJob === 'function') {
        try {
          this.scheduler.registerJob({
            id: name,
            name,
            handler: name,
            input: {},
            schedule: { type: 'cron', expr: def.schedule },
            priority: 3,
            maxAttempts: 2,
            retryDelayMs: 1000,
            timeoutMs: 120000
          });
        } catch {
          /* duplicate registration is harmless (job already exists) */
        }
      }
    }
    return this;
  }

  // Windows to process: from the marker's last completed window end up to `now`,
  // bucketed at def.windowMs, capped at def.maxWindows. A window whose end is
  // still in the future (the current partial window) is never processed — jobs
  // only ever see completed windows, so recomputes are final.
  pendingWindows(name, def, nowIso) {
    const marker = this.loadMarker(name);
    const nowMs = new Date(nowIso).getTime();
    const from = marker && marker.lastWindowEnd ? marker.lastWindowEnd : new Date(nowMs - def.windowMs * def.maxWindows).toISOString();
    return windowsBetween(from, nowMs, def.windowMs, { maxWindows: def.maxWindows })
      .filter((w) => new Date(w.end).getTime() <= nowMs);
  }

  async execute(name, { job = null, ctx = null, window = null, now = null } = {}) {
    const def = this.jobs.get(name);
    if (!def) throw intError(INT_CODES.UNKNOWN_JOB, `unknown job "${name}"`, { name });
    const nowIso = now ? now : this.now().toISOString();
    const windows = window ? [window] : this.pendingWindows(name, def, nowIso);
    if (!windows.length) return { name, windows: 0 };

    this.saveMarker(name, { schema: 'https://agency.os/intelligence/job-marker', jobId: name, lastWindowStart: windows[0].start, lastWindowEnd: null, status: 'running', updatedAt: nowIso });
    this.stats.runs++;
    let processed = 0;
    for (const w of windows) {
      if (this.killswitchActive()) {
        this.stats.aborted++;
        this.saveMarker(name, { schema: 'https://agency.os/intelligence/job-marker', jobId: name, lastWindowStart: w.start, lastWindowEnd: null, status: 'aborted', error: 'killswitch', updatedAt: nowIso });
        return { name, windows: processed, aborted: true };
      }
      const result = await def.run({ window: w, now: nowIso, ctx });
      processed++;
      this.stats.windows++;
      this.saveMarker(name, { schema: 'https://agency.os/intelligence/job-marker', jobId: name, lastWindowStart: w.start, lastWindowEnd: w.end, status: 'completed', updatedAt: nowIso });
    }
    return { name, windows: processed, job: job?.id || null };
  }
}
