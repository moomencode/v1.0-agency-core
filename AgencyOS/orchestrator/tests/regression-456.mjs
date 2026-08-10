import { assert, runTests, scratchRoot, baseSpec, createStack, createSystem, SIMULATED_ROWS } from './helpers.mjs';
import { LocalProvider } from '../../delivery/providers/local.js';
import { sleep } from '../utils.js';

const WAIT_MS = 120000;

const CONTACTS = [];

class CountingLocalProvider extends LocalProvider {
  async deploy(packageInfo) {
    CONTACTS.push(`deploy:${packageInfo.packageId}`);
    return super.deploy(packageInfo);
  }

  async promote(deploymentId) {
    CONTACTS.push(`promote:${deploymentId}`);
    return super.promote(deploymentId);
  }
}

async function waitFor(cond, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return;
    await sleep(100);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function waitForTerminal(sys, campaignId, timeoutMs = WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = sys.status(campaignId);
    if (last.state !== 'RUNNING' && last.state !== 'PAUSED' && last.state !== 'DRAFT' && last.state !== 'QUEUED') return last;
    await sleep(250);
  }
  throw new Error(`campaign stuck in ${last && last.state}`);
}

async function approveCampaign(sys, campaignId) {
  let rounds = 0;
  let emptyStreak = 0;
  while (rounds++ < 16) {
    const pend = sys.pendingApprovals().filter((a) => a.campaignId === campaignId);
    if (!pend.length) {
      if (++emptyStreak >= 2) break;
    } else {
      emptyStreak = 0;
      for (const a of pend) sys.approve(a.id, { by: 'test-operator', reason: 'b01 approve' });
    }
    await sleep(500);
  }
  const remaining = sys.pendingApprovals().filter((a) => a.campaignId === campaignId);
  assert(remaining.length === 0, `campaign ${campaignId} still has pending approvals: ${remaining.map((a) => a.kind).join(',')}`);
}

async function runCycle(sys, name) {
  const spec = baseSpec({ name });
  const started = sys.startCampaign(spec);
  const running = await sys.runCampaign(started.campaignId);
  assert(running.state === 'RUNNING', `${name} must RUN, got ${running.state}`);
  await approveCampaign(sys, started.campaignId);
  const fin = await waitForTerminal(sys, started.campaignId);
  assert(fin.state === 'COMPLETED', `${name} must COMPLETE, got ${fin.state}`);
  assert(fin.metrics.deployed === 4, `${name} must deploy 4, got ${fin.metrics.deployed}`);
  return { started, fin };
}

