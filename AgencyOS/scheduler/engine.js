import { CronSchedule } from './cron.js';
import { JobQueue } from './queue.js';
import { schError, SCH_CODES } from './errors.js';

const IN_FLIGHT_DEFER_MS = 250;

function clampPriority(p) {
  const n = Number(p);
  if (Number.isNaN(n)) return 5;
  return Math.max(0, Math.min(10, Math.round(n)));
}

function backoffDelay(job, attempt) {
  const base = job.retryDelayMs > 0 ? job.retryDelayMs : 200;
  const factor = job.backoff === 'fixed' ? 1 : 2 ** Math.max(0, attempt - 1);
  return Math.min(base * factor, 3600000);
}

function validateSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object') return null;
  if (schedule.intervalMs !== undefined) {
    if (!Number.isInteger(schedule.intervalMs) || schedule.intervalMs < 1) {
      throw schError(SCH_CODES.SCHEDULE_INVALID, 'schedule.intervalMs must be a positive integer', { schedule });
    }
    return { type: 'interval', intervalMs: schedule.intervalMs };
  }
  if (schedule.cron !== undefined) {
    const cron = new CronSchedule(schedule.cron);
    return { type: 'cron', cron, expr: schedule.cron };
  }
  if (schedule.at !== undefined) {
    const at = new Date(schedule.at);
    if (Number.isNaN(at.getTime())) throw schError(SCH_CODES.SCHEDULE_INVALID, `schedule.at is not a valid date: ${schedule.at}`, { schedule });
    return { type: 'at', at };
  }
  return null;
}

export class SchedulerEngine {
  constructor({ store, runner, tickMs = 1000, maxWorkers = 4, logger = null, bridge = null } = {}) {
    this.store = store;
    this.runner = runner;
    this.tickMs = Math.max(1, tickMs);
    this.maxWorkers = Math.max(1, maxWorkers);
    this.logger = logger;
    this.bridge = bridge;
    this.queue = new JobQueue();
    this.active = 0;
    this.inFlight = new Set();
    this.running = false;
    this.stopped = false;
    this.timer = null;
    this.wakeTimer = null;
    this.retryTimers = new Set();
    this.resolvers = new Map();
    this.emitters = new Map();
    this.startedAt = null;
  }

  on(event, cb) {
    if (!this.emitters.has(event)) this.emitters.set(event, new Set());
    this.emitters.get(event).add(cb);
    return () => this.off(event, cb);
  }

  off(event, cb) {
    this.emitters.get(event)?.delete(cb);
  }

  _emit(event, payload) {
    const set = this.emitters.get(event);
    if (set) {
      for (const cb of set) {
        try { cb(payload); } catch { /* listener errors never break the scheduler */ }
      }
    }
    if (this.bridge) {
      try { this.bridge(event, payload); } catch { /* bridge is best-effort */ }
    }
  }

  start() {
    if (this.running) return;
    if (this.queue.peek() === null) {
      this._recoverDispatches();
    }
    this.running = true;
    this.stopped = false;
    this.startedAt = new Date();
    this.tick();
    this.timer = setInterval(() => this.tick(), this.tickMs);
    if (this.timer.unref) this.timer.unref();
  }

