import fs from 'node:fs';
import path from 'node:path';
import { assert, runTests, scratchRoot, baseSpec, createStack, createSystem, SIMULATED_ROWS } from './helpers.mjs';
import { sleep, checkpointFile } from '../utils.js';

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
      for (const a of pend) sys.approve(a.id, { by: 'test-operator', reason: 'r458 approve' });
    }
    await sleep(500);
  }
  const remaining = sys.pendingApprovals().filter((a) => a.campaignId === campaignId);
  assert(remaining.length === 0, `campaign ${campaignId} still has pending approvals: ${remaining.map((a) => a.kind).join(',')}`);
}

function auditLines(root) {
  const auditDir = path.join(root, 'logs', 'orchestrator');
  if (!fs.existsSync(auditDir)) return [];
  return fs
    .readdirSync(auditDir)
    .filter((f) => f.endsWith('.ndjson'))
    .flatMap((f) => fs.readFileSync(path.join(auditDir, f), 'utf8').split('\n').filter(Boolean).map((l) => {
      try {
        let parsed = JSON.parse(l);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        return parsed;
      } catch {
        return null;
      }
    }))
    .filter(Boolean);
}

function rawCheckpoint(root, executionId) {
  const file = checkpointFile(path.join(root, 'storage', 'orchestrator-engine'), executionId);
  assert(fs.existsSync(file), `checkpoint file must exist on disk: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function traceEvents(root, executionId) {
  const file = path.join(root, 'storage', 'orchestrator-engine', 'instances', executionId, 'trace.ndjson');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
    try {
      let parsed = JSON.parse(l);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      return parsed;
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function trackUnhandledRejections() {
  const seen = [];
  const onRejection = (reason) => seen.push(reason);
  process.on('unhandledRejection', onRejection);
  return {
    list: () => seen,
    stop: () => process.removeListener('unhandledRejection', onRejection)
  };
}

export const regression = {
  'F1: approval continuation failure becomes a durable FAILED, campaign finalizes': async () => {
    const root = scratchRoot('regression-458-f1');
    const stack = await createStack(root, { rows: [SIMULATED_ROWS[0]] });
    const sys = createSystem(root, stack);
    await sys.boot();
    const unhandled = trackUnhandledRejections();

    const failedEvents = [];
    sys.on(sys.events.ORC_EVENTS.FAILED, (e) => failedEvents.push(e));

    const started = sys.startCampaign(baseSpec({ name: 'r458-f1' }));
    await sys.runCampaign(started.campaignId);

    await waitFor(() => sys.pendingApprovals().length > 0, 'approval wave for f1');
    const pending = sys.pendingApprovals();
    assert(pending.length >= 1, `expected at least one pending approval, got ${pending.length}`);
    const executionId = pending[0].executionId;

    sys.engine.runExecution = async () => {
      throw new Error('injected continuation failure');
    };

    for (const a of pending) sys.approve(a.id, { by: 'test-operator', reason: 'f1 approve' });

    await waitFor(() => {
      try {
        const ex = sys.getExecution(executionId);
        return ex.status === 'FAILED';
      } catch {
        return false;
      }
    }, 'execution FAILED after continuation failure');

    const execution = sys.getExecution(executionId);
    assert(execution.status === 'FAILED', `execution must be FAILED, got ${execution.status}`);
    assert(!['RUNNING', 'DEPLOYING', 'AWAITING_APPROVAL', 'VERIFYING'].includes(execution.status), 'execution must not be left mid-flight');
    assert(execution.error && execution.error.class === 'SYSTEM', `error class must be SYSTEM, got ${JSON.stringify(execution.error)}`);
    assert(execution.error && execution.error.message === 'injected continuation failure', 'classified error must carry the injected message');
    assert(execution.outcome && execution.outcome.verdict === 'FAILED', `outcome verdict must be FAILED, got ${JSON.stringify(execution.outcome)}`);
    assert(execution.outcome.class === 'SYSTEM', `outcome class must be SYSTEM, got ${execution.outcome.class}`);

    const disk = rawCheckpoint(root, executionId);
    assert(disk.status === 'FAILED', `checkpoint on disk must be FAILED, got ${disk.status}`);
    assert(disk.error && disk.error.class === 'SYSTEM', 'checkpoint on disk must contain the classified failure');
    assert(disk.outcome && disk.outcome.verdict === 'FAILED', 'checkpoint on disk must contain the FAILED outcome');

    assert(failedEvents.some((e) => e.executionId === executionId), 'FAILED event must be emitted for the execution');
    const audit = auditLines(root);
    const failedAudits = audit.filter((l) => l.action === 'execution_failed' && l.executionId === executionId);
    assert(failedAudits.length === 1, `audit must contain exactly one execution_failed entry, got ${failedAudits.length}`);

    const trace = traceEvents(root, executionId);
    assert(trace.some((e) => e.detail === 'continuation-failed'), 'trace must record the continuation failure');

    const fin = await waitForTerminal(sys, started.campaignId);
    assert(fin.state === 'COMPLETED', `campaign must finalize to COMPLETED, got ${fin.state}`);
    assert(fin.metrics.failed === 1, `metrics must count the failed execution, got ${JSON.stringify(fin.metrics)}`);

    assert(unhandled.list().length === 0, `no unhandled rejections, got ${unhandled.list().length}`);
    unhandled.stop();
    sys.close();
  },

  'F2: retryExecution continuation failure becomes a durable FAILED': async () => {
    const root = scratchRoot('regression-458-f2');
    const stack = await createStack(root, { rows: [SIMULATED_ROWS[0], SIMULATED_ROWS[1]] });
    const sys = createSystem(root, stack);
    await sys.boot();
    const unhandled = trackUnhandledRejections();

    const failedEvents = [];
    sys.on(sys.events.ORC_EVENTS.FAILED, (e) => failedEvents.push(e));

    const started = sys.startCampaign(baseSpec({ name: 'r458-f2' }));
    await sys.runCampaign(started.campaignId);

    await waitFor(() => sys.pendingApprovals().length >= 2, 'two approval waves for f2');
    const pending = sys.pendingApprovals();
    assert(pending.length >= 2, `expected at least two pending approvals, got ${pending.length}`);
    const target = pending[0];
    const executionId = target.executionId;

    sys.engine.runExecution = async () => {
      throw new Error('injected retry continuation failure');
    };

    sys.approve(target.id, { by: 'test-operator', reason: 'f2 approve' });

    await waitFor(() => {
      try {
        return sys.getExecution(executionId).status === 'FAILED';
      } catch {
        return false;
      }
    }, 'execution FAILED after approval continuation');

    const retried = sys.retryExecution(executionId, { reason: 'f2 retry' });
    assert(retried.executionId === executionId, 'retryExecution must return the same execution');

    await waitFor(() => {
      try {
        const ex = sys.getExecution(executionId);
        return ex.status === 'FAILED' && ex.error && ex.error.message === 'injected retry continuation failure';
      } catch {
        return false;
      }
    }, 'execution FAILED again after retry continuation failure');

    const execution = sys.getExecution(executionId);
    assert(execution.status === 'FAILED', `execution must be FAILED after retry continuation, got ${execution.status}`);
    assert(!['RUNNING', 'DEPLOYING', 'AWAITING_APPROVAL', 'VERIFYING'].includes(execution.status), 'execution must not be left mid-flight after retry');
    assert(execution.error && execution.error.class === 'SYSTEM', `error class must be SYSTEM after retry, got ${JSON.stringify(execution.error)}`);
    assert(execution.error && execution.error.message === 'injected retry continuation failure', 'retry failure must carry the injected message');
    assert(execution.outcome && execution.outcome.verdict === 'FAILED', `outcome verdict must be FAILED after retry, got ${JSON.stringify(execution.outcome)}`);

    const failTransitions = (execution.timeline || []).filter((t) => t.event === 'FAIL');
    assert(failTransitions.length >= 2, `expected at least two FAIL transitions (approval + retry), got ${failTransitions.length}`);

    const disk = rawCheckpoint(root, executionId);
    assert(disk.status === 'FAILED', `checkpoint on disk must be FAILED after retry, got ${disk.status}`);
    assert(disk.error && disk.error.class === 'SYSTEM', 'checkpoint on disk must contain the retry failure');

    const audit = auditLines(root);
    assert(audit.some((l) => l.action === 'execution_retried' && l.executionId === executionId), 'audit must record the retry');
    const failedAudits = audit.filter((l) => l.action === 'execution_failed' && l.executionId === executionId);
    assert(failedAudits.length >= 2, `audit must record both continuation failures, got ${failedAudits.length}`);

    const relatedEvents = failedEvents.filter((e) => e.executionId === executionId);
    assert(relatedEvents.length >= 2, `FAILED events must be emitted for both continuation failures, got ${relatedEvents.length}`);

    const st = sys.status(started.campaignId);
    assert(st.state === 'RUNNING', `campaign must remain RUNNING while the sibling awaits approval, got ${st.state}`);

    assert(unhandled.list().length === 0, `no unhandled rejections, got ${unhandled.list().length}`);
    unhandled.stop();
    sys.close();
  },

  'successful approval continuation still completes the campaign': async () => {
    const root = scratchRoot('regression-458-f3');
    const stack = await createStack(root, { rows: [SIMULATED_ROWS[0]] });
    const sys = createSystem(root, stack);
    await sys.boot();
    const unhandled = trackUnhandledRejections();

    const failedEvents = [];
    sys.on(sys.events.ORC_EVENTS.FAILED, (e) => failedEvents.push(e));

    const started = sys.startCampaign(baseSpec({ name: 'r458-f3' }));
    await sys.runCampaign(started.campaignId);
    await approveCampaign(sys, started.campaignId);
    const fin = await waitForTerminal(sys, started.campaignId);

    assert(fin.state === 'COMPLETED', `campaign must COMPLETE, got ${fin.state}`);
    assert(fin.metrics.deployed === 1, `must deploy 1, got ${JSON.stringify(fin.metrics)}`);
    const executionId = fin.executions[0].executionId;
    const execution = sys.getExecution(executionId);
    assert(execution.status === 'DEPLOYED', `execution must be DEPLOYED, got ${execution.status}`);
    assert(failedEvents.length === 0, `no FAILED events expected, got ${failedEvents.length}`);
    assert(unhandled.list().length === 0, `no unhandled rejections, got ${unhandled.list().length}`);
    unhandled.stop();
    sys.close();
  },

  'successful retry after a continuation failure completes the execution': async () => {
    const root = scratchRoot('regression-458-f4');
    const stack = await createStack(root, { rows: [SIMULATED_ROWS[0], SIMULATED_ROWS[1]] });
    const sys = createSystem(root, stack);
    await sys.boot();
    const unhandled = trackUnhandledRejections();

    const started = sys.startCampaign(baseSpec({ name: 'r458-f4' }));
    await sys.runCampaign(started.campaignId);

    await waitFor(() => sys.pendingApprovals().length >= 2, 'two approval waves for f4');
    const pending = sys.pendingApprovals();
    const target = pending[0];
    const executionId = target.executionId;

    const originalRun = sys.engine.runExecution.bind(sys.engine);
    let injectOnce = true;
    sys.engine.runExecution = async (execution, campaign, deps) => {
      if (injectOnce) {
        injectOnce = false;
        throw new Error('injected single continuation failure');
      }
      return originalRun(execution, campaign, deps);
    };

    sys.approve(target.id, { by: 'test-operator', reason: 'f4 approve' });

    await waitFor(() => {
      try {
        return sys.getExecution(executionId).status === 'FAILED';
      } catch {
        return false;
      }
    }, 'execution FAILED after injected approval continuation');

    sys.retryExecution(executionId, { reason: 'f4 retry' });

    await waitFor(() => {
      try {
        const ex = sys.getExecution(executionId);
        return ex.status === 'AWAITING_APPROVAL' || ex.status === 'DEPLOYED' || ex.status === 'VERIFYING';
      } catch {
        return false;
      }
    }, 'retried execution resumes and reaches the delivery gate');

    await approveCampaign(sys, started.campaignId);
    const fin = await waitForTerminal(sys, started.campaignId);

    assert(fin.state === 'COMPLETED', `campaign must COMPLETE after retry, got ${fin.state}`);
    assert(fin.metrics.deployed === 2, `both executions must deploy, got ${JSON.stringify(fin.metrics)}`);
    const execution = sys.getExecution(executionId);
    assert(execution.status === 'DEPLOYED', `retried execution must be DEPLOYED, got ${execution.status}`);

    const audit = auditLines(root);
    assert(audit.some((l) => l.action === 'execution_retried' && l.executionId === executionId), 'audit must record the retry');
    assert(unhandled.list().length === 0, `no unhandled rejections, got ${unhandled.list().length}`);
    unhandled.stop();
    sys.close();
  },

  'compound failure: save-stage failure inside the failure handler leaks nothing and campaign still finalizes': async () => {
    const root = scratchRoot('regression-458-f5');
    const stack = await createStack(root, { rows: [SIMULATED_ROWS[0]] });
    const sys = createSystem(root, stack);
    await sys.boot();
    const unhandled = trackUnhandledRejections();

    const started = sys.startCampaign(baseSpec({ name: 'r458-f5' }));
    await sys.runCampaign(started.campaignId);

    await waitFor(() => sys.pendingApprovals().length > 0, 'approval wave for f5');
    const pending = sys.pendingApprovals();
    assert(pending.length >= 1, `expected at least one pending approval, got ${pending.length}`);
    const executionId = pending[0].executionId;

    sys.engine.runExecution = async () => {
      throw new Error('injected continuation failure');
    };

    let saveCalls = 0;
    const originalSave = sys.campaigns._save.bind(sys.campaigns);
    sys.campaigns._save = (campaign) => {
      if (++saveCalls === 1) throw new Error('injected _save failure');
      return originalSave(campaign);
    };

    for (const a of pending) sys.approve(a.id, { by: 'test-operator', reason: 'f5 approve' });

    await waitFor(() => {
      try {
        const ex = sys.getExecution(executionId);
        return ex.status === 'FAILED';
      } catch {
        return false;
      }
    }, 'execution FAILED after continuation failure with save-stage failure');

    const execution = sys.getExecution(executionId);
    assert(execution.status === 'FAILED', `execution must be FAILED, got ${execution.status}`);
    assert(execution.error && execution.error.message === 'injected continuation failure', 'classified error must carry the injected message');

    const disk = rawCheckpoint(root, executionId);
    assert(disk.status === 'FAILED', `checkpoint on disk must be FAILED, got ${disk.status}`);

    const audit = auditLines(root);
    assert(audit.some((l) => l.action === 'continuation_failed_unrecoverable' && l.executionId === executionId), 'audit must record the unrecoverable continuation failure');
    const failedAudits = audit.filter((l) => l.action === 'execution_failed' && l.executionId === executionId);
    assert(failedAudits.length === 1, `audit must contain exactly one execution_failed entry, got ${failedAudits.length}`);

    const fin = await waitForTerminal(sys, started.campaignId);
    assert(fin.state === 'COMPLETED', `campaign must finalize despite the save-stage failure, got ${fin.state}`);
    assert(fin.metrics.failed === 1, `metrics must count the failed execution, got ${JSON.stringify(fin.metrics)}`);

    assert(unhandled.list().length === 0, `no unhandled rejections, got ${unhandled.list().length}`);
    unhandled.stop();
    sys.close();
  }
};

async function main() {
  const ok = await runTests('regression-458', regression);
  process.exit(ok ? 0 : 1);
}

main();
