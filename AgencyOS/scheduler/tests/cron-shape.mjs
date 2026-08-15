import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchedulerSystem } from '../index.js';
import { sleep } from '../../runtime/utils.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_ROOT = path.resolve(REPO_ROOT, '..', 'var', 'tmp', 'scheduler-cron-shape');
fs.rmSync(TEST_ROOT, { recursive: true, force: true });

let passed = 0;
let failed = 0;
function assert(cond, label, extra = '') {
  if (cond) { passed++; console.log(`PASS ${label}`); }
  else { failed++; console.log(`FAIL ${label} ${extra}`); }
}

const tickMs = 40;
const sleepMs = (n) => new Promise((r) => setTimeout(r, n));

// 1 — legacy { cron } shape still accepted (regression guard)
{
  const sys = new SchedulerSystem({ root: path.join(TEST_ROOT, 'legacy'), tickMs, executor: async () => ({ ok: true }) });
  sys.registerJob({ id: 'legacy', name: 'legacy', handler: 'legacy', schedule: { cron: '30 6 * * *' } });
  const job = sys.engine.store.get('legacy');
  assert(job && job.schedule && job.schedule.type === 'cron', 'legacy cron shape normalized to {type:cron}', JSON.stringify(job?.schedule));
  assert(job.schedule.expr === '30 6 * * *', 'expr preserved from legacy shape');
  assert(job.nextRunAt && !Number.isNaN(Date.parse(job.nextRunAt)), 'nextRunAt computed for legacy shape');
  sys.close();
}

// 2 — JobFramework-style { type:'cron', expr } shape accepted (4.7.0 fix)
{
  const sys = new SchedulerSystem({ root: path.join(TEST_ROOT, 'newshape'), tickMs, executor: async () => ({ ok: true }) });
  sys.registerJob({ id: 'newshape', name: 'newshape', handler: 'newshape', schedule: { type: 'cron', expr: '0 5 * * *' } });
  const job = sys.engine.store.get('newshape');
  assert(job && job.schedule && job.schedule.type === 'cron', 'type/cron/expr shape accepted', JSON.stringify(job?.schedule));
  assert(job.schedule.expr === '0 5 * * *', 'expr carried through validation');
  const listed = sys.listJobs().find((j) => j.id === 'newshape');
  assert(listed && listed.cronExpr === '0 5 * * *', 'cronExpr surfaced in listJobs');
  sys.close();
}

// 3 — a due cron job auto-fires through the scheduler tick (auto-fire proof)
{
  const runs = [];
  const sys = new SchedulerSystem({
    root: path.join(TEST_ROOT, 'autofire'), tickMs,
    executor: async (job, ctx) => { runs.push({ jobId: job.id, runNumber: ctx.runNumber, trigger: ctx.trigger }); return { ok: true }; }
  });
  sys.registerJob({ id: 'auto', name: 'auto', handler: 'auto', schedule: { type: 'cron', expr: '* * * * *' } });
  const job = sys.engine.store.get('auto');
  job.nextRunAt = new Date(Date.now() - 1000).toISOString();
  sys.engine.store.saveJob(job);
  sys.start();
  await sleepMs(150);
  assert(runs.length === 1, 'due cron job fired via scheduler tick (no manual trigger)', JSON.stringify(runs));
  assert(runs[0].runNumber === 1, 'run numbers advance');
  const advanced = sys.engine.store.get('auto');
  assert(advanced.nextRunAt && new Date(advanced.nextRunAt).getTime() > Date.now(), 'nextRunAt advanced past the fire');
  assert(sys.history('auto').length === 1, 'history records the auto-fired run');
  const dispatches = JSON.parse(fs.readFileSync(path.join(TEST_ROOT, 'autofire', 'storage', 'scheduler-engine', '_dispatches.json'), 'utf8'));
  assert(dispatches.length === 0, 'dispatch journal drained (SCH-01 clean)');
  sys.close();
}

// 4 — end-to-end: JobFramework registration reaches the scheduler and fires
{
  const { createIntelligence } = await import('../../intelligence/index.js');
  const { writeFixtureStorage, fixedClock, INT_ROOT } = await import('../../intelligence/tests/helpers.mjs');
  const base = path.join(TEST_ROOT, 'e2e');
  const fixture = writeFixtureStorage(base);
  const scheduler = new SchedulerSystem({ root: path.join(base, 'storage', 'scheduler-system'), tickMs });
  const engine = createIntelligence({
    root: INT_ROOT,
    scheduler,
    clock: fixedClock(),
    orchestratorRoot: fixture.orchestratorRoot,
    deliveryRoot: fixture.deliveryRoot,
    schedulerBaseDir: fixture.schedulerBaseDir,
    killswitchRoot: fixture.orchestratorRoot,
    storageRoot: path.join(base, 'intel-storage')
  });
  const inScheduler = scheduler.listJobs().map((j) => j.id);
  assert(inScheduler.includes('intelligence:retention'), 'retention job registered with scheduler', JSON.stringify(inScheduler));
  assert(scheduler.listJobs().find((j) => j.id === 'intelligence:retention')?.cronExpr === '0 5 * * *', 'cronExpr registered from config schedule');
  const job = scheduler.engine.store.get('intelligence:retention');
  job.nextRunAt = new Date(Date.now() - 1000).toISOString();
  scheduler.engine.store.saveJob(job);
  scheduler.start();
  let marker = null;
  for (let i = 0; i < 40; i++) {
    await sleepMs(50);
    marker = engine.framework.loadMarker('intelligence:retention');
    if (marker && marker.status === 'completed') break;
  }
  assert(marker && marker.status === 'completed', 'intelligence job executed through the scheduler tick', JSON.stringify(marker));
  const insights = engine.insights.list('retention');
  assert(insights.length >= 1, 'scheduler-fired retention run produced insights');
  scheduler.close();
  engine.stop();
}

// 5 — invalid cron expression still rejected
{
  const sys = new SchedulerSystem({ root: path.join(TEST_ROOT, 'invalid'), tickMs, executor: async () => ({ ok: true }) });
  let threw = null;
  try {
    sys.registerJob({ id: 'bad', name: 'bad', handler: 'bad', schedule: { type: 'cron', expr: 'not a cron' } });
  } catch (err) {
    threw = err;
  }
  assert(threw && threw.code === 'E_SCH_CRON_INVALID', 'invalid cron expr rejected with CRON_INVALID', threw?.code);
  sys.close();
}

console.log(`\nintelligence/scheduler-cron-shape: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;