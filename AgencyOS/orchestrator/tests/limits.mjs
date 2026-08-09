import { assert, runTests, scratchRoot, baseSpec, createStack, createSystem } from './helpers.mjs';
import { LocalProvider } from '../../delivery/providers/local.js';

class CountingLocalProvider extends LocalProvider {
  constructor(config = {}, ctx = {}) {
    super(config, ctx);
    this.deployCalls = 0;
  }

  async deploy(packageInfo) {
    this.deployCalls++;
    return super.deploy(packageInfo);
  }
}

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

function spyBrainCalls(sys) {
  const orig = sys.adapters.brain.evaluate.bind(sys.adapters.brain);
  let calls = 0;
  sys.adapters.brain.evaluate = async (record) => {
    calls++;
    return orig(record);
  };
  return () => calls;
}

function spyProviderCalls(sys, root) {
  const counting = new CountingLocalProvider({ project: 'limits-count' }, { root });
  sys.registerProvider('local', counting);
  const origDeliver = sys.adapters.delivery.deliver.bind(sys.adapters.delivery);
  let autoDelivers = 0;
  sys.adapters.delivery.deliver = (args) => {
    if (args && args.mode === 'auto') autoDelivers++;
    return origDeliver(args);
  };
  return () => ({ approves: counting.deployCalls, autoDelivers });
}

