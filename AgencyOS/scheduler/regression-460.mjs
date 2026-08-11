import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchedulerSystem } from './index.js';
import { sleep } from '../runtime/utils.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_ROOT = path.resolve('storage', 'scheduler-460');
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

function withTimeout(promise, ms, label) {
  return Promise.race([promise, sleep(ms).then(() => { throw new Error(`${label} did not settle within ${ms}ms`); })]);
}

const main = async () => {
  // ---- SCH-01-A: a normal trigger executes exactly once and leaves no journal residue ----
  {
    const runs = [];
    const sys = new SchedulerSystem({
      root: path.join(TEST_ROOT, 'a'),
      tickMs: 1000,
      executor: async (job, ctx) => { runs.push({ jobId: job.id, runNumber: ctx.runNumber }); return { ok: true }; }
    });
    sys.registerJob({ id: 'j1', name: 'j1', workflowId: 'x' });
    const result = await withTimeout(sys.trigger('j1'), 5000, 'SCH-01-A trigger');
    await sleep(30);
    assert(result.status === 'succeeded', 'SCH-01-A manual run succeeds', JSON.stringify(result));
    assert(runs.length === 1, 'SCH-01-A executes exactly once', `runs=${runs.length}`);
    assert(sys.history('j1').length === 1, 'SCH-01-A history has exactly one record');
    const dispatches = JSON.parse(fs.readFileSync(path.join(TEST_ROOT, 'a', 'storage', 'scheduler-engine', '_dispatches.json'), 'utf8'));
    assert(Array.isArray(dispatches) && dispatches.length === 0, 'SCH-01-A journal drained after run', JSON.stringify(dispatches));
    sys.close();
  }

  // ---- SCH-01-B: a crash between persist and enqueue is replayed exactly once on restart ----
  {
    const runs = [];
    const root = path.join(TEST_ROOT, 'b');
    const sys = new SchedulerSystem({
      root, tickMs: 1000,
      executor: async (job, ctx) => { runs.push({ jobId: job.id, runNumber: ctx.runNumber, trigger: ctx.trigger }); return { ok: true }; }
    });
    sys.registerJob({ id: 'jb', name: 'jb', workflowId: 'x' });
    sys.stop();
    const store = sys.store;
    const job = store.get('jb');
    job.runNumber = 1;
    store.saveJob(job);
    store.saveDispatch({ id: 'disp-jb-1', jobId: 'jb', runNumber: 1, attempt: 1, input: {}, priority: 5, trigger: 'manual', dueAt: Date.now(), createdAt: new Date().toISOString() });
    const recovered = new SchedulerSystem({ root, tickMs: 1000, executor: async (job, ctx) => { runs.push({ jobId: job.id, runNumber: ctx.runNumber }); return { ok: true }; } });
    recovered.start();
    await withTimeout(sleep(150), 2000, 'SCH-01-B wait');
    await withTimeout(recovered.trigger('jb'), 5000, 'SCH-01-B second trigger');
    await sleep(30);
    assert(runs.length === 2, 'SCH-01-B replayed run executes exactly once (plus manual trigger)', `runs=${JSON.stringify(runs)}`);
    assert(runs[0].runNumber === 1, 'SCH-01-B replayed run carries the persisted run number', JSON.stringify(runs[0]));
    const dispatches = JSON.parse(fs.readFileSync(path.join(root, 'storage', 'scheduler-engine', '_dispatches.json'), 'utf8'));
    assert(dispatches.length === 0, 'SCH-01-B journal empty after replay');
    assert(recovered.history('jb').length === 2, 'SCH-01-B history records both runs');
    recovered.close();
  }

  // ---- SCH-01-C: start() with a live queue never replays (no duplicates on stop/start) ----
  {
    const runs = [];
    const gate = deferred();
    const sys = new SchedulerSystem({
      root: path.join(TEST_ROOT, 'c'), tickMs: 1000, maxWorkers: 1,
      executor: async (job, ctx) => {
        runs.push({ jobId: job.id, runNumber: ctx.runNumber });
        if (job.id === 'j1') await gate.promise;
        return { ok: true };
      }
    });
    sys.registerJob({ id: 'j1', name: 'j1', workflowId: 'x' });
    sys.registerJob({ id: 'j2', name: 'j2', workflowId: 'x' });
    const p1 = sys.trigger('j1');
    const p2 = sys.trigger('j2');
    await sleep(50);
    sys.stop();
    assert(runs.filter((r) => r.jobId === 'j2').length === 0, 'SCH-01-C queued job not executed while stopped');
    sys.start();
    gate.resolve();
    await withTimeout(p1, 5000, 'SCH-01-C j1');
    await withTimeout(p2, 5000, 'SCH-01-C j2');
    assert(runs.filter((r) => r.jobId === 'j2').length === 1, 'SCH-01-C stop/start does not duplicate queued runs', JSON.stringify(runs));
    sys.close();
  }

  // ---- SCH-02-A: retry timer is cancelled on stop; no retry runs after stop ----
  {
    const runs = [];
    let attempts = 0;
    const retrySeen = deferred();
    const sys = new SchedulerSystem({
      root: path.join(TEST_ROOT, 'd'), tickMs: 1000, maxWorkers: 1,
      executor: async (job, ctx) => {
        runs.push({ jobId: job.id, runNumber: ctx.runNumber, attempt: ctx.attempt });
        attempts++;
        if (attempts === 1) throw new Error('first attempt fails');
        return { ok: true };
      }
    });
    sys.registerJob({ id: 'jd', name: 'jd', workflowId: 'x', maxAttempts: 3, retryDelayMs: 600 });
    sys.on('job_retry', () => retrySeen.resolve());
    const pending = sys.trigger('jd');
    await withTimeout(retrySeen.promise, 3000, 'SCH-02-A retry scheduled');
    await sleep(50);
    assert(runs.length === 1 && runs[0].attempt === 1, 'SCH-02-A first attempt ran once', JSON.stringify(runs));
    sys.stop();
    await sleep(1400);
    assert(runs.length === 1, 'SCH-02-A no retry executes after stop', JSON.stringify(runs));
    assert(sys.history('jd').length === 1, 'SCH-02-A history holds only the first attempt');
    sys.close();
    pending.catch(() => {});
  }

  // ---- SCH-02-B: retry behavior preserved while running ----
  {
    const runs = [];
    let attempts = 0;
    const sys = new SchedulerSystem({
      root: path.join(TEST_ROOT, 'e'), tickMs: 1000, maxWorkers: 1,
      executor: async (job, ctx) => {
        runs.push({ jobId: job.id, runNumber: ctx.runNumber, attempt: ctx.attempt });
        attempts++;
        if (attempts < 3) throw new Error('transient failure');
        return { ok: true };
      }
    });
    sys.registerJob({ id: 'je', name: 'je', workflowId: 'x', maxAttempts: 3, retryDelayMs: 120 });
    const result = await withTimeout(sys.trigger('je'), 8000, 'SCH-02-B trigger');
    assert(result.status === 'succeeded', 'SCH-02-B run succeeds after retries', JSON.stringify(result));
    assert(runs.length === 3, 'SCH-02-B three attempts observed', JSON.stringify(runs));
    assert(runs.map((r) => r.attempt).join(',') === '1,2,3', 'SCH-02-B attempts are sequential', JSON.stringify(runs));
    assert(sys.history('je').length === 3, 'SCH-02-B history records all attempts');
    sys.close();
  }

  // ---- SCH-02-C: scheduled interval jobs do not fire after stop ----
  {
    const runs = [];
    const sys = new SchedulerSystem({
      root: path.join(TEST_ROOT, 'f'), tickMs: 25, maxWorkers: 1,
      executor: async (job, ctx) => { runs.push(ctx.runNumber); return { ok: true }; }
    });
    sys.registerJob({ id: 'jf', name: 'jf', workflowId: 'x', schedule: { intervalMs: 30 } });
    sys.start();
    await sleep(160);
    const whileRunning = runs.length;
    assert(whileRunning >= 2, 'SCH-02-C scheduled job fired while running', `runs=${whileRunning}`);
    sys.stop();
    await sleep(200);
    assert(runs.length === whileRunning, 'SCH-02-C no scheduled runs after stop', `runs=${runs.length}`);
    sys.close();
  }

  // ---- Bridge: scheduler lifecycle events are forwarded to the bridge callback ----
  {
    const events = [];
    const sys = new SchedulerSystem({
      root: path.join(TEST_ROOT, 'g'), tickMs: 1000, maxWorkers: 1,
      bridge: (event, payload) => events.push({ event, payload }),
      executor: async () => ({ ok: true })
    });
    sys.registerJob({ id: 'jg', name: 'jg', workflowId: 'x' });
    await withTimeout(sys.trigger('jg'), 5000, 'bridge trigger');
    const names = events.map((e) => e.event);
    assert(names.includes('job_started') && names.includes('job_succeeded'), 'SCH-BRIDGE started+succeeded forwarded', JSON.stringify(names));
    const started = events.find((e) => e.event === 'job_started');
    assert(started && started.payload.jobId === 'jg' && started.payload.runNumber === 1, 'SCH-BRIDGE payload carries job identity', JSON.stringify(started));
    sys.close();
  }

  // ---- Summary ----
  console.log(`\nregression-460: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('failures:', failures.join('\n  '));
    process.exitCode = 1;
  }
};

main().catch((err) => {
  console.error('regression-460 crashed:', err);
  process.exitCode = 1;
});
