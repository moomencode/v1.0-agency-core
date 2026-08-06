import { schError, SCH_CODES } from './errors.js';
import { nowIso } from '../runtime/utils.js';

export class JobRunner {
  constructor({ executor = null, validator = null, timeoutMs = 60000, logger = null } = {}) {
    this.executor = executor;
    this.validator = validator;
    this.defaultTimeoutMs = timeoutMs;
    this.logger = logger;
    this.stats = { runs: 0, succeeded: 0, failed: 0, inputInvalid: 0, timeouts: 0 };
  }

  async run(job, { runNumber, input, attempt }) {
    const startedAt = new Date();
    const t0 = process.hrtime.bigint();
    let status = 'failed';
    let error = null;
    let result = null;

    if (this.validator) {
      try {
        await this.validator(input, job);
      } catch (e) {
        status = 'failed';
        error = e && e.code ? e.message : `input rejected: ${e.message || e}`;
        this.stats.inputInvalid++;
        this.stats.failed++;
        this.stats.runs++;
        const finishedAt = new Date();
        return {
          status, runNumber, attempt, trigger: null,
          startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(),
          durationMs: Number(process.hrtime.bigint() - t0) / 1e6,
          error
        };
      }
    }

    try {
      if (!this.executor) throw schError(SCH_CODES.EXECUTOR_ERROR, 'no executor registered for this job');
      const timeoutMs = job.timeoutMs || this.defaultTimeoutMs;
      const timer = timeoutMs > 0
        ? new Promise((_, rej) => {
            const t = setTimeout(() => rej(new Error(`execution timed out after ${timeoutMs}ms`)), timeoutMs);
            if (t.unref) t.unref();
          })
        : null;
      result = timer
        ? await Promise.race([this.executor(job, { runNumber, input, attempt }), timer])
        : await this.executor(job, { runNumber, input, attempt });
      status = 'succeeded';
      this.stats.succeeded++;
    } catch (e) {
      status = 'failed';
      error = (e && e.message) || String(e);
      this.stats.failed++;
      if (e && e.message && e.message.includes('timed out')) this.stats.timeouts++;
    } finally {
      this.stats.runs++;
    }

    const finishedAt = new Date();
    const record = {
      status,
      runNumber,
      attempt,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: Math.round((Number(process.hrtime.bigint() - t0) / 1e6) * 100) / 100
    };
    if (error) record.error = error;
    if (result !== null && result !== undefined) record.result = result;
    return record;
  }
}
