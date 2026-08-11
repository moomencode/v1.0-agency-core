import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, scratchRoot, baseSpec, createStack, createSystem, SIMULATED_ROWS } from '../tests/helpers.mjs';
import { ORCHESTRATOR_API_VERSION, ORC_EVENTS } from '../index.js';

const WAIT_MS = 120000;
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

function section(title) {
  console.log('');
  console.log('='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
}

function line(label, value) {
  console.log(`  ${label}: ${value}`);
}

async function waitForTerminal(sys, campaignId, timeoutMs = WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = sys.status(campaignId);
    if (last.state !== 'RUNNING' && last.state !== 'PAUSED') return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`campaign did not reach a terminal state within ${timeoutMs}ms (state=${last && last.state})`);
}

async function waitForApproval(sys, kind, count = 1) {
  const deadline = Date.now() + WAIT_MS;
  let matches = [];
  while (Date.now() < deadline) {
    matches = sys.pendingApprovals().filter((a) => a.kind === kind);
    if (matches.length >= count) return matches;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`expected ${count} ${kind} approval(s) within ${WAIT_MS}ms, got ${matches.length}`);
}

async function driveCampaign(sys, campaignId, { timeoutMs = WAIT_MS, label = '' } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const summary = sys.status(campaignId);
    if (summary.state !== 'RUNNING' && summary.state !== 'PAUSED') return summary;
    const pending = sys.pendingApprovals().filter((a) => a.campaignId === campaignId);
    if (pending.length) {
      for (const rec of pending) {
        sys.approve(rec.id, { by: 'demo-operator', reason: `${label || 'demo'} — reviewed` });
      }
      continue;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${label} campaign ${campaignId} did not complete within ${timeoutMs}ms`);
}

function verdictFor(sys, execution) {
  if (execution.outcome && execution.outcome.verdict) return execution.outcome.verdict;
  const file = path.join(sys.stats().storageRoot, 'instances', execution.executionId, 'decision.json');
  if (fs.existsSync(file)) {
    try {
      const d = JSON.parse(fs.readFileSync(file, 'utf8'));
      return (d.decision && d.decision.verdict) || d.verdict || null;
    } catch {
      return null;
    }
  }
  return null;
}

async function run() {
  console.log('');
  console.log('  AUTONOMOUS AGENCY WORKFLOW ORCHESTRATOR — PHASE 4.5 DEMO');
  console.log('  Six-business simulated Cairo market, autonomy L4, zero network.');
  console.log(`  API version ${ORCHESTRATOR_API_VERSION}  |  state machine: 20 execution + 8 campaign states`);

  const root = scratchRoot('demo');
  const stack = await createStack(root);
  const sys = createSystem(root, stack);
  const boot = await sys.boot();

  section('1. Boot');
  line('storage', sys.stats().storageRoot);
  line('stale locks broken', boot.staleLocks);
  line('campaigns scanned', boot.campaigns);
  line('resumable executions', boot.resumable);
  line('killswitch armed', sys.killSwitch.file ? 'yes (file-based + ORC_EMERGENCY_STOP env)' : 'env-only');
  line('autonomy levels', 'L0 (manual) → L5 (auto-approve); demo runs at L4 — humans decide on deploy + escalation');

  section('2. Campaign start — six businesses');
  const spec = baseSpec({ name: 'demo-cairo-2026', maxBusinesses: 6 });
  const started = sys.startCampaign(spec);
  line('campaign', started.campaignId);
  line('name', 'demo-cairo-2026');
  line('autonomy', spec.autonomyLevel);
  line('provider', `${spec.deployment.provider} (zero network)`);
  line('limits', JSON.stringify(spec.limits));

  const summary = await sys.runCampaign(started.campaignId);
  line('discovered', summary.metrics.discovered);
  line('qualified', summary.metrics.qualified);
  line('campaign state', summary.state);
  line('executions', `${summary.executions.length} (awaiting human decisions — campaign stays RUNNING)`);

  section('3. Brain routing — every verdict is the real Brain, never re-scored');
  const byName = Object.fromEntries(stack.discovery.list().map((r) => [r.name, r.id]));
  const table = summary.executions.map((e) => ({
    business: Object.keys(byName).find((n) => byName[n] === e.businessId) || e.businessId,
    verdict: verdictFor(sys, e),
    status: e.status
  }));
  console.table(table);

  const e004 = summary.executions.find((e) => e.businessId === byName['Old Cairo Antiques']);
  const e005 = summary.executions.find((e) => e.businessId === byName['Zamalek Fashion Co']);
  const e006 = summary.executions.find((e) => e.businessId === byName['Corniche Electronics']);
  assert(table.filter((r) => r.status === 'AWAITING_APPROVAL').length === 3, '3 executions await deploy approval');
  assert(table.filter((r) => r.status === 'REJECTED').length === 2, '2 executions rejected');
  assert(table.filter((r) => r.status === 'ESCALATED').length === 1, '1 execution escalated');
  line('rejection 004', `${verdictFor(sys, e004)} — mandatory policy: premium website + below min opportunity`);
  line('rejection 005', `${verdictFor(sys, e005)} — duplicate business + premium website`);
  line('escalation 006', `${verdictFor(sys, e006)} — high risk (missing contact signals), human checkpoint`);

  section('4. Human approvals (L4)');
  const pending = sys.pendingApprovals();
  line('pending', `${pending.length} (${pending.map((a) => a.kind).join(', ')})`);
  assert(pending.length === 4, `4 pending approvals, got ${pending.length}`);
  const deployApprovals = pending.filter((a) => a.kind === 'DEPLOY');
  const escalateApprovals = pending.filter((a) => a.kind === 'ESCALATE');
  for (const rec of deployApprovals) {
    const decided = sys.approve(rec.id, { by: 'demo-operator', reason: 'verified business, ready to launch' });
    assert(decided.decision.granted === true, `approve ${rec.id}`);
  }
  sys.approve(escalateApprovals[0].id, { by: 'demo-operator', reason: 'reviewed risk — proceed after manual check' });
  line('approved', `${deployApprovals.length} DEPLOY + 1 ESCALATE`);

  section('5. Delivery via LocalProvider');
  const escDeploy = await waitForApproval(sys, 'DEPLOY', 1);
  const escApproval = escDeploy.find((a) => a.executionId === e006.executionId) || escDeploy[0];
  sys.approve(escApproval.id, { by: 'demo-operator', reason: 'deploy after escalation review' });
  const final = await waitForTerminal(sys, started.campaignId);
  assert(final.state === 'COMPLETED', `campaign COMPLETED, got ${final.state}`);
  line('deployed', final.metrics.deployed);
  line('rejected', final.metrics.rejected);
  line('failed', final.metrics.failed);
  line('waiting', final.metrics.waiting);

  const deployedExecs = final.executions.filter((e) => e.status === 'DEPLOYED');
  const firstDeployed = sys.getExecution(deployedExecs[0].executionId);
  const prodTree = stack.delivery.builds.readTree(firstDeployed.outputs.buildId);
  assert(prodTree && prodTree['delivery-meta.json'], 'production tree includes delivery-meta.json');
  line('production tree', `${Object.keys(prodTree).length} files (e.g. ${Object.keys(prodTree).slice(0, 5).join(', ')})`);
  line('delivery records', stack.delivery.history().length);

  section('6. Crash recovery — orchestrator restart on the same storage');
  const c3 = sys.startCampaign(baseSpec({ name: 'demo-recovery', maxBusinesses: 1, limits: { ...spec.limits, maxBusinesses: 1 } }));
  await sys.runCampaign(c3.campaignId);
  const c3Before = await (async () => {
    const deadline = Date.now() + WAIT_MS;
    while (Date.now() < deadline) {
      const pending = sys.pendingApprovals().filter((a) => a.campaignId === c3.campaignId);
      if (pending.length) return pending;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('no approval appeared for the recovery campaign');
  })();
  line('before crash', `campaign ${c3.campaignId} has ${c3Before.length} pending approval(s): ${c3Before.map((a) => a.kind).join(', ')}`);

  const sys2 = createSystem(root, stack);
  const boot2 = await sys2.boot();
  line('restart boot', `campaigns scanned ${boot2.campaigns}, stale locks ${boot2.staleLocks}, resumable ${boot2.resumable}, waiting ${boot2.waiting}`);
  const surviving = sys2.pendingApprovals().filter((a) => a.campaignId === c3.campaignId);
  assert(surviving.length === c3Before.length, 'pending approvals survive the restart');
  const c3Final = await driveCampaign(sys2, c3.campaignId, { label: 'recovery' });
  assert(c3Final.metrics.deployed === 1, `recovered campaign deploys 1, got ${c3Final.metrics.deployed}`);
  line('after restart', `campaign ${c3Final.state}, deployed ${c3Final.metrics.deployed} — RecoveryManager resumed through checkpoints`);

  section('7. Emergency stop — killswitch');
  const c4 = sys2.startCampaign(baseSpec({ name: 'demo-emergency-stop', maxBusinesses: 1, limits: { ...spec.limits, maxBusinesses: 1 } }));
  sys2.killSwitch.activate();
  const stoppedSummary = await sys2.runCampaign(c4.campaignId);
  line('killswitch active', 'true');
  line('campaign state', stoppedSummary.state);
  line('execution outcome', (stoppedSummary.executions[0].outcome && stoppedSummary.executions[0].outcome.verdict) || 'STOPPED');
  assert(stoppedSummary.state === 'STOPPED', `killswitch stops the campaign, got ${stoppedSummary.state}`);
  assert(stoppedSummary.executions[0].outcome && stoppedSummary.executions[0].outcome.verdict === 'STOPPED', 'execution outcome records emergency stop');

  sys2.killSwitch.clear();
  const rerun = await sys2.runCampaign(c4.campaignId, { force: true });
  const c4Final = await driveCampaign(sys2, c4.campaignId, { label: 'emergency re-run' });
  assert(c4Final.metrics.deployed === 1, `re-issued campaign deploys 1, got ${c4Final.metrics.deployed}`);
  line('after clear', `campaign ${c4Final.state}, deployed ${c4Final.metrics.deployed}`);

  section('8. Limits, budget and observability');
  line('budget counters', JSON.stringify(c4Final.budget.counters));
  line('budget reached', c4Final.budget.reached.length ? c4Final.budget.reached.join(', ') : 'none (within limits)');
  const trace = sys2.getTrace(deployedExecs[0].executionId);
  line('trace events', `${trace.events.length} (e.g. ${trace.events.slice(0, 3).map((e) => e.step || e.event || '?').join(', ')})`);
  const auditDir = path.join(root, 'logs', 'orchestrator');
  const auditFile = fs.readdirSync(auditDir)[0];
  const auditLines = fs.readFileSync(path.join(auditDir, auditFile), 'utf8').trim().split('\n').filter(Boolean);
  line('audit lines', auditLines.length);
  console.log('  audit tail:');
  for (const raw of auditLines.slice(-3)) {
    console.log(`    ${raw}`);
  }
  const artifacts = stack.artifacts.manager.list({ projectId: 'unassigned' });
  const byType = artifacts.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {});
  line('artifacts', Object.entries(byType).map(([k, v]) => `${k}:${v}`).join('  '));

  section('Demo complete');
  line('result', 'ALL CHECKS PASSED');
  line('storage', root);

  sys2.close();
  sys.close();
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error('DEMO FAILED:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
);
