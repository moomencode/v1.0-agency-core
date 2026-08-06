import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Executor } from '../runtime/executor.js';
import { JobStore } from './store.js';
import { JobRunner } from './runner.js';
import { SchedulerEngine } from './engine.js';
import { schError, SCH_CODES } from './errors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SCHEDULER_API_VERSION = '1.0';

export class SchedulerSystem {
  constructor({ root = ROOT, tickMs = 1000, maxWorkers = 4, executor = null, validator = null, store = null, logger = null } = {}) {
    this.root = path.resolve(root);
    this.store = store || new JobStore({ baseDir: path.join(this.root, 'storage', 'scheduler-engine') });
    this.handlers = new Map();
    this.logger = logger;
    this.runtime = null;

    const adapter = executor
      ? executor
      : async (job, ctx) => {
          if (job.type === 'handler') {
            const fn = this.handlers.get(job.handler);
            if (!fn) throw schError(SCH_CODES.EXECUTOR_ERROR, `no handler "${job.handler}" registered`);
            return fn(job, ctx);
          }
          if (!this.runtime) this.runtime = new Executor({ root: this.root, logger });
          const options = { seed: `${job.id}:${ctx.runNumber}`, ...(job.options || {}) };
          return this.runtime.run(job.workflowId, ctx.input, options);
        };

    this.runner = new JobRunner({ executor: adapter, validator, logger });
    this.engine = new SchedulerEngine({ store: this.store, runner: this.runner, tickMs, maxWorkers, logger });
  }

  registerJob(spec) { return this.engine.registerJob(spec); }
  updateJob(id, patch) { return this.engine.updateJob(id, patch); }
  removeJob(id) { return this.engine.removeJob(id); }
  trigger(id, input = null) { return this.engine.trigger(id, input); }
  pause(id) { return this.engine.pause(id); }
  resume(id) { return this.engine.resume(id); }
  listJobs() { return this.engine.listJobs(); }
  getJob(id) { return this.engine.getJob(id); }
  history(jobId) { return this.engine.history(jobId); }
  stats() { return this.engine.stats(); }
  schedule(expr) { return this.engine.schedule(expr); }
  nextRunAt(expr, from) { return this.engine.nextRunAt(expr, from); }
  registerHandler(name, fn) { this.handlers.set(name, fn); }
  on(event, cb) { return this.engine.on(event, cb); }
  off(event, cb) { return this.engine.off(event, cb); }
  start() { this.engine.start(); }
  stop() { this.engine.stop(); }
  close() { this.engine.close(); }
}

export function createSchedulerSystem(opts) {
  return new SchedulerSystem(opts);
}
