import { assert, runTests, scratchRoot, baseSpec, createStack, createSystem, SIMULATED_ROWS } from './helpers.mjs';
import { buildRecord } from '../../discovery/enrich.js';

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

export const failureIsolation = {
  'one failing business does not stop the other executions': async () => {
    const root = scratchRoot('iso-1');
    const stack = await createStack(root);
    const target = buildRecord(SIMULATED_ROWS.find((r) => r.name === 'Nile Bites Grill')).id;
    const origExport = stack.website.export.bind(stack.website);
    let attempts = 0;
    stack.website.export = (site, opts = {}) => {
      if (site && site.businessId === target && ++attempts === 1) {
        const err = new Error('simulated provider outage');
        err.code = 'E_TR_NETWORK';
        err.meta = { retryable: true };
        throw err;
      }
      return origExport(site, opts);
    };
    const sys = createSystem(root, stack);
    await sys.boot();
    const started = sys.startCampaign(baseSpec());
    await sys.runCampaign(started.campaignId);
    await new Promise((r) => setTimeout(r, 1000));
    stack.website.export = origExport;
    for (let round = 0; round < 4; round++) {
      const pending = sys.pendingApprovals();
      if (!pending.length) break;
      for (const a of pending) sys.approve(a.id, { by: 'ops', reason: 'iso' });
      await new Promise((r) => setTimeout(r, 1500));
    }
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'COMPLETED', `campaign completes despite one failure, got ${all.state}`);
    assert(all.metrics.deployed === 4, `3 other + retried business deploy, got ${all.metrics.deployed}`);
    assert(all.metrics.failed === 0, `retries absorbed the transient failure, got ${all.metrics.failed}`);
    assert(all.metrics.rejected === 2, 'rejected businesses unaffected');
    const failed = all.executions.filter((e) => e.status === 'FAILED');
    assert(failed.length === 0, 'no permanent failures');
    const delivered = all.executions.filter((e) => e.status === 'DEPLOYED');
    assert(delivered.length === 4);
    sys.close();
  },

  'permanent business failure is isolated and the campaign still completes': async () => {
    const root = scratchRoot('iso-2');
    const stack = await createStack(root);
    const target = buildRecord(SIMULATED_ROWS.find((r) => r.name === 'Nile Bites Grill')).id;
    const origExport = stack.website.export.bind(stack.website);
    stack.website.export = (site, opts = {}) => {
      if (site && site.businessId === target) {
        const err = new Error('simulated permanent engine bug');
        err.code = 'E_ORC_SYSTEM';
        throw err;
      }
      return origExport(site, opts);
    };
    const sys = createSystem(root, stack);
    await sys.boot();
    const started = sys.startCampaign(baseSpec());
    await sys.runCampaign(started.campaignId);
    for (let round = 0; round < 4; round++) {
      const pending = sys.pendingApprovals();
      if (!pending.length) break;
      for (const a of pending) sys.approve(a.id, { by: 'ops', reason: 'iso' });
      await new Promise((r) => setTimeout(r, 1500));
    }
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'COMPLETED', `campaign completes with one failed business, got ${all.state}`);
    assert(all.metrics.deployed === 3, `3 deployed, got ${all.metrics.deployed}`);
    assert(all.metrics.failed === 1, `1 failed, got ${all.metrics.failed}`);
    assert(all.metrics.rejected === 2, `2 rejected, got ${all.metrics.rejected}`);
    const failed = all.executions.find((e) => e.status === 'FAILED');
    const full = sys.getExecution(failed.executionId);
    assert(full.error && full.error.code === 'E_ORC_SYSTEM', 'failure carries the classified code');
    const otherDeployed = all.executions.filter((e) => e.status === 'DEPLOYED');
    assert(otherDeployed.length === 3, 'other businesses deploy normally');
    sys.close();
  },

  'a business in QA_FAILED waits for a human decision and others proceed': async () => {
    const root = scratchRoot('iso-3');
    const stack = await createStack(root);
    const target = buildRecord(SIMULATED_ROWS.find((r) => r.name === 'Cairo Roast Coffee')).id;
    const origExport = stack.website.export.bind(stack.website);
    stack.website.export = (site, opts = {}) => {
      const files = origExport(site, opts);
      if (site && site.businessId === target) {
        for (const p of Object.keys(files)) {
          if (typeof files[p] === 'string' && p.endsWith('.html')) {
            files[p] = `${files[p]}\n<h1>Duplicate heading injected for QA failure</h1>`;
          }
        }
      }
      return files;
    };
    const sys = createSystem(root, stack);
    await sys.boot();
    const started = sys.startCampaign(baseSpec());
    await sys.runCampaign(started.campaignId);
    await new Promise((r) => setTimeout(r, 2000));
    const s = sys.status(started.campaignId);
    const qaFailed = s.executions.find((e) => e.status === 'QA_FAILED');
    assert(qaFailed, `target must reach QA_FAILED, got ${s.executions.map((e) => e.status).join(',')}`);
    const qaOverride = sys.requestQaOverride(qaFailed.executionId, { by: 'ops', reason: 'test override' });
    assert(qaOverride.kind === 'QA_OVERRIDE', 'QA override approval requested');
    sys.deny(qaOverride.id, { by: 'ops', reason: 'keep it broken' });
    for (let round = 0; round < 4; round++) {
      const pending = sys.pendingApprovals();
      if (!pending.length) break;
      for (const a of pending) sys.approve(a.id, { by: 'ops', reason: 'iso' });
      await new Promise((r) => setTimeout(r, 1500));
    }
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'COMPLETED', `campaign completes while one stays QA-denied, got ${all.state}`);
    const denied = all.executions.find((e) => e.executionId === qaFailed.executionId);
    assert(denied.status === 'FAILED' || denied.status === 'REJECTED', `denied execution must not deploy, got ${denied.status}`);
    assert(all.metrics.deployed === 3, `3 deployed, got ${all.metrics.deployed}`);
    sys.close();
  }
};

async function main() {
  const ok = await runTests('failure-isolation', failureIsolation);
  process.exit(ok ? 0 : 1);
}

main();