export const regression = {
  'B-01: orchestrator rollback completes via supported explicit mode end-to-end': async () => {
    CONTACTS.length = 0;
    const root = scratchRoot('regression-456-b01');
    const stack = await createStack(root);
    stack.delivery.registerProvider('local', CountingLocalProvider);
    const sys = createSystem(root, stack);
    await sys.boot();

    const row = SIMULATED_ROWS[0];
    const { fin: finA } = await runCycle(sys, 'b01-cycle-a');
    const byName = Object.fromEntries(stack.discovery.list().map((r) => [r.name, r.id]));
    const businessId = byName['Cairo Roast Coffee'];
    assert(businessId, 'fixture business discovered');
    const execA = finA.executions.find((e) => e.businessId === businessId);
    assert(execA && execA.status === 'DEPLOYED', 'cycle A business must be DEPLOYED');

    row.openingHours = ['Sat-Thu 09:00-23:00'];
    row.photos = [...row.photos, 'p6.jpg'];
    row.address = '12 Tahrir Square, Cairo (updated)';
    try {
      const { fin: finB } = await runCycle(sys, 'b01-cycle-b');
      const execB = finB.executions.find((e) => e.businessId === businessId);
      assert(execB && execB.status === 'DEPLOYED', 'cycle B business must be DEPLOYED');

      const execBFull = sys.getExecution(execB.executionId);
      const recB = stack.delivery.getRecord(execBFull.outputs.deliveryRecordId);
      assert(recB, 'cycle B delivery record exists');
      assert(recB.status === 'recorded', `cycle B record must be recorded, got ${recB.status}`);

      const records = stack.delivery.history().filter((r) => r.trace && r.trace.businessId === businessId);
      assert(records.length === 2, `two delivery records for the business, got ${records.length}`);
      const recA = records.find((r) => r.id !== recB.id);
      assert(recA && recA.status === 'recorded', 'cycle A record must be recorded');
      assert(recA.trace.buildId !== recB.trace.buildId, 'content change must produce distinct buildIds');

      let rolledBackEvents = 0;
      sys.on(sys.events.ORC_EVENTS.ROLLED_BACK, () => rolledBackEvents++);

      const requested = sys.rollback(execB.executionId, { by: 'test-operator', reason: 'b01 regression rollback' });
      assert(requested.status === 'approval_required', `rollback must enter the approval flow, got ${requested.status}`);

      const approval = sys.getApproval(requested.approvalId);
      assert(approval, 'rollback approval record exists');
      assert(approval.kind === 'SENSITIVE' && approval.step === 'rollback', `rollback approval must be SENSITIVE/rollback, got ${approval.kind}/${approval.step}`);
      assert(approval.decision === null || approval.decision.granted === undefined, 'rollback approval must be undecided before approve');
      assert(sys.pendingApprovals().some((a) => a.id === requested.approvalId), 'rollback approval must be pending');

      assert(stack.delivery.getRecord(recB.id).status === 'recorded', 'record must still be recorded before approval');

      sys.approve(requested.approvalId, { by: 'test-operator', reason: 'rollback approved' });
      await waitFor(() => stack.delivery.getRecord(recB.id).status === 'rolled_back', 'delivery record to reach rolled_back');

      const rec = stack.delivery.getRecord(recB.id);
      assert(rec.rollback && rec.rollback.mode === 'explicit', `rollback must execute with supported explicit mode, got ${rec.rollback && rec.rollback.mode}`);
      assert(rec.rollback.buildId === recA.trace.buildId, 'rolled back to the previous build');
      assert(rec.rollback.deploymentId === recA.deployment.id, 'rolled back to the previous deployment');

      const ex = sys.getExecution(execB.executionId);
      assert(ex.status === 'ROLLED_BACK', `execution must reach ROLLED_BACK, got ${ex.status}`);
      assert(ex.outcome && ex.outcome.verdict === 'ROLLED_BACK', `execution outcome must be ROLLED_BACK, got ${ex.outcome && ex.outcome.verdict}`);
      assert(!('rollbackPending' in (ex.outputs || {})), 'rollbackPending must be cleared');
      assert(rolledBackEvents === 1, `exactly one ROLLED_BACK event, got ${rolledBackEvents}`);

      const deploys = CONTACTS.filter((c) => c.startsWith('deploy:'));
      const promotes = CONTACTS.filter((c) => c.startsWith('promote:'));
      assert(deploys.length === 5, `exactly 5 deploys (4 cycle A + 1 changed cycle B; unchanged builds reuse records), got ${deploys.length}`);
      assert(promotes.length === 1, `exactly one promote from rollback, got ${promotes.length}`);
      await sleep(400);
      assert(CONTACTS.length === 6, 'no provider contact after rollback settles');

      let threw = false;
      try {
        sys.approve(requested.approvalId, { by: 'test-operator', reason: 'second approve' });
      } catch {
        threw = true;
      }
      assert(threw, 'approving the same rollback approval twice must throw');

      threw = false;
      try {
        sys.rollback(execB.executionId, { by: 'test-operator' });
      } catch {
        threw = true;
      }
      assert(threw, 'rollback on a ROLLED_BACK execution must throw');

      const st = sys.status(finB.campaignId);
      assert(st.state === 'COMPLETED', 'campaign must stay COMPLETED after rollback');
    } finally {
      delete row.openingHours;
      delete row.photos;
      delete row.address;
    }
    sys.close();
  }
};

async function main() {
  const ok = await runTests('regression-456', regression);
  process.exit(ok ? 0 : 1);
}

main();
