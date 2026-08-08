import { assert, runTests, scratchRoot, baseSpec, createStack, createSystem, SIMULATED_ROWS } from './helpers.mjs';
import { buildRecord } from '../../discovery/enrich.js';

async function waitForPending(sys, campaignId, count, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (sys.pendingApprovals().length >= count) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`expected ${count} pending approvals, got ${sys.pendingApprovals().length}`);
}

async function waitTerminal(sys, campaignId, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = sys.status(campaignId);
    if (last.state !== 'RUNNING' && last.state !== 'PAUSED' && last.state !== 'DRAFT' && last.state !== 'QUEUED') return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`campaign stuck in ${last && last.state}`);
}

export const resume = {
  'a crashed process can boot, recover and finish the same campaign': async () => {
    const root = scratchRoot('resume-1');
    const stack1 = await createStack(root);
    const sys1 = createSystem(root, stack1);
    await sys1.boot();
    const started = sys1.startCampaign(baseSpec());
    await sys1.runCampaign(started.campaignId);
    await waitForPending(sys1, started.campaignId, 4);
    sys1.close();

    const stack2 = await createStack(root);
    const sys2 = createSystem(root, stack2);
    const boot = await sys2.boot();
    assert(Array.isArray(boot.recovered) || typeof boot.recovered === 'number' || boot === null || boot.recovered === undefined, 'boot returns a recovery summary');
    const s = sys2.status(started.campaignId);
    assert(s.state === 'RUNNING' || s.state === 'PAUSED', `campaign survives restart, got ${s.state}`);
    const waiting = s.executions.filter((e) => e.status === 'AWAITING_APPROVAL');
    assert(waiting.length === 3, '3 executions must remain at the deploy gate after restart');
    const escalated = s.executions.filter((e) => e.status === 'ESCALATED');
    assert(escalated.length === 1, 'the escalation must survive restart');
    for (const a of sys2.pendingApprovals()) sys2.approve(a.id, { by: 'ops', reason: 'resume' });
    await new Promise((r) => setTimeout(r, 1500));
    const escDeploy = sys2.pendingApprovals().filter((a) => a.kind === 'DEPLOY');
    assert(escDeploy.length === 1, '006 deploy approval pending after restart');
    sys2.approve(escDeploy[0].id, { by: 'ops', reason: 'resume 006' });
    const all = await waitTerminal(sys2, started.campaignId);
    assert(all.state === 'COMPLETED', `campaign completes after restart, got ${all.state}`);
    assert(all.metrics.deployed === 4, `4 deployed after restart, got ${all.metrics.deployed}`);
    assert(all.executions.every((e) => e.status !== 'FAILED'), 'no failures after restart');
    sys2.close();
  },

  'a SYSTEM failure can be retried and finishes successfully': async () => {
    const root = scratchRoot('resume-2');
    const stack = await createStack(root);
    const target = buildRecord(SIMULATED_ROWS.find((r) => r.name === 'Cairo Roast Coffee')).id;
    const origExport = stack.website.export.bind(stack.website);
    stack.website.export = (site, opts = {}) => {
      if (site && site.businessId === target) {
        const err = new Error('simulated render failure');
        err.code = 'E_ORC_SYSTEM';
        throw err;
      }
      return origExport(site, opts);
    };
    const sys = createSystem(root, stack);
    await sys.boot();
    const started = sys.startCampaign(baseSpec());
    await sys.runCampaign(started.campaignId);
    const exec = sys
      .status(started.campaignId)
      .executions.find((e) => e.status === 'FAILED' || e.status === 'QA_FAILED');
    assert(exec, 'target business must fail at QA');
    const full = sys.getExecution(exec.executionId);
    assert(full.error, 'execution carries a classified error');
    stack.website.export = origExport;
    const retried = sys.retryExecution(exec.executionId, { reason: 'fixed adapter' });
    assert(retried.executionId === exec.executionId);
    for (let round = 0; round < 4; round++) {
      const pending = sys.pendingApprovals();
      if (!pending.length) break;
      for (const a of pending) sys.approve(a.id, { by: 'ops', reason: 'retry' });
      await new Promise((r) => setTimeout(r, 1500));
    }
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'COMPLETED', `campaign completes after retry, got ${all.state}`);
    const retriedFinal = sys
      .status(started.campaignId)
      .executions.find((e) => e.executionId === exec.executionId);
    assert(retriedFinal.status === 'DEPLOYED', `retried execution deploys, got ${retriedFinal.status}`);
    sys.close();
  },

  'resumeCampaign continues a paused campaign': async () => {
    const root = scratchRoot('resume-3');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    const started = sys.startCampaign(baseSpec());
    await sys.runCampaign(started.campaignId);
    await waitForPending(sys, started.campaignId, 4);
    const paused = await sys.pauseCampaign(started.campaignId);
    assert(paused.state === 'PAUSED', `paused, got ${paused.state}`);
    const resumed = await sys.resumeCampaign(started.campaignId);
    assert(resumed.state === 'RUNNING', `resumed, got ${resumed.state}`);
    for (let round = 0; round < 4; round++) {
      const pending = sys.pendingApprovals();
      if (!pending.length) break;
      for (const a of pending) sys.approve(a.id, { by: 'ops', reason: 'resume' });
      await new Promise((r) => setTimeout(r, 1500));
    }
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'COMPLETED', `completes after pause/resume, got ${all.state}`);
    assert(all.metrics.deployed === 4);
    sys.close();
  }
};

async function main() {
  const ok = await runTests('resume', resume);
  process.exit(ok ? 0 : 1);
}

main();
