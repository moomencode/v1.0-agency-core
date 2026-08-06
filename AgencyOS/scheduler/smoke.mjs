import fs from 'node:fs';
import path from 'node:path';
import { SchedulerSystem, SCHEDULER_API_VERSION } from './index.js';
import { SCH_CODES } from './errors.js';
import { sleep } from '../runtime/utils.js';

const TEST_ROOT = path.resolve('storage', 'scheduler-smoke');
fs.rmSync(TEST_ROOT, { recursive: true, force: true });

let passed = 0;
let failed = 0;
const failures = [];
function assert(cond, label, extra = '') {
  if (cond) { passed++; console.log(`PASS ${label}`); }
  else { failed++; failures.push(`${label} ${extra}`); console.log(`FAIL ${label} ${extra}`); }
}

function makeExecutor(opts = {}) {
  const state = { runs: [], peak: 0, concurrent: 0 };
  const executor = async (job, ctx) => {
    state.runs.push({ jobId: job.id, runNumber: ctx.runNumber, attempt: ctx.attempt, at: Date.now() });
    state.concurrent++;
    state.peak = Math.max(state.peak, state.concurrent);
    if (opts.sleepMs) await sleep(opts.sleepMs);
    const fail = opts.fail ? opts.fail(ctx, job) : false;
    state.concurrent--;
    if (fail) throw new Error(opts.errorMsg || `boom ${ctx.runNumber}`);
    return { ok: true, attempt: ctx.attempt };
  };
  return { executor, state };
}

function newSys(name, opts = {}) {
  return new SchedulerSystem({
    root: path.join(TEST_ROOT, name),
    tickMs: 25,
    maxWorkers: 2,
    executor: opts.executor,
    validator: opts.validator || null
  });
}

