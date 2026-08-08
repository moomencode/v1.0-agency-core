import { assert, runTests, scratchRoot, baseSpec, createStack, createSystem } from './helpers.mjs';
import { TERMINAL_STATES } from '../state/machine.js';

const WAIT_MS = 20000;

function pendingKinds(sys) {
  return sys.pendingApprovals().map((a) => a.kind);
}

async function run() {
  const root = scratchRoot('smoke');
  const stack = await createStack(root);
  const sys = createSystem(root, stack);
  await sys.boot();

  const spec = baseSpec();
  const started = sys.startCampaign(spec);
  assert(started.campaignId.startsWith('cmp-'), 'campaign id prefix');
  assert(started.resumed === false);

  const summary = await sys.runCampaign(started.campaignId);
  assert(summary.state === 'RUNNING', `campaign must stay RUNNING while executions wait, got ${summary.state}`);
  assert(summary.metrics.discovered === 6, `discovered ${summary.metrics.discovered}`);
  assert(summary.metrics.qualified === 6, `qualified ${summary.metrics.qualified}`);
  assert(summary.metrics.deployed === 0);

  const byName = Object.fromEntries(stack.discovery.list().map((r) => [r.name, r.id]));
  const executions = summary.executions;
  const byBusiness = Object.fromEntries(executions.map((e) => [e.businessId, e]));
  assert(byBusiness[byName['Cairo Roast Coffee']].status === 'AWAITING_APPROVAL', '001 awaits deploy approval');
  assert(byBusiness[byName['Nile Bites Grill']].status === 'AWAITING_APPROVAL', '002 awaits deploy approval');
  assert(byBusiness[byName['Khan El-Khalili Sweets']].status === 'AWAITING_APPROVAL', '003 awaits deploy approval');
  assert(byBusiness[byName['Old Cairo Antiques']].status === 'REJECTED', '004 must be REJECTED (premium website, below min opportunity)');
  assert(byBusiness[byName['Zamalek Fashion Co']].status === 'REJECTED', '005 must be REJECTED (duplicate with premium website)');
  assert(byBusiness[byName['Corniche Electronics']].status === 'ESCALATED', '006 must be ESCALATED (risk high)');

  const pending = sys.pendingApprovals();
  const deployApprovals = pending.filter((a) => a.kind === 'DEPLOY');
  const escalateApprovals = pending.filter((a) => a.kind === 'ESCALATE');
  assert(pending.length === 4, `expected 4 pending (3 DEPLOY + 1 ESCALATE), got ${pending.length}: ${pendingKinds(sys).join(',')}`);
  assert(deployApprovals.length === 3, `expected 3 DEPLOY approvals, got ${deployApprovals.length}`);
  assert(escalateApprovals.length === 1, `expected 1 ESCALATE approval, got ${escalateApprovals.length}`);

  for (const rec of deployApprovals) {
    const decided = sys.approve(rec.id, { by: 'test-operator', reason: 'smoke deploy' });
    assert(decided.decision.granted === true);
  }
  sys.approve(escalateApprovals[0].id, { by: 'test-operator', reason: 'proceed with risk' });
  await new Promise((r) => setTimeout(r, 1500));

  const second = sys.status(started.campaignId);
  const esc = second.executions.find((e) => e.businessId === byName['Corniche Electronics']);
  assert(esc.status === 'AWAITING_APPROVAL', `006 after escalation approval must await deploy approval, got ${esc.status}`);
  const escDeploy = sys.pendingApprovals().filter((a) => a.kind === 'DEPLOY' && a.executionId === esc.executionId);
  assert(escDeploy.length === 1, '006 deploy approval must be pending');
  sys.approve(escDeploy[0].id, { by: 'test-operator', reason: 'smoke deploy 006' });

  const all = await waitForTerminal(sys, started.campaignId, WAIT_MS);
  assert(all.state === 'COMPLETED', `campaign must COMPLETE, got ${all.state}`);
  assert(all.metrics.deployed === 4, `4 deployed, got ${all.metrics.deployed}`);
  assert(all.metrics.rejected === 2, `2 rejected, got ${all.metrics.rejected}`);
  assert(all.metrics.waiting === 0);
  assert(all.metrics.failed === 0);

  const finalExecs = all.executions;
  assert(finalExecs.length === 6, `6 executions, got ${finalExecs.length}`);
  for (const e of finalExecs) {
    assert(TERMINAL_STATES.has(e.status), `execution ${e.businessId} must be terminal, got ${e.status}`);
  }
  assert(finalExecs.filter((e) => e.status === 'DEPLOYED').length === 4, '4 DEPLOYED executions');
  assert(finalExecs.filter((e) => e.status === 'REJECTED').length === 2, '2 REJECTED executions');

  const recs = stack.delivery.history();
  assert(recs.length === 4, `4 delivery records, got ${recs.length}`);
  for (const rec of recs) {
    assert(['recorded', 'deployed', 'simulated'].includes(rec.status), `delivery record ${rec.id} status ${rec.status}`);
  }

  const artifacts = stack.artifacts.manager.list({ projectId: 'unassigned' });
  const byType = artifacts.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {});
  assert(byType['decision-record'] === 6, `6 decision records, got ${byType['decision-record']}`);
  assert(byType['execution-report'] === 4, `4 execution reports (only executed-through-report), got ${byType['execution-report']}`);
  assert(byType['execution-trace'] === 4, `4 execution traces, got ${byType['execution-trace']}`);
  assert(byType['approval-record'] >= 5, `approval records present (${byType['approval-record']})`);
  assert(byType['campaign-report'] === 1, `1 campaign report, got ${byType['campaign-report']}`);

  const memoryEntries = stack.memory.store.list('business');
  assert(memoryEntries.filter((e) => e.key.includes('orchestrator:execution')).length === 4, 'memory execution facts');
  assert(memoryEntries.filter((e) => e.key.includes('orchestrator:campaign')).length === 4, 'memory campaign facts');

  const deployedExec = sys.getExecution(finalExecs.find((e) => e.status === 'DEPLOYED').executionId);
  const executed = stack.delivery.builds.readTree(deployedExec.outputs.buildId);
  assert(executed && executed['delivery-meta.json'], 'production tree includes delivery-meta.json');

  const report = await sys.history();
  assert(Array.isArray(report));

  sys.close();
  console.log('smoke: full happy path completed');
}

async function waitForTerminal(sys, campaignId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = sys.status(campaignId);
    if (last.state !== 'RUNNING' && last.state !== 'PAUSED') return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`campaign did not reach a terminal state within ${timeoutMs}ms (state=${last && last.state})`);
}

export const smoke = {
  'end-to-end L4 campaign: 3 approve, 2 reject, 1 escalate, local deploys': async () => {
    await run();
  }
};

async function main() {
  const ok = await runTests('smoke', smoke);
  process.exit(ok ? 0 : 1);
}

main();
