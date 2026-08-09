import path from 'node:path';
import fs from 'node:fs';
import { assert, runTests, scratchRoot, baseSpec, createStack, createSystem } from './helpers.mjs';
import { STEPS } from '../workflow/steps.js';

async function waitTerminal(sys, campaignId, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = sys.status(campaignId);
    if (last.state !== 'RUNNING' && last.state !== 'PAUSED' && last.state !== 'DRAFT' && last.state !== 'QUEUED') return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`campaign stuck in ${last && last.state}`);
}

async function approveAll(sys, rounds = 6) {
  for (let round = 0; round < rounds; round++) {
    const pending = sys.pendingApprovals();
    if (!pending.length) break;
    for (const a of pending) sys.approve(a.id, { by: 'ops', reason: 'acct' });
    await new Promise((r) => setTimeout(r, 1500));
  }
}

class FlakyProvider {
  constructor(config = {}, ctx = {}) {
    this.id = 'flaky';
    this.config = { project: 'flaky-proj', ...config };
    this.ctx = ctx;
    this.deploys = 0;
    this.perBuild = new Map();
    this.deployments = new Map();
    this.alias = null;
  }

  async validateConfig() {
    return { ok: true, project: this.config.project };
  }

  async health() {
    return { ok: true, provider: 'flaky' };
  }

  async deploy(packageInfo) {
    this.deploys++;
    const key = packageInfo.packageId;
    const attempts = (this.perBuild.get(key) || 0) + 1;
    this.perBuild.set(key, attempts);
    if (attempts <= 2) {
      const err = new Error('flaky transient network error');
      err.code = 'E_TR_NETWORK';
      err.retryable = true;
      throw err;
    }
    const deploymentId = `flaky-${packageInfo.packageId}`;
    this.deployments.set(deploymentId, { id: deploymentId, state: 'READY', url: `https://flaky.test/${packageInfo.packageId}` });
    this.alias = deploymentId;
    return { deploymentId, url: this.deployments.get(deploymentId).url, state: 'READY' };
  }

  async verify(deploymentId) {
    const d = this.deployments.get(deploymentId);
    if (!d) {
      const err = new Error('unknown deployment');
      err.code = 'E_DEL_PROVIDER_ERROR';
      err.retryable = false;
      throw err;
    }
    return { status: d.state, url: d.url };
  }

  async urlFor(deploymentId) {
    const d = this.deployments.get(deploymentId);
    return d ? d.url : null;
  }

  async promote(deploymentId) {
    this.alias = deploymentId;
    return { alias: this.config.project, deploymentId };
  }

  async listDeployments() {
    return [...this.deployments.values()];
  }

  dryRun(packageInfo) {
    return { provider: 'flaky', deploymentId: `flaky-${packageInfo.packageId}`, url: `https://flaky.test/${packageInfo.packageId}`, simulated: true };
  }
}

function deployDeps({ halted = false, calls = [] } = {}) {
  return {
    campaign: { _halted: halted },
    budget: {
      markDeployment: () => {
        calls.push('deployment');
        return true;
      },
      markProviderCall: () => {
        calls.push('provider');
        return true;
      }
    },
    approvals: {
      byExecution: () => [{ kind: 'DEPLOY', decision: { granted: true, decidedBy: 'ops' } }]
    },
    adapters: {
      delivery: {
        getRecord: () => ({ status: 'awaiting_approval' }),
        approve: async () => {
          calls.push('approve');
          return { status: 'recorded' };
        }
      }
    },
    trace: { append() {} },
    audit: { append() {} }
  };
}