const main = async () => {
  // ---- API surface ----
  assert(SCHEDULER_API_VERSION === '1.0', 'stable API version 1.0');

  // ---- cron parsing ----
  const schedSys = newSys('cron', { executor: makeExecutor().executor });
  const everyMinute = schedSys.schedule('* * * * *');
  assert(everyMinute.valid === true && new Date(everyMinute.nextRunAt).getTime() - Date.now() < 60000, 'cron every minute');

  const atTwo = schedSys.schedule('0 2 * * *');
  const twoAt = new Date(atTwo.nextRunAt);
  assert(twoAt.getHours() === 2 && twoAt.getMinutes() === 0 && twoAt.getTime() > Date.now(), 'cron daily 02:00');

  const every15 = schedSys.schedule('*/15 * * * *');
  assert(new Date(every15.nextRunAt).getMinutes() % 15 === 0, 'cron step every 15 minutes');

  const secCron = schedSys.schedule('* * * * * *');
  assert(secCron.hasSeconds === true && new Date(secCron.nextRunAt).getTime() - Date.now() < 2000, 'cron with seconds field');

  const mondayCron = schedSys.schedule('0 0 * * MON');
  assert(new Date(mondayCron.nextRunAt).getDay() === 1, 'cron day names');

  const rangeCron = schedSys.schedule('0 9-17 * * *');
  const rc = new Date(rangeCron.nextRunAt);
  assert(rc.getHours() >= 9 && rc.getHours() <= 17, 'cron hour range');

  const listCron = schedSys.schedule('30 6,18 * * *');
  const lc = new Date(listCron.nextRunAt);
  assert((lc.getHours() === 6 || lc.getHours() === 18) && lc.getMinutes() === 30, 'cron hour list');

  const qCron = schedSys.schedule('0 0 ? * *');
  assert(qCron.valid === true, 'cron ? wildcard');

  const qNext = schedSys.nextRunAt('*/5 * * * *');
  assert(qNext !== null && new Date(qNext).getMinutes() % 5 === 0, 'nextRunAt helper');

  try {
    schedSys.schedule('not-a-cron');
    assert(false, 'invalid cron rejected');
  } catch (e) {
    assert(e.code === SCH_CODES.CRON_INVALID, 'invalid cron rejected', `got ${e.code}`);
  }

  // ---- job registration ----
  const manSys = newSys('manual', { executor: makeExecutor().executor });
  const manualJob = manSys.registerJob({ id: 'manual-job', name: 'Manual lead run', workflowId: 'lead-discovery', input: { niche: 'Cairo' } });
  assert(manualJob.id === 'manual-job' && manualJob.enabled === true && manualJob.workflowId === 'lead-discovery' && manualJob.priority === 5 && manualJob.maxAttempts === 1, 'register manual job with defaults');

  try {
    manSys.registerJob({ id: 'manual-job', name: 'dup', workflowId: 'x' });
    assert(false, 'duplicate job id rejected');
  } catch (e) {
    assert(e.code === SCH_CODES.DUPLICATE_JOB, 'duplicate job id rejected', `got ${e.code}`);
  }

  try {
    manSys.registerJob({ id: 'j-noexec', name: 'no executor', input: {} });
    assert(false, 'job without workflowId/handler rejected');
  } catch (e) {
    assert(e.code === SCH_CODES.INVALID_JOB, 'job without workflowId/handler rejected', `got ${e.code}`);
  }

  try {
    manSys.registerJob({ id: 'j-badint', name: 'bad interval', workflowId: 'x', schedule: { intervalMs: 0 } });
    assert(false, 'invalid interval rejected');
  } catch (e) {
    assert(e.code === SCH_CODES.SCHEDULE_INVALID, 'invalid interval rejected', `got ${e.code}`);
  }

  try {
    manSys.registerJob({ id: 'j-badcron', name: 'bad cron', workflowId: 'x', schedule: { cron: '99 * * * *' } });
    assert(false, 'invalid cron in job rejected');
  } catch (e) {
    assert(e.code === SCH_CODES.CRON_INVALID, 'invalid cron in job rejected', `got ${e.code}`);
  }

  assert(manSys.listJobs().length === 1, 'listJobs reflects registered job');

  // ---- trigger before start ----
  const triggerResult = await manSys.trigger('manual-job', { niche: 'Cairo F&B' });
  assert(triggerResult.status === 'succeeded' && manSys.history('manual-job').length === 1, 'manual trigger before start runs and records history', JSON.stringify(triggerResult));

  try {
    manSys.trigger('ghost-job');
    assert(false, 'trigger unknown job rejected');
  } catch (e) {
    assert(e.code === SCH_CODES.UNKNOWN_JOB, 'trigger unknown job rejected', `got ${e.code}`);
  }

  const disSys = newSys('disabled', { executor: makeExecutor().executor });
  disSys.registerJob({ id: 'dis', name: 'disabled job', workflowId: 'x', enabled: false });
  try {
    disSys.trigger('dis');
    assert(false, 'trigger disabled job rejected');
  } catch (e) {
    assert(e.code === SCH_CODES.JOB_DISABLED, 'trigger disabled job rejected', `got ${e.code}`);
  }

  // ---- priority execution ----
  const prio = makeExecutor({ sleepMs: 30 });
  const prioSys = newSys('priority', { executor: prio.executor });
  prioSys.engine.maxWorkers = 1;
  prioSys.registerJob({ id: 'p-low', name: 'low', workflowId: 'x', priority: 1 });
  prioSys.registerJob({ id: 'p-med', name: 'medium', workflowId: 'x', priority: 5 });
  prioSys.registerJob({ id: 'p-high', name: 'high', workflowId: 'x', priority: 9 });
  await Promise.all([prioSys.trigger('p-low'), prioSys.trigger('p-med'), prioSys.trigger('p-high')]);
  assert(prio.state.runs.length === 3 && prio.state.runs[1].jobId === 'p-high' && prio.state.runs[2].jobId === 'p-med', 'priority execution: queued runs ordered by priority', JSON.stringify(prio.state.runs.map((r) => r.jobId)));

  // ---- parallel execution with concurrency cap ----
  const par = makeExecutor({ sleepMs: 120 });
  const parSys = newSys('parallel', { executor: par.executor });
  for (let i = 1; i <= 4; i++) parSys.registerJob({ id: `par-${i}`, name: `par ${i}`, workflowId: 'x' });
  const t0 = Date.now();
  await Promise.all([1, 2, 3, 4].map((i) => parSys.trigger(`par-${i}`)));
  const elapsed = Date.now() - t0;
  assert(par.state.runs.length === 4 && par.state.peak <= 2, 'parallel execution capped at maxWorkers', `peak=${par.state.peak}`);
  assert(elapsed < 400, 'parallel execution faster than serial', `elapsed=${elapsed}ms`);

  // ---- interval auto-run ----
  const int = makeExecutor();
  const intSys = newSys('interval', { executor: int.executor });
  intSys.registerJob({ id: 'pulse', name: 'pulse', workflowId: 'x', schedule: { intervalMs: 60 } });
  intSys.start();
  await sleep(350);
  intSys.stop();
  const mine = int.state.runs.filter((r) => r.jobId === 'pulse');
  assert(mine.length >= 3, 'interval job runs automatically', `runs=${mine.length}`);
  assert(intSys.getJob('pulse').lastStatus === 'succeeded', 'lastStatus recorded');
  intSys.close();

  // ---- cron execution ----
  const cr = makeExecutor();
  const crSys = newSys('cronexec', { executor: cr.executor });
  crSys.registerJob({ id: 'tick', name: 'tick', workflowId: 'x', schedule: { cron: '* * * * * *' } });
  crSys.start();
  await sleep(2300);
  crSys.stop();
  const crMine = cr.state.runs.filter((r) => r.jobId === 'tick');
  assert(crMine.length >= 1, 'cron job executes on schedule', `runs=${crMine.length}`);
  crSys.close();

  // ---- retry ----
  const ret = makeExecutor({ fail: (ctx) => ctx.attempt <= 2 });
  const retSys = newSys('retry', { executor: ret.executor });
  retSys.registerJob({ id: 'flaky', name: 'flaky', workflowId: 'x', maxAttempts: 3, retryDelayMs: 30, backoff: 'exponential' });
  const retResult = await retSys.trigger('flaky');
  const history = retSys.history('flaky');
  assert(retResult.status === 'succeeded' && history.length === 3, 'failed job retries until success', JSON.stringify(history.map((h) => h.status)));
  assert(history.map((h) => h.attempt).join(',') === '1,2,3', 'retry attempts increment');
  assert(history[0].status === 'failed' && history[1].status === 'failed' && history[2].status === 'succeeded', 'retry history statuses correct');
  const gap = new Date(history[1].startedAt) - new Date(history[0].startedAt);
  assert(gap >= 20, 'retry delay respected', `gap=${gap}ms`);
  const stats = retSys.stats();
  assert(stats.totalRuns === 3 && stats.succeeded === 1 && stats.failed === 2 && stats.retried === 2, 'retry statistics correct', JSON.stringify(stats));

  // ---- maxAttempts 1: no retry ----
  const noRet = makeExecutor({ fail: () => true });
  const noSys = newSys('noretry', { executor: noRet.executor });
  noSys.registerJob({ id: 'doomed', name: 'doomed', workflowId: 'x', maxAttempts: 1 });
  const noResult = await noSys.trigger('doomed');
  assert(noResult.status === 'failed' && noSys.history('doomed').length === 1, 'maxAttempts 1 runs exactly once');
  assert(noSys.getJob('doomed').lastStatus === 'failed', 'failed lastStatus recorded');

  // ---- pause / resume ----
  const pz = makeExecutor();
  const pzSys = newSys('pause', { executor: pz.executor });
  pzSys.registerJob({ id: 'pz', name: 'pz', workflowId: 'x', schedule: { intervalMs: 40 } });
  pzSys.pause('pz');
  pzSys.start();
  await sleep(250);
  const duringPause = pz.state.runs.length;
  pzSys.resume('pz');
  await sleep(250);
  const afterResume = pz.state.runs.length;
  pzSys.stop();
  assert(duringPause === 0, 'paused job does not run', `runs=${duringPause}`);
  assert(afterResume >= 1, 'resumed job runs again', `runs=${afterResume}`);
  pzSys.close();

  // ---- removeJob ----
  const rm = makeExecutor();
  const rmSys = newSys('remove', { executor: rm.executor });
  rmSys.registerJob({ id: 'gone', name: 'gone', workflowId: 'x' });
  rmSys.removeJob('gone');
  assert(rmSys.listJobs().length === 0, 'removeJob removes from list');
  try {
    rmSys.trigger('gone');
    assert(false, 'removed job cannot trigger');
  } catch (e) {
    assert(e.code === SCH_CODES.UNKNOWN_JOB, 'removed job cannot trigger', `got ${e.code}`);
  }

  // ---- events ----
  const ev = makeExecutor();
  const evSys = newSys('events', { executor: ev.executor });
  let succeeded = 0;
  let started = 0;
  evSys.on('job_started', () => started++);
  evSys.on('job_succeeded', (p) => { if (p.jobId === 'ev-job') succeeded++; });
  evSys.registerJob({ id: 'ev-job', name: 'ev', workflowId: 'x' });
  await evSys.trigger('ev-job');
  assert(started === 1 && succeeded === 1, 'scheduler events emitted', `started=${started} succeeded=${succeeded}`);

  // ---- updateJob ----
  const up = makeExecutor();
  const upSys = newSys('update', { executor: up.executor });
  upSys.registerJob({ id: 'up', name: 'up', workflowId: 'x', schedule: { intervalMs: 30 } });
  upSys.updateJob('up', { enabled: false });
  upSys.start();
  await sleep(220);
  const duringDisable = up.state.runs.length;
  upSys.updateJob('up', { enabled: true });
  await sleep(200);
  const afterEnable = up.state.runs.length;
  upSys.stop();
  assert(duringDisable === 0, 'updateJob can disable scheduling', `runs=${duringDisable}`);
  assert(afterEnable >= 1, 'updateJob can re-enable scheduling', `runs=${afterEnable}`);
  upSys.close();

  // ---- stop stops the ticker ----
  const st = makeExecutor();
  const stSys = newSys('stop', { executor: st.executor });
  stSys.registerJob({ id: 'st', name: 'st', workflowId: 'x', schedule: { intervalMs: 30 } });
  stSys.start();
  await sleep(150);
  stSys.stop();
  await sleep(200);
  const afterStop = st.state.runs.length;
  await sleep(150);
  assert(afterStop === st.state.runs.length, 'stop halts scheduled execution', `stable at ${afterStop} runs`);
  stSys.close();

  // ---- input validation hook ----
  const val = makeExecutor();
  const valSys = newSys('validator', { executor: val.executor, validator: async () => { throw new Error('bad input payload'); } });
  valSys.registerJob({ id: 'val', name: 'val', workflowId: 'x' });
  const valResult = await valSys.trigger('val');
  assert(valResult.status === 'failed' && valResult.error.includes('input rejected'), 'input validator rejects before execution', JSON.stringify(valResult));

  // ---- named handlers ----
  const hdSys = newSys('handlers');
  hdSys.registerHandler('greet', (job, ctx) => ({ hello: ctx.input.name }));
  hdSys.registerJob({ id: 'greet-job', name: 'greet', handler: 'greet', input: { name: 'Sam' } });
  const good = await hdSys.trigger('greet-job');
  assert(good.status === 'succeeded' && good.result && good.result.hello === 'Sam', 'named handler execution', JSON.stringify(good));
  hdSys.registerJob({ id: 'ghost-job', name: 'ghost', handler: 'ghost-handler' });
  const bad = await hdSys.trigger('ghost-job');
  assert(bad.status === 'failed' && bad.error.includes('ghost-handler'), 'missing handler fails with clear error', JSON.stringify(bad));

  // ---- persistence ----
  const p1 = makeExecutor();
  const persRoot = path.join(TEST_ROOT, 'persist');
  const sys1 = new SchedulerSystem({ root: persRoot, tickMs: 1000, executor: p1.executor });
  sys1.registerJob({ id: 'keep', name: 'keep', workflowId: 'x', schedule: { cron: '0 2 * * *' } });
  const before = sys1.getJob('keep').nextRunAt;
  await sys1.trigger('keep');
  sys1.close();

  const p2 = makeExecutor();
  const sys2 = new SchedulerSystem({ root: persRoot, tickMs: 1000, executor: p2.executor });
  const reloaded = sys2.getJob('keep');
  assert(reloaded !== null && reloaded.nextRunAt === before, 'jobs persist across restarts');
  assert(sys2.history('keep').length === 1 && sys2.history('keep')[0].status === 'succeeded', 'job history persists across restarts');
  sys2.close();

  // ---- stats shape ----
  const ss = makeExecutor();
  const ssSys = newSys('stats', { executor: ss.executor });
  ssSys.registerJob({ id: 'st-a', name: 'a', workflowId: 'wf-a' });
  ssSys.registerJob({ id: 'st-b', name: 'b', workflowId: 'wf-b' });
  await ssSys.trigger('st-a');
  await ssSys.trigger('st-b');
  const sstats = ssSys.stats();
  assert(sstats.jobs === 2 && sstats.enabled === 2 && sstats.totalRuns === 2 && sstats.succeeded === 2, 'stats totals', JSON.stringify(sstats));
  assert(sstats.byWorkflow['wf-a'].runs === 1 && sstats.byWorkflow['wf-b'].runs === 1 && sstats.avgDurationMs >= 0 && sstats.lastRun.status === 'succeeded', 'stats by workflow + last run');

  // ---- real runtime integration ----
  const { Executor } = await import('../runtime/executor.js');
  const real = new SchedulerSystem({
    root: path.join(TEST_ROOT, 'real'),
    executor: async (job, ctx) => {
      const rt = new Executor({ root: path.resolve('AgencyOS') });
      return rt.run(job.workflowId, ctx.input, { seed: `sched-smoke:${ctx.runNumber}` });
    }
  });
  real.registerJob({ id: 'real-lead', name: 'real lead-discovery', workflowId: 'lead-discovery', input: { niche: 'Cairo F&B', region: 'EG' } });
  const realResult = await real.trigger('real-lead');
  assert(realResult.status === 'succeeded' && realResult.durationMs > 0, 'real workflow executes through scheduler', JSON.stringify(realResult).slice(0, 300));
  real.close();

  console.log(`\n=== SCHEDULER SMOKE: ${passed} PASS, ${failed} FAIL ===`);
  if (failures.length) console.log('failures:', failures.join(' | '));
  process.exit(failed === 0 ? 0 : 1);
};

main();
