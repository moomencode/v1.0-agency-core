import { assert, runTests, scratchRoot, baseSpec, createStack, createSystem } from './helpers.mjs';

async function waitTerminal(sys, campaignId, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = sys.status(campaignId);
    if (last.state !== 'RUNNING' && last.state !== 'PAUSED' && last.state !== 'DRAFT' && last.state !== 'QUEUED') return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`campaign stuck in ${last && last.state}`);
}

export const limits = {
  'maxDeployments stops the campaign at LIMITS_REACHED': async () => {
    const root = scratchRoot('limits-1');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    const spec = baseSpec({ limits: { maxDeployments: 2 } });
    const started = sys.startCampaign(spec);
    await sys.runCampaign(started.campaignId);
    for (let round = 0; round < 4; round++) {
      const pending = sys.pendingApprovals();
      if (!pending.length) break;
      for (const a of pending) sys.approve(a.id, { by: 'ops', reason: 'limit' });
      await new Promise((r) => setTimeout(r, 1500));
    }
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'LIMITS_REACHED', `campaign must end LIMITS_REACHED, got ${all.state}`);
    assert(all.metrics.deployed === 2, `exactly 2 deployments, got ${all.metrics.deployed}`);
    assert(all.metrics.failed === 2, `the remaining candidates fail on the deployment cap, got ${all.metrics.failed}`);
    const budget = sys.status(started.campaignId).budget;
    assert(budget.limits.maxDeployments === 2, 'limit carried in budget');
    assert(budget.counters.deployments === 2, `deployment counter matches the cap, got ${budget.counters.deployments}`);
    assert(budget.reached.includes('deployments'), 'deployment limit recorded as reached');
    sys.close();
  },

  'a tiny execution duration limit drives the campaign to LIMITS_REACHED': async () => {
    const root = scratchRoot('limits-2');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    const spec = baseSpec({ limits: { maxExecutionDurationMs: 30, maxCampaignDurationMs: 600000 } });
    const started = sys.startCampaign(spec);
    const summary = await sys.runCampaign(started.campaignId);
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'LIMITS_REACHED', `campaign must end LIMITS_REACHED, got ${all.state}`);
    assert(summary.metrics.executed === 6, 'all businesses were attempted');
    for (const e of all.executions) {
      const full = sys.getExecution(e.executionId);
      assert(
        full.error === null || full.error.code === 'E_ORC_LIMITS_REACHED',
        `executions must stop only on the duration limit, got ${full.error ? full.error.code : 'none'}`
      );
    }
    sys.close();
  },

  'maxAiCalls caps brain evaluations without blocking the whole campaign': async () => {
    const root = scratchRoot('limits-3');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    const spec = baseSpec({ limits: { maxAiCalls: 3 } });
    const started = sys.startCampaign(spec);
    const summary = await sys.runCampaign(started.campaignId);
    assert(summary.metrics.executed === 6, 'all businesses were attempted');
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'LIMITS_REACHED', `campaign must end LIMITS_REACHED, got ${all.state}`);
    const evaluated = all.executions.filter((e) => e.status !== 'FAILED');
    assert(evaluated.length >= 3, 'at least 3 executions completed evaluation');
    const aiBudget = all.budget.counters.aiCalls;
    assert(aiBudget <= 3, `aiCalls respected, got ${aiBudget}`);
    sys.close();
  }
};

async function main() {
  const ok = await runTests('limits', limits);
  process.exit(ok ? 0 : 1);
}

main();