async function approveAll(sys, rounds = 4) {
  for (let round = 0; round < rounds; round++) {
    const pending = sys.pendingApprovals();
    if (!pending.length) break;
    for (const a of pending) sys.approve(a.id, { by: 'ops', reason: 'limit' });
    await new Promise((r) => setTimeout(r, 1500));
  }
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
  },

  'maxAiCalls zero blocks every brain evaluation': async () => {
    const root = scratchRoot('limits-ai-0');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    const brainCalls = spyBrainCalls(sys);
    const spec = baseSpec({ limits: { maxAiCalls: 0 } });
    const started = sys.startCampaign(spec);
    await sys.runCampaign(started.campaignId);
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'LIMITS_REACHED', `campaign must end LIMITS_REACHED, got ${all.state}`);
    assert(brainCalls() === 0, `zero brain calls, got ${brainCalls()}`);
    assert(all.budget.counters.aiCalls === 0, `aiCalls counter stays 0, got ${all.budget.counters.aiCalls}`);
    assert(all.metrics.failed === 6, `every execution fails at evaluation, got ${all.metrics.failed}`);
    for (const e of all.executions) {
      if (e.status === 'FAILED') {
        const full = sys.getExecution(e.executionId);
        assert(full.error && full.error.code === 'E_ORC_LIMITS_REACHED', 'evaluation failure classified as limit');
      }
    }
    sys.close();
  },

  'maxAiCalls N allows exactly N evaluations, no more': async () => {
    const root = scratchRoot('limits-ai-n');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    const brainCalls = spyBrainCalls(sys);
    const spec = baseSpec({ limits: { maxAiCalls: 3 } });
    const started = sys.startCampaign(spec);
    await sys.runCampaign(started.campaignId);
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'LIMITS_REACHED', `campaign must end LIMITS_REACHED, got ${all.state}`);
    assert(brainCalls() === 3, `exactly 3 brain calls, got ${brainCalls()}`);
    assert(all.budget.counters.aiCalls === 3, `aiCalls counter matches cap, got ${all.budget.counters.aiCalls}`);
    assert(all.metrics.failed === 3, `the remaining executions are blocked before the brain, got ${all.metrics.failed}`);
    sys.close();
  },

  'a concurrent burst never exceeds the ai cap': async () => {
    const root = scratchRoot('limits-ai-burst');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    const brainCalls = spyBrainCalls(sys);
    const spec = baseSpec({ limits: { maxAiCalls: 3, maxConcurrent: 4 } });
    const started = sys.startCampaign(spec);
    await sys.runCampaign(started.campaignId);
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'LIMITS_REACHED', `campaign must end LIMITS_REACHED, got ${all.state}`);
    assert(brainCalls() === 3, `burst of parallel evaluations still capped at 3, got ${brainCalls()}`);
    assert(all.budget.counters.aiCalls === 3, `aiCalls counter matches cap, got ${all.budget.counters.aiCalls}`);
    sys.close();
  },

  'maxProviderCalls zero blocks every provider contact': async () => {
    const root = scratchRoot('limits-prov-0');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    const providerCalls = spyProviderCalls(sys, root);
    const spec = baseSpec({ limits: { maxProviderCalls: 0, maxDeployments: 50 } });
    const started = sys.startCampaign(spec);
    await sys.runCampaign(started.campaignId);
    await approveAll(sys);
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'LIMITS_REACHED', `campaign must end LIMITS_REACHED, got ${all.state}`);
    const spy = providerCalls();
    assert(spy.approves === 0, `zero provider approvals, got ${spy.approves}`);
    assert(all.budget.counters.providerCalls === 0, `providerCalls counter stays 0, got ${all.budget.counters.providerCalls}`);
    assert(all.metrics.deployed === 0, 'nothing deployed');
    for (const rec of stack.delivery.history()) {
      assert(!['recorded', 'deployed'].includes(rec.status), `no delivery record may reach the provider, got ${rec.status}`);
    }
    sys.close();
  },

  'maxProviderCalls N caps provider contact exactly': async () => {
    const root = scratchRoot('limits-prov-n');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    const providerCalls = spyProviderCalls(sys, root);
    const spec = baseSpec({ limits: { maxProviderCalls: 2, maxDeployments: 50 } });
    const started = sys.startCampaign(spec);
    await sys.runCampaign(started.campaignId);
    await approveAll(sys);
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'LIMITS_REACHED', `campaign must end LIMITS_REACHED, got ${all.state}`);
    const spy = providerCalls();
    assert(spy.approves === 2, `exactly 2 provider contacts, got ${spy.approves}`);
    assert(all.budget.counters.providerCalls === 2, `providerCalls counter matches cap, got ${all.budget.counters.providerCalls}`);
    assert(all.metrics.deployed === 2, `exactly 2 deployments, got ${all.metrics.deployed}`);
    assert(all.metrics.failed === 2, `the remaining candidates fail before the provider, got ${all.metrics.failed}`);
    sys.close();
  },

  'maxDeployments zero blocks every deployment': async () => {
    const root = scratchRoot('limits-dep-0');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    const providerCalls = spyProviderCalls(sys, root);
    const spec = baseSpec({ limits: { maxDeployments: 0, maxProviderCalls: 50 } });
    const started = sys.startCampaign(spec);
    await sys.runCampaign(started.campaignId);
    await approveAll(sys);
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'LIMITS_REACHED', `campaign must end LIMITS_REACHED, got ${all.state}`);
    const spy = providerCalls();
    assert(spy.approves === 0, `zero provider approvals, got ${spy.approves}`);
    assert(all.budget.counters.deployments === 0, `deployments counter stays 0, got ${all.budget.counters.deployments}`);
    assert(all.metrics.deployed === 0, 'nothing deployed');
    for (const rec of stack.delivery.history()) {
      assert(!['recorded', 'deployed'].includes(rec.status), `no delivery record may reach the provider, got ${rec.status}`);
    }
    sys.close();
  },

  'auto mode respects provider and deployment caps before contacting the provider': async () => {
    const root = scratchRoot('limits-auto');
    const stack = await createStack(root, { autoAllowed: true });
    const sys = createSystem(root, stack, { autoAllowed: true });
    await sys.boot();
    const providerCalls = spyProviderCalls(sys, root);
    const spec = baseSpec({ limits: { maxProviderCalls: 1, maxDeployments: 1 } , autonomyLevel: 'L5' });
    const started = sys.startCampaign(spec);
    await sys.runCampaign(started.campaignId);
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'LIMITS_REACHED', `campaign must end LIMITS_REACHED, got ${all.state}`);
    const spy = providerCalls();
    assert(spy.autoDelivers === 1, `auto mode contacts the provider exactly once, got ${spy.autoDelivers}`);
    assert(all.budget.counters.providerCalls === 1, `providerCalls counter matches cap, got ${all.budget.counters.providerCalls}`);
    assert(all.budget.counters.deployments === 1, `deployments counter matches cap, got ${all.budget.counters.deployments}`);
    const deployed = stack.delivery.history().filter((r) => ['recorded', 'deployed'].includes(r.status));
    assert(deployed.length === 1, `exactly 1 live deployment, got ${deployed.length}`);
    sys.close();
  }
};

async function main() {
  const ok = await runTests('limits', limits);
  process.exit(ok ? 0 : 1);
}

main();
