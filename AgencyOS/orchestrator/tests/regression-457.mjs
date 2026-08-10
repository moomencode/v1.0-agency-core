import fs from 'node:fs';
import path from 'node:path';
import { assert, runTests, scratchRoot, baseSpec, createStack, createSystem, SIMULATED_ROWS } from './helpers.mjs';
import { LockManager } from '../concurrency/lock.js';
import { sleep } from '../utils.js';

const WAIT_MS = 120000;

async function waitFor(cond, label, timeoutMs = 30000) {
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
    if (!['RUNNING', 'PAUSED', 'DRAFT', 'QUEUED'].includes(last.state)) return last;
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
      for (const a of pend) sys.approve(a.id, { by: 'test-operator', reason: 'r457 approve' });
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

function auditText(root) {
  const auditDir = path.join(root, 'logs', 'orchestrator');
  if (!fs.existsSync(auditDir)) return '';
  return fs
    .readdirSync(auditDir)
    .filter((f) => f.endsWith('.ndjson'))
    .map((f) => fs.readFileSync(path.join(auditDir, f), 'utf8'))
    .join('');
}

export const regression = {
  'A-01: failing rollback leaves execution FAILED, no crash, no false ROLLED_BACK': async () => {
    const root = scratchRoot('regression-457-a01');
    const stack = await createStack(root);
    stack.delivery.rollback = async () => {
      throw Object.assign(new Error('provider promote exploded'), { code: 'E_DEL_PROVIDER_ERROR' });
    };
    const sys = createSystem(root, stack);
    await sys.boot();
    const row = SIMULATED_ROWS[0];
    try {
      await runCycle(sys, 'r457-a01-cycle-a');
      row.openingHours = ['Sat-Thu 09:00-23:00'];
      row.address = '12 Tahrir Square, Cairo (updated)';
      const { fin: finB } = await runCycle(sys, 'r457-a01-cycle-b');
      const byName = Object.fromEntries(stack.discovery.list().map((r) => [r.name, r.id]));
      const businessId = byName['Cairo Roast Coffee'];
      assert(businessId, 'fixture business discovered');
      const execB = finB.executions.find((e) => e.businessId === businessId);
      assert(execB && execB.status === 'DEPLOYED', 'cycle B business must be DEPLOYED');

      let rolledBackEvents = 0;
      let failedEvents = 0;
      sys.on(sys.events.ORC_EVENTS.ROLLED_BACK, () => rolledBackEvents++);
      sys.on(sys.events.ORC_EVENTS.FAILED, (p) => {
        if (p.step === 'rollback') failedEvents++;
      });

      const requested = sys.rollback(execB.executionId, { by: 'test-operator', reason: 'a01 failing rollback' });
      assert(requested.status === 'approval_required', `rollback must enter the approval flow, got ${requested.status}`);

      sys.approve(requested.approvalId, { by: 'test-operator', reason: 'approve failing rollback' });

      await waitFor(() => sys.getExecution(execB.executionId).status === 'FAILED', 'execution to reach FAILED');
      const ex = sys.getExecution(execB.executionId);
      assert(ex.status === 'FAILED', `execution must be FAILED, got ${ex.status}`);
      assert(ex.outcome && ex.outcome.verdict === 'FAILED', `outcome verdict must be FAILED, got ${ex.outcome && ex.outcome.verdict}`);
      assert(ex.outcome && ex.outcome.code === 'E_DEL_PROVIDER_ERROR', `outcome must carry the provider error code, got ${ex.outcome && ex.outcome.code}`);
      assert(ex.error && ex.error.class === 'BUSINESS', `error must classify as BUSINESS, got ${ex.error && ex.error.class}`);
      assert(!('rollbackPending' in (ex.outputs || {})), 'rollbackPending must be cleared after failure');
      assert(rolledBackEvents === 0, `no ROLLED_BACK event on failure, got ${rolledBackEvents}`);
      assert(failedEvents === 1, `exactly one rollback FAILED event, got ${failedEvents}`);

      const rec = stack.delivery.getRecord(ex.outputs.deliveryRecordId);
      assert(rec.status === 'recorded', `delivery record must not be falsely rolled_back, got ${rec.status}`);

      await sleep(500);
      const audit = auditText(root);
      assert(audit.includes('rollback_failed'), 'audit must record rollback_failed');
    } finally {
      delete row.openingHours;
      delete row.address;
    }
    sys.close();
  },

  'A-02: denied rollback approval never deadlocks: fresh request approves and rolls back': async () => {
    const root = scratchRoot('regression-457-a02');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    const row = SIMULATED_ROWS[0];
    try {
      await runCycle(sys, 'r457-a02-cycle-a');
      row.openingHours = ['Sat-Thu 09:00-23:00'];
      row.address = '12 Tahrir Square, Cairo (updated)';
      const { fin: finB } = await runCycle(sys, 'r457-a02-cycle-b');
      const byName = Object.fromEntries(stack.discovery.list().map((r) => [r.name, r.id]));
      const businessId = byName['Cairo Roast Coffee'];
      const execB = finB.executions.find((e) => e.businessId === businessId);
      assert(execB && execB.status === 'DEPLOYED', 'cycle B business must be DEPLOYED');

      const firstReq = sys.rollback(execB.executionId, { by: 'test-operator', reason: 'a02 rollback 1' });
      const first = sys.getApproval(firstReq.approvalId);
      assert(first.kind === 'SENSITIVE' && first.step === 'rollback', `first approval must be SENSITIVE/rollback, got ${first.kind}/${first.step}`);
      assert(first.decision === null, 'first approval must be pending');

      sys.deny(first.id, { by: 'test-operator', reason: 'not now' });

      let ex = sys.getExecution(execB.executionId);
      assert(ex.status === 'DEPLOYED', `execution must stay DEPLOYED after deny, got ${ex.status}`);
      assert(!('rollbackPending' in (ex.outputs || {})), 'rollbackPending must be cleared after denial');
      assert(ex.outcome === null, `DEPLOYED outcome must not be polluted by denial, got ${JSON.stringify(ex.outcome)}`);

      const secondReq = sys.rollback(execB.executionId, { by: 'test-operator', reason: 'a02 rollback 2' });
      assert(secondReq.approvalId !== first.id, 'a fresh approval identity must be minted after deny');
      const second = sys.getApproval(secondReq.approvalId);
      assert(second.decision === null, 'second approval must be pending and grantable');
      assert(second.step === 'rollback-2', `second approval must use a fresh step, got ${second.step}`);
      assert(sys.pendingApprovals().some((a) => a.id === second.id), 'second approval must be pending');

      let threw = false;
      try {
        sys.approve(first.id, { by: 'test-operator', reason: 'stale approve' });
      } catch {
        threw = true;
      }
      assert(threw, 'approving the old terminal approval must still fail');

      const recordId = sys.getExecution(execB.executionId).outputs.deliveryRecordId;
      sys.approve(second.id, { by: 'test-operator', reason: 'a02 approved' });
      await waitFor(() => sys.getExecution(execB.executionId).status === 'ROLLED_BACK', 'execution to reach ROLLED_BACK');
      ex = sys.getExecution(execB.executionId);
      assert(ex.status === 'ROLLED_BACK', `execution must reach ROLLED_BACK, got ${ex.status}`);
      assert(ex.outcome && ex.outcome.verdict === 'ROLLED_BACK', `outcome must be ROLLED_BACK, got ${ex.outcome && ex.outcome.verdict}`);
      assert(stack.delivery.getRecord(recordId).status === 'rolled_back', 'delivery record must be rolled back');
    } finally {
      delete row.openingHours;
      delete row.address;
    }
    sys.close();
  },

  'A-03: lock filenames cannot escape the locks directory via hostile businessId': async () => {
    const root = scratchRoot('regression-457-a03');
    const lm = new LockManager({ root: path.join(root, 'engine'), ttlMs: 60000 });
    const locksDir = path.join(root, 'engine', 'locks');
    const hostile = ['../../escape', '..\\escape', 'C:\\evil', 'a/b/c', 'biz\u0000x', '..', 'normal-biz-1'];
    hostile.forEach((id, i) => lm.acquire(id, `exec-${i}`));

    const files = fs.readdirSync(locksDir);
    assert(files.length === hostile.length, `every hostile id must produce a lock file inside, got ${files.length}/${hostile.length}`);
    for (const f of files) {
      assert(!f.includes('/') && !f.includes('\\'), `lock filename must contain no separators: ${f}`);
      assert(path.resolve(locksDir, f).startsWith(path.resolve(locksDir) + path.sep), `lock file must stay inside locks dir: ${f}`);
    }
    assert(!fs.existsSync(path.join(root, 'escape')), 'no escape directory created outside locks');
    assert(fs.readdirSync(path.join(root, 'engine')).every((e) => e === 'locks'), 'engine dir must contain only locks');

    lm.acquire('biz-1', 'exec-biz1');
    assert(fs.existsSync(path.join(locksDir, 'biz-1.lock')), 'legit businessId lock file name preserved');
    lm.release('biz-1', 'exec-biz1');
    assert(!fs.existsSync(path.join(locksDir, 'biz-1.lock')), 'release must remove the legit lock file');

    hostile.forEach((id, i) => lm.release(id, `exec-${i}`));
    assert(fs.readdirSync(locksDir).length === 0, 'all hostile locks released cleanly');
  }
};

async function main() {
  const ok = await runTests('regression-457', regression);
  process.exit(ok ? 0 : 1);
}

main();