  stop() {
    this.running = false;
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = null;
    }
    this._clearRetryTimers();
  }

  _clearRetryTimers() {
    for (const timer of this.retryTimers) clearTimeout(timer);
    this.retryTimers.clear();
  }

  // SCH-01: replay persisted dispatch intents left by a crash between the job
  // persist and the in-memory enqueue. Runs are re-enqueued exactly once; job
  // run numbers / schedule bookkeeping are reconciled from the journal.
  _recoverDispatches() {
    const pending = this.store.listDispatches();
    if (!pending.length) return 0;
    const now = Date.now();
    for (const entry of pending) {
      const job = this.store.get(entry.jobId);
      if (!job) continue;
      if (entry.runNumber > job.runNumber) job.runNumber = entry.runNumber;
      if (entry.lastRunAt) job.lastRunAt = entry.lastRunAt;
      if (entry.nextRunAt !== undefined) job.nextRunAt = entry.nextRunAt;
      job.attempts = 0;
      this.store.saveJob(job);
      this.queue.enqueue({ ...entry, dueAt: now });
      this.store.removeDispatch(entry.id);
    }
    return pending.length;
  }

  close() {
    this.stop();
    for (const resolve of this.resolvers.values()) resolve(null);
    this.resolvers.clear();
  }

  registerJob(spec) {
    if (!spec || typeof spec !== 'object') throw schError(SCH_CODES.INVALID_JOB, 'job spec must be an object', { spec });
    const { name, workflowId, handler, input = {}, schedule: scheduleSpec, priority = 5, maxAttempts = 1, retryDelayMs = 200, backoff = 'exponential', timeoutMs = 60000, enabled = true, options = {} } = spec;
    if (typeof name !== 'string' || name.trim() === '') throw schError(SCH_CODES.INVALID_JOB, 'job requires a "name" string', { spec });
    if (typeof workflowId !== 'string' && typeof handler !== 'string') {
      throw schError(SCH_CODES.INVALID_JOB, 'job requires a "workflowId" (string) or a "handler" name', { spec });
    }
    const schedule = validateSchedule(scheduleSpec);
    if (spec.id !== undefined && this.store.get(String(spec.id))) {
      throw schError(SCH_CODES.DUPLICATE_JOB, `job "${spec.id}" already exists`, { id: spec.id });
    }
    const id = spec.id !== undefined ? String(spec.id) : `job-${Date.now().toString(36)}-${Math.floor(Math.random() * 46656).toString(36)}`;
    const now = new Date();
    const job = {
      id,
      name,
      workflowId: typeof workflowId === 'string' ? workflowId : null,
      handler: typeof handler === 'string' ? handler : null,
      type: typeof workflowId === 'string' ? 'workflow' : 'handler',
      input: input && typeof input === 'object' ? input : {},
      options: options && typeof options === 'object' ? options : {},
      schedule,
      priority: clampPriority(priority),
      maxAttempts: Math.max(1, Number.isInteger(maxAttempts) ? maxAttempts : 1),
      retryDelayMs: Math.max(0, Number(retryDelayMs) || 0),
      backoff: backoff === 'fixed' ? 'fixed' : 'exponential',
      timeoutMs: Math.max(0, Number(timeoutMs) || 0),
      enabled: !!enabled,
      nextRunAt: this._initialNextRunAt(schedule, now),
      lastRunAt: null,
      lastStatus: null,
      runNumber: 0,
      attempts: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    this.store.saveJob(job);
    return job;
  }

  _initialNextRunAt(schedule, now) {
    if (!schedule) return null;
    if (schedule.type === 'cron') return schedule.cron.nextRunAt(now)?.toISOString() || null;
    if (schedule.type === 'at') return schedule.at.toISOString();
    return null;
  }

  updateJob(id, patch = {}) {
    const job = this.store.get(String(id));
    if (!job) throw schError(SCH_CODES.UNKNOWN_JOB, `unknown job "${id}"`, { id });
    const allowed = ['name', 'input', 'priority', 'maxAttempts', 'retryDelayMs', 'backoff', 'timeoutMs', 'enabled', 'options'];
    for (const key of allowed) {
      if (patch[key] !== undefined) job[key] = patch[key];
    }
    if (patch.priority !== undefined) job.priority = clampPriority(patch.priority);
    if (patch.maxAttempts !== undefined) job.maxAttempts = Math.max(1, patch.maxAttempts);
    if (patch.schedule !== undefined) job.schedule = validateSchedule(patch.schedule);
    job.nextRunAt = this._initialNextRunAt(job.schedule, new Date());
    job.updatedAt = new Date().toISOString();
    this.store.saveJob(job);
    return job;
  }

  removeJob(id) {
    const job = this.store.get(String(id));
    if (!job) throw schError(SCH_CODES.UNKNOWN_JOB, `unknown job "${id}"`, { id });
    this.store.deleteJob(String(id));
    return true;
  }

  pause(id) {
    const job = this.store.get(String(id));
    if (!job) throw schError(SCH_CODES.UNKNOWN_JOB, `unknown job "${id}"`, { id });
    job.paused = true;
    this.store.saveJob(job);
    return job;
  }

  resume(id) {
    const job = this.store.get(String(id));
    if (!job) throw schError(SCH_CODES.UNKNOWN_JOB, `unknown job "${id}"`, { id });
    delete job.paused;
    this.store.saveJob(job);
    return job;
  }

  listJobs() {
    return this.store.list().map((j) => ({ ...j, schedule: j.schedule ? { ...j.schedule, cron: undefined } : null, cronExpr: j.schedule?.expr || null }));
  }

  getJob(id) {
    const job = this.store.get(String(id));
    if (!job) throw schError(SCH_CODES.UNKNOWN_JOB, `unknown job "${id}"`, { id });
    return { ...job };
  }

  history(jobId) {
    return this.store.historyOf(String(jobId));
  }

  trigger(id, input = null) {
    const job = this.store.get(String(id));
    if (!job) throw schError(SCH_CODES.UNKNOWN_JOB, `unknown job "${id}"`, { id });
    if (!job.enabled) throw schError(SCH_CODES.JOB_DISABLED, `job "${id}" is disabled`, { id });
    const runNumber = job.runNumber + 1;
    const dispatch = { id: `disp-${job.id}-${runNumber}`, jobId: job.id, runNumber, attempt: 1, input: input ?? job.input, priority: job.priority, trigger: 'manual', dueAt: Date.now(), createdAt: new Date().toISOString() };
    this.store.saveDispatch(dispatch);
    job.runNumber = runNumber;
    job.attempts = 0;
    this.store.saveJob(job);
    const token = `${job.id}:${runNumber}`;
    const promise = new Promise((resolve) => this.resolvers.set(token, resolve));
    this.queue.enqueue(dispatch);
    this._drain(true);
    return promise;
  }

  tick() {
    if (!this.running) return;
    const now = Date.now();
    for (const job of this.store.list()) {
      if (!job.enabled || job.paused) continue;
      if (job.schedule && job.schedule.type === 'interval') {
        const last = job.lastRunAt ? new Date(job.lastRunAt).getTime() : new Date(job.createdAt).getTime();
        if (now - last >= job.schedule.intervalMs) {
          job.lastRunAt = new Date().toISOString();
          this.store.saveJob(job);
          this._enqueueScheduled(job, 'schedule');
        }
      } else if (job.schedule && job.schedule.type === 'cron') {
        if (job.nextRunAt && new Date(job.nextRunAt).getTime() <= now) {
          job.nextRunAt = job.schedule.cron.nextRunAt(now)?.toISOString() || null;
          this.store.saveJob(job);
          this._enqueueScheduled(job, 'schedule');
        }
      } else if (job.schedule && job.schedule.type === 'at') {
        if (job.nextRunAt && new Date(job.nextRunAt).getTime() <= now) {
          job.nextRunAt = null;
          this.store.saveJob(job);
          this._enqueueScheduled(job, 'schedule');
        }
      }
    }
    this._drain();
  }

  _enqueueScheduled(job, trigger) {
    const runNumber = job.runNumber + 1;
    const dispatch = { id: `disp-${job.id}-${runNumber}`, jobId: job.id, runNumber, attempt: 1, input: job.input, priority: job.priority, trigger, dueAt: Date.now(), createdAt: new Date().toISOString() };
    this.store.saveDispatch(dispatch);
    job.runNumber = runNumber;
    job.attempts = 0;
    this.store.saveJob(job);
    this.queue.enqueue(dispatch);
  }

  _deferInFlight(entry) {
    this.queue.enqueue({ ...entry, dueAt: Date.now() + IN_FLIGHT_DEFER_MS });
    if (!this.wakeTimer) {
      this.wakeTimer = setTimeout(() => {
        this.wakeTimer = null;
        this._drain();
      }, IN_FLIGHT_DEFER_MS);
      if (this.wakeTimer.unref) this.wakeTimer.unref();
    }
  }

  _drain(force = false) {
    while (this.active < this.maxWorkers && (force || !this.stopped)) {
      const entry = this.queue.popEligible();
      if (!entry) break;
      if (this.inFlight.has(entry.jobId)) {
        this._deferInFlight(entry);
        continue;
      }
      this.inFlight.add(entry.jobId);
      this.active++;
      this._execute(entry).finally(() => {
        this.inFlight.delete(entry.jobId);
        this.active--;
        this._drain();
      });
    }
  }

  async _execute(entry) {
    if (entry.dispatchId || (entry.id && entry.id.startsWith('disp-'))) {
      this.store.removeDispatch(entry.dispatchId || entry.id);
    }
    const job = this.store.get(entry.jobId);
    const token = `${entry.jobId}:${entry.runNumber}`;
    if (!job) {
      const resolve = this.resolvers.get(token);
      if (resolve) {
        this.resolvers.delete(token);
        const at = new Date().toISOString();
        resolve({
          status: 'skipped',
          runNumber: entry.runNumber,
          attempt: entry.attempt,
          trigger: entry.trigger || 'manual',
          startedAt: at,
          finishedAt: at,
          durationMs: 0,
          skipped: true,
          reason: 'job-removed'
        });
      }
      return;
    }
    this._emit('job_started', { jobId: job.id, runNumber: entry.runNumber, attempt: entry.attempt, trigger: entry.trigger, at: new Date().toISOString() });
    const record = await this.runner.run(job, { runNumber: entry.runNumber, input: entry.input, attempt: entry.attempt });
    record.trigger = entry.trigger;
    this.store.appendRun(job.id, record);

    if (record.status === 'failed' && entry.attempt < job.maxAttempts) {
      job.attempts = entry.attempt;
      this.store.saveJob(job);
      const delay = backoffDelay(job, entry.attempt);
      this._emit('job_retry', { jobId: job.id, runNumber: entry.runNumber, attempt: entry.attempt, delayMs: delay, error: record.error });
      const retryDispatch = { id: `disp-${job.id}-${entry.runNumber}-r${entry.attempt + 1}`, jobId: job.id, runNumber: entry.runNumber, attempt: entry.attempt + 1, input: entry.input, priority: job.priority, dueAt: Date.now() + delay, trigger: 'retry', createdAt: new Date().toISOString() };
      this.store.saveDispatch(retryDispatch);
      this.queue.enqueue(retryDispatch);
      const timer = setTimeout(() => this._drain(true), Math.min(delay, 30000));
      if (!this.resolvers.has(token)) {
        if (timer.unref) timer.unref();
      }
      this.retryTimers.add(timer);
      return;
    }

    job.lastRunAt = new Date().toISOString();
    job.lastStatus = record.status;
    job.attempts = 0;
    this.store.saveJob(job);
    const payload = { jobId: job.id, runNumber: entry.runNumber, attempt: entry.attempt, status: record.status, durationMs: record.durationMs, startedAt: record.startedAt };
    if (record.error) payload.error = record.error;
    this._emit(record.status === 'succeeded' ? 'job_succeeded' : 'job_failed', payload);

    const resolve = this.resolvers.get(token);
    if (resolve) {
      this.resolvers.delete(token);
      resolve(record);
    }
  }

  schedule(expr) {
    const cron = new CronSchedule(expr);
    const next = cron.nextRunAt();
    return { expr, valid: true, summary: cron.toSummary(), nextRunAt: next ? next.toISOString() : null, hasSeconds: cron.hasSeconds };
  }

  nextRunAt(expr, from = new Date()) {
    const cron = new CronSchedule(expr);
    const next = cron.nextRunAt(from);
    return next ? next.toISOString() : null;
  }

  stats() {
    const jobs = this.store.list();
    const byWorkflow = {};
    let totalRuns = 0;
    let succeeded = 0;
    let failed = 0;
    let retried = 0;
    let durSum = 0;
    let durN = 0;
    let lastRun = null;
    for (const job of jobs) {
      const wf = job.workflowId || job.handler || 'unknown';
      if (!byWorkflow[wf]) byWorkflow[wf] = { runs: 0, succeeded: 0, failed: 0 };
      for (const r of this.store.historyOf(job.id)) {
        totalRuns++;
        if (r.status === 'succeeded') { succeeded++; byWorkflow[wf].succeeded++; }
        else { failed++; byWorkflow[wf].failed++; }
        if (r.attempt && r.attempt > 1) retried++;
        byWorkflow[wf].runs++;
        if (r.durationMs) { durSum += r.durationMs; durN++; }
        if (!lastRun || new Date(r.startedAt) > new Date(lastRun.startedAt)) lastRun = r;
      }
    }
    return {
      jobs: jobs.length,
      enabled: jobs.filter((j) => j.enabled).length,
      totalRuns,
      succeeded,
      failed,
      retried,
      avgDurationMs: durN ? Math.round((durSum / durN) * 100) / 100 : 0,
      byWorkflow,
      lastRun: lastRun ? { jobId: null, status: lastRun.status, startedAt: lastRun.startedAt } : null
    };
  }
}