export const accounting = {
  'businesses counter admits only maxBusinesses under concurrent dispatch': async () => {
    const root = scratchRoot('acct-biz-cap');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    const spec = baseSpec({ limits: { maxBusinesses: 2, maxConcurrent: 4 } });
    const started = sys.startCampaign(spec);
    await sys.runCampaign(started.campaignId);
    await approveAll(sys);
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'COMPLETED', `completed (${all.state})`);
    assert(all.metrics.executed === 2, `only 2 admitted, got ${all.metrics.executed}`);
    assert(all.executions.length === 2, `2 executions, got ${all.executions.length}`);
    const budget = sys.status(started.campaignId).budget;
    assert(budget.counters.businesses === 2, `counter matches admissions, got ${budget.counters.businesses}`);
    assert(budget.limits.maxBusinesses === 2, 'limit carried in budget');
    sys.close();
  },

  'maxBusinesses zero is rejected cleanly at the spec boundary and enforced at runtime': async () => {
    const root = scratchRoot('acct-biz-zero');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    let rejected = false;
    try {
      sys.startCampaign(baseSpec({ limits: { maxBusinesses: 0 } }));
    } catch (err) {
      rejected = true;
      assert(err.code === 'E_ORC_SCHEMA_INVALID', `schema rejection code (${err.code})`);
    }
    assert(rejected, 'maxBusinesses 0 is rejected at spec validation');

    const started = sys.startCampaign(baseSpec({ limits: { maxBusinesses: 1 } }));
    const campaignFile = path.join(root, 'storage', 'orchestrator-engine', 'campaigns', `${started.campaignId}.json`);
    const campaign = JSON.parse(fs.readFileSync(campaignFile, 'utf8'));
    campaign.budget.limits.maxBusinesses = 0;
    fs.writeFileSync(campaignFile, JSON.stringify(campaign, null, 2));
    await sys.runCampaign(started.campaignId);
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'COMPLETED', `runtime zero limit completes (${all.state})`);
    assert(all.metrics.executed === 0, 'nothing admitted with a zero runtime limit');
    assert(all.executions.length === 0, 'no executions created');
    const budget = sys.status(started.campaignId).budget;
    assert(budget.counters.businesses === 0, `counter stays 0, got ${budget.counters.businesses}`);
    sys.close();
  },

  'empty discovery admits nothing without touching the budget': async () => {
    const root = scratchRoot('acct-empty-discovery');
    const stack = await createStack(root, { rows: [] });
    const sys = createSystem(root, stack);
    await sys.boot();
    const spec = baseSpec();
    const started = sys.startCampaign(spec);
    let threw = false;
    try {
      await sys.runCampaign(started.campaignId);
    } catch (err) {
      threw = true;
      assert(typeof err.code === 'string' && err.code.startsWith('E_DIS_'), `discovery error code (${err.code})`);
    }
    assert(threw, 'empty discovery surfaces a clean discovery error');
    const s = sys.status(started.campaignId);
    assert(s.executions.length === 0, 'no executions admitted');
    assert(s.metrics.executed === 0, 'nothing executed');
    assert(s.budget.counters.businesses === 0, `counter stays 0, got ${s.budget.counters.businesses}`);
    await sys.stopCampaign(started.campaignId);
    sys.close();
  },

  'provider retries are counted per real attempt across the campaign': async () => {
    const root = scratchRoot('acct-prov-retry');
    const flaky = new FlakyProvider({ project: 'acct-flaky' }, { root });
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    sys.registerProvider('flaky', flaky);
    const spec = baseSpec({
      deployment: { provider: 'flaky', target: { project: 'acct-flaky' }, allowedProviders: ['flaky'] }
    });
    const started = sys.startCampaign(spec);
    await sys.runCampaign(started.campaignId);
    await approveAll(sys);
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'COMPLETED', `completed (${all.state})`);
    assert(all.metrics.deployed === 4, `4 deployments, got ${all.metrics.deployed}`);
    const budget = sys.status(started.campaignId).budget;
    assert(budget.counters.providerCalls === 12, `4 deployments x 3 attempts = 12 provider calls, got ${budget.counters.providerCalls}`);
    assert(flaky.deploys === 12, `provider saw 12 real attempts, got ${flaky.deploys}`);
    assert(flaky.deployments.size === 4, '4 successful deployments');
    sys.close();
  },

  'halt before the deploy step blocks provider and delivery contact': async () => {
    const calls = [];
    const deps = deployDeps({ halted: true, calls });
    const execution = { executionId: 'e-halt', businessId: 'b', outputs: { deliveryRecordId: 'dep_x', deliveryMode: 'explicit' } };
    let threw = false;
    try {
      await STEPS['deploy'].run(execution, deps);
    } catch (err) {
      threw = true;
      assert(err.code === 'E_ORC_HALTED', `halt code (${err.code})`);
    }
    assert(threw, 'halted campaign refuses the deploy step');
    assert(calls.length === 0, `no budget consumption, no approval, no delivery contact (got ${JSON.stringify(calls)})`);
  },

  'non-halted deploy proceeds to the delivery approval': async () => {
    const calls = [];
    const deps = deployDeps({ halted: false, calls });
    const execution = { executionId: 'e-ok', businessId: 'b', outputs: { deliveryRecordId: 'dep_x', deliveryMode: 'explicit' } };
    const result = await STEPS['deploy'].run(execution, deps);
    assert(result && result.event === 'DEPLOYED', 'step completes');
    assert(calls.includes('approve'), 'approval path reached');
    assert(calls.length === 2, `deployment + approval consumed (got ${JSON.stringify(calls)})`);
  },

  'halt before an auto-mode provider attempt blocks delivery contact': async () => {
    const calls = [];
    const deps = {
      campaign: { _halted: true, autonomyLevel: 'L5', deployment: { provider: 'flaky', target: {}, allowedProviders: ['flaky'] } },
      policy: {
        resolve: () => ({ autoGrant: [] }),
        deployModeFor: () => 'auto',
        assertProviderAllowed: () => {}
      },
      budget: {
        markDeployment: () => {
          calls.push('deployment');
          return true;
        },
        markProviderCall: () => {
          calls.push('provider');
          return true;
        }
      },
      approvals: { request() { throw new Error('must not be reached'); }, decide() { throw new Error('must not be reached'); } },
      adapters: {
        delivery: {
          deliver: async (args) => {
            args.onProviderAttempt();
            calls.push('deliver');
            return { id: 'dep_x', status: 'recorded' };
          }
        }
      },
      trace: { append() {} },
      audit: { append() {} }
    };
    const execution = {
      executionId: 'e-auto-halt',
      businessId: 'b',
      outputs: { buildId: '0123456789abcdef' }
    };
    let threw = false;
    try {
      await STEPS['request-delivery'].run(execution, deps);
    } catch (err) {
      threw = true;
      assert(err.code === 'E_ORC_HALTED', `halt code (${err.code})`);
    }
    assert(threw, 'halted campaign refuses the provider attempt');
    assert(!calls.includes('deliver'), 'delivery never contacted');
  }
};

async function main() {
  const ok = await runTests('accounting', accounting);
  process.exit(ok ? 0 : 1);
}

main();
