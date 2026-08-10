import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchedulerSystem } from './index.js';
import { sleep } from '../runtime/utils.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_ROOT = path.resolve('storage', 'scheduler-455');
fs.rmSync(TEST_ROOT, { recursive: true, force: true });

let passed = 0;
let failed = 0;
const failures = [];
function assert(cond, label, extra = '') {
  if (cond) { passed++; console.log(`PASS ${label}`); }
  else { failed++; failures.push(`${label} ${extra}`); console.log(`FAIL ${label} ${extra}`); }
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

function trackRuns() {
  const state = { runs: [], concurrent: 0, peakByJob: {} };
  return state;
}

function withTimeout(promise, ms, label) {
  return Promise.race([promise, sleep(ms).then(() => { throw new Error(`${label} did not settle within ${ms}ms`); })]);
}

const main = async () => {
  // ---- B-01: trigger settles deterministically when the job is removed before execution ----
  {
    const state = trackRuns();
    const gate = deferred();
    const executor = async (job, ctx) => {
      state.runs.push({ jobId: job.id, runNumber: ctx.runNumber });
      if (job.id === 'blocker') await gate.promise;
      return { ok: true };
    };
    const sys = new SchedulerSystem({ root: path.join(TEST_ROOT, 'b01'), tickMs: 1000, maxWorkers: 1, executor });
    sys.registerJob({ id: 'blocker', name: 'blocker', workflowId: 'x' });
    sys.registerJob({ id: 'ghost', name: 'ghost', workflowId: 'x' });
    const blocker = sys.trigger('blocker');
    const ghost = sys.trigger('ghost');
    sys.removeJob('ghost');
    gate.resolve();
    const ghostResult = await withTimeout(ghost, 5000, 'B-01 ghost trigger');
    assert(ghostResult && ghostResult.status === 'skipped', 'B-01 removed-job trigger settles with skipped', JSON.stringify(ghostResult));
    assert(ghostResult.skipped === true && ghostResult.reason === 'job-removed', 'B-01 skipped record carries reason', JSON.stringify(ghostResult));
    await withTimeout(blocker, 5000, 'B-01 blocker trigger');
    assert(state.runs.filter((r) => r.jobId === 'ghost').length === 0, 'B-01 removed job never executes');
    assert(sys.history('ghost').length === 0, 'B-01 removed job records no history');
    sys.close();
  }

  // ---- B-01: normal trigger behavior unchanged ----
  {
    const state = trackRuns();
    const sys = new SchedulerSystem({ root: path.join(TEST_ROOT, 'b01b'), tickMs: 1000, executor: async (job) => { state.runs.push({ jobId: job.id }); return { ok: true }; } });
    sys.registerJob({ id: 'keep', name: 'keep', workflowId: 'x' });
    const result = await sys.trigger('keep');
    assert(result.status === 'succeeded' && state.runs.length === 1, 'B-01 normal trigger still resolves succeeded', JSON.stringify(result));
    sys.close();
  }

  // ---- B-02: per-job in-flight guard (manual trigger during scheduled run) ----
  {
    const state = trackRuns();
    const gate = deferred();
    let firstA = true;
    const executor = async (job) => {
      state.concurrent++;
      state.peakByJob[job.id] = Math.max(state.peakByJob[job.id] || 0, state.concurrent);
      state.runs.push({ jobId: job.id, at: Date.now() });
      if (job.id === 'A' && firstA) {
        firstA = false;
        await gate.promise;
      } else {
        await sleep(20);
      }
      state.concurrent--;
      return { ok: true };
    };
    const sys = new SchedulerSystem({ root: path.join(TEST_ROOT, 'b02'), tickMs: 25, maxWorkers: 2, executor });
    sys.registerJob({ id: 'A', name: 'A', workflowId: 'x', schedule: { intervalMs: 30 } });
    sys.registerJob({ id: 'B', name: 'B', workflowId: 'x' });
    sys.start();
    while (!state.runs.some((r) => r.jobId === 'A')) await sleep(5);
    const a2 = sys.trigger('A');
    await sleep(150);
    assert(state.runs.filter((r) => r.jobId === 'A').length === 1, 'B-02 scheduled run in-flight blocks a second concurrent execution', `runs=${state.runs.filter((r) => r.jobId === 'A').length}`);
    assert(state.peakByJob.A === 1, 'B-02 job A never runs concurrently', `peak=${state.peakByJob.A}`);
    const b1 = await withTimeout(sys.trigger('B'), 5000, 'B-02 job B trigger');
    assert(b1.status === 'succeeded' && state.runs.some((r) => r.jobId === 'B'), 'B-02 unrelated job B runs while A is in-flight');
    gate.resolve();
    const a2Result = await withTimeout(a2, 8000, 'B-02 deferred manual trigger');
    assert(a2Result.status === 'succeeded', 'B-02 manual trigger executes after in-flight run completes', JSON.stringify(a2Result));
    await sleep(100);
    assert(state.runs.filter((r) => r.jobId === 'A').length >= 2, 'B-02 job A executes again after completion', `runs=${state.runs.filter((r) => r.jobId === 'A').length}`);
    assert(state.peakByJob.A === 1, 'B-02 A executions are strictly sequential', `peak=${state.peakByJob.A}`);
    const jobA = sys.getJob('A');
    assert(jobA.lastStatus === 'succeeded' && jobA.lastRunAt !== null, 'B-02 lastRunAt/lastStatus coherent after completion', JSON.stringify({ lastStatus: jobA.lastStatus, lastRunAt: jobA.lastRunAt }));
    sys.stop();
    sys.close();
  }

  console.log(`\n=== SCHEDULER REGRESSION-455: ${passed} PASS, ${failed} FAIL ===`);
  if (failures.length) console.log('failures:', failures.join(' | '));
  process.exit(failed === 0 ? 0 : 1);
};

main();
