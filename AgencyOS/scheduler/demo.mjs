import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchedulerSystem } from './index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_ROOT = path.join(ROOT, 'storage', 'scheduler-demo');
import fs from 'node:fs';
fs.rmSync(DEMO_ROOT, { recursive: true, force: true });

const main = async () => {
  const sys = new SchedulerSystem({ root: DEMO_ROOT, tickMs: 200 });

  sys.registerHandler('greet', (job, ctx) => ({ hello: ctx.input.name, at: new Date().toISOString() }));

  sys.registerJob({
    id: 'daily-sync',
    name: 'Daily lead sync',
    type: 'handler',
    handler: 'greet',
    input: { name: 'Cairo F&B' },
    schedule: { cron: '30 6 * * *' }
  });

  sys.registerJob({
    id: 'every-2s',
    name: 'Every 2 seconds',
    workflowId: 'lead-discovery',
    schedule: { intervalMs: 2000 },
    priority: 3
  });

  const manual = await sys.trigger('daily-sync', { name: 'Aswan Bakery' });
  console.log(`PASS manual trigger -> ${manual.status} (hello: ${manual.result?.hello})`);

  sys.start();
  await new Promise((r) => setTimeout(r, 4600));
  sys.stop();

  const runs = sys.history('every-2s');
  console.log(`PASS interval job ran ${runs.length} times`);

  const cron = sys.schedule('0 9 * * 1-5');
  console.log(`PASS cron parsed -> ${cron.summary} (next ${cron.nextRunAt})`);

  console.log('--- jobs ---');
  for (const job of sys.listJobs()) {
    console.log(`  [${job.id}] ${job.name} :: ${job.type || 'workflow'} :: last=${job.lastStatus || 'never'} :: runs=${sys.history(job.id).length}`);
  }

  const stats = sys.stats();
  console.log(`--- stats ---`);
  console.log(`  jobs=${stats.jobs} enabled=${stats.enabled} totalRuns=${stats.totalRuns}`);
  console.log(`  succeeded=${stats.succeeded} failed=${stats.failed} retried=${stats.retried}`);
  console.log(`  byWorkflow=${JSON.stringify(stats.byWorkflow)}`);

  sys.close();
  console.log('DEMO DONE');
};

main().catch((e) => { console.error('DEMO FAIL', e); process.exit(1); });
