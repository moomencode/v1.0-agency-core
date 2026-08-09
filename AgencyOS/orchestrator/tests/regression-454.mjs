import fs from 'node:fs';
import path from 'node:path';
import { assert, runTests, scratchRoot, baseSpec, createStack, createSystem, SIMULATED_ROWS, simulatedSource } from './helpers.mjs';
import { classifyError } from '../failures/classifier.js';
import { sleep } from '../utils.js';
import { LocalProvider } from '../../delivery/providers/local.js';
import { createDiscoverySystem } from '../../discovery/index.js';
import { createBrain } from '../../brain/index.js';
import { createDossierEngine } from '../../dossier/index.js';
import { createPipelineRunner } from '../../pipeline/runner.js';
import { createWebsiteEngine } from '../../website-engine/index.js';
import { createDeliverySystem } from '../../delivery/index.js';
import { createArtifactSystem } from '../../artifacts/index.js';
import { createMemorySystem } from '../../memory/index.js';
import { createOrchestratorSystem } from '../index.js';

const WAIT_MS = 60000;

const PROVIDER_LOG = [];

class CountingLocalProvider extends LocalProvider {
  async deploy(packageInfo) {
    PROVIDER_LOG.push(packageInfo.packageId);
    return super.deploy(packageInfo);
  }
}

function resetProviderLog() {
  PROVIDER_LOG.length = 0;
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
    if (last.state !== 'RUNNING' && last.state !== 'PAUSED') return last;
    await sleep(250);
  }
  throw new Error(`campaign did not reach a terminal state within ${timeoutMs}ms (state=${last && last.state})`);
}

async function runToAwaiting(root, stack, sys, spec) {
  const started = sys.startCampaign(spec);
  const summary = await sys.runCampaign(started.campaignId);
  assert(summary.state === 'RUNNING', `campaign must stay RUNNING while executions wait, got ${summary.state}`);
  assert(summary.metrics.discovered === 6, `discovered ${summary.metrics.discovered}`);
  const byName = Object.fromEntries(stack.discovery.list().map((r) => [r.name, r.id]));
  const pending = sys.pendingApprovals();
  const deployApprovals = pending.filter((a) => a.kind === 'DEPLOY');
  const escalateApprovals = pending.filter((a) => a.kind === 'ESCALATE');
  assert(deployApprovals.length === 3, `expected 3 DEPLOY approvals, got ${deployApprovals.length}`);
  assert(escalateApprovals.length === 1, `expected 1 ESCALATE approval, got ${escalateApprovals.length}`);
  return { started, summary, byName, pending, deployApprovals, escalateApprovals };
}

async function approveCampaign(sys, campaignId) {
  let rounds = 0;
  let emptyStreak = 0;
  while (rounds++ < 12) {
    const pend = sys.pendingApprovals().filter((a) => a.campaignId === campaignId);
    if (!pend.length) {
      if (++emptyStreak >= 2) break;
    } else {
      emptyStreak = 0;
      for (const a of pend) sys.approve(a.id, { by: 'test-operator', reason: 'regression approve' });
    }
    await sleep(500);
  }
  const remaining = sys.pendingApprovals().filter((a) => a.campaignId === campaignId);
  assert(remaining.length === 0, `campaign ${campaignId} still has pending approvals: ${remaining.map((a) => a.kind).join(',')}`);
}

function recordForBusiness(stack, businessId) {
  const rec = stack.delivery.history().find((r) => r.trace && r.trace.businessId === businessId);
  assert(rec, `no delivery record for business ${businessId}`);
  return rec;
}

function setRecordDeploying(stack, record) {
  stack.delivery.manager.store.save({
    ...record,
    status: 'deploying',
    deployment: { id: `local-${record.trace.buildId}`, url: null, state: 'DEPLOYING' }
  });
}

function seedLocalDeployment(root, project, deploymentId) {
  const dir = path.join(root, 'storage', 'delivery', 'local', project, deploymentId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>recovered</body></html>');
}

function checkpointOf(root, executionId) {
  return JSON.parse(fs.readFileSync(path.join(root, 'storage', 'orchestrator-engine', 'instances', executionId, 'checkpoint.json'), 'utf8'));
}

function campaignJson(root, campaignId) {
  return JSON.parse(fs.readFileSync(path.join(root, 'storage', 'orchestrator-engine', 'campaigns', `${campaignId}.json`), 'utf8'));
}

function areaAwareSource(sets) {
  const base = simulatedSource();
  return {
    ...base,
    async discover(query, opts = {}) {
      return sets[query && query.area] || [];
    }
  };
}

async function createAreaStack(root, sets) {
  const artifacts = createArtifactSystem({ root, sweeperMs: 0 });
  const memory = createMemorySystem({ root, validate: true });
  const discovery = createDiscoverySystem({
    root,
    sources: { simulated: areaAwareSource(sets) },
    probeMode: 'offline',
    probeWebsites: false,
    validator: true
  });
  const brain = createBrain({});
  const dossier = createDossierEngine({ root, memory, brain });
  const website = createWebsiteEngine({});
  const pipeline = createPipelineRunner({ root });
  const delivery = createDeliverySystem({
    root,
    engine: { export: (site, opts) => website.export(site, opts) },
    artifacts,
    memory,
    autoAllowed: false,
    retryConfig: { maxAttempts: 3, initialDelayMs: 20 }
  });
  return { discovery, brain, dossier, pipeline, website, delivery, artifacts, memory };
}

const P1_CLASSIFIER_CASES = [
  ['E_DEL_RECORD_CONFLICT', 'BUSINESS'],
  ['E_DEL_BAD_STATE', 'BUSINESS'],
  ['E_DEL_AUTH_FAILED', 'BUSINESS'],
  ['E_DEL_RETENTION_FAILED', 'BUSINESS'],
  ['E_DEL_APPROVAL_NOT_PENDING', 'POLICY'],
  ['E_DEL_PROVIDER_BUDGET', 'POLICY'],
  ['E_DEL_INVALID_TRACE', 'VALIDATION']
];

export const regression = {
  'P1-1: delivery error classifier maps new codes to business/policy/validation and never retries': async () => {
    for (const [code, expected] of P1_CLASSIFIER_CASES) {
      const c = classifyError({ code, message: `simulated ${code}`, meta: { retryable: false } });
      assert(c.class === expected, `${code} must classify as ${expected}, got ${c.class}`);
      assert(c.retryable === false, `${code} must never be retryable`);
    }
  },

  'P1-2: approve after mid-deploy interruption recovers the record without re-contacting the provider': async () => {
    resetProviderLog();
    const root = scratchRoot('regression-454-p12-recover');
    const stack = await createStack(root);
    stack.delivery.registerProvider('local', CountingLocalProvider);
    const sys = createSystem(root, stack);
    await sys.boot();
    const spec = baseSpec();
    const { started, deployApprovals, escalateApprovals, byName } = await runToAwaiting(root, stack, sys, spec);
    const exec = sys.status(started.campaignId).executions.find((e) => e.businessId === byName['Cairo Roast Coffee']);
    const approval = deployApprovals.find((a) => a.executionId === exec.executionId);
    assert(approval, '001 deploy approval present');
    const rec = recordForBusiness(stack, exec.businessId);
    const buildId = rec.trace.buildId;

    seedLocalDeployment(root, 'agency-test', `local-${buildId}`);
    setRecordDeploying(stack, rec);
    assert(!PROVIDER_LOG.includes(buildId), 'no provider contact before recovery');

    sys.approve(approval.id, { by: 'test-operator', reason: 'recover after interruption' });
    await waitFor(() => sys.getExecution(exec.executionId).status === 'DEPLOYED', `execution ${exec.executionId} to be DEPLOYED`);
    assert(!PROVIDER_LOG.includes(buildId), 'recovery must not re-contact the provider');
    const recAfter = stack.delivery.getRecord(rec.id);
    assert(recAfter.status === 'recorded', `record must be recorded after recovery, got ${recAfter.status}`);

    await approveCampaign(sys, started.campaignId);

    const all = await waitForTerminal(sys, started.campaignId);
    assert(all.state === 'COMPLETED', `campaign must COMPLETE, got ${all.state}`);
    assert(all.metrics.deployed === 4, `4 deployed, got ${all.metrics.deployed}`);
    assert(all.metrics.failed === 0, 'no failures expected');
    assert(PROVIDER_LOG.length === 3, `exactly 3 real provider contacts (recovered build must not re-deploy), got ${PROVIDER_LOG.length}`);
    sys.close();
  },

  'P1-2: ambiguous mid-deploy interruption fails terminally and never re-deploys': async () => {
    resetProviderLog();
    const root = scratchRoot('regression-454-p12-failsafe');
    const stack = await createStack(root);
    stack.delivery.registerProvider('local', CountingLocalProvider);
    const sys = createSystem(root, stack);
    await sys.boot();
    const spec = baseSpec();
    const { started, deployApprovals, escalateApprovals, byName } = await runToAwaiting(root, stack, sys, spec);
    const exec = sys.status(started.campaignId).executions.find((e) => e.businessId === byName['Cairo Roast Coffee']);
    const approval = deployApprovals.find((a) => a.executionId === exec.executionId);
    const rec = recordForBusiness(stack, exec.businessId);
    const buildId = rec.trace.buildId;

    setRecordDeploying(stack, rec);

    sys.approve(approval.id, { by: 'test-operator', reason: 'recover after interruption' });
    await waitFor(() => sys.getExecution(exec.executionId).status === 'FAILED', `execution ${exec.executionId} to FAIL terminally`);
    assert(!PROVIDER_LOG.includes(buildId), 'ambiguous interruption must never re-contact the provider');
    const recAfter = stack.delivery.getRecord(rec.id);
    assert(recAfter.status === 'failed', `record must be terminal failed, got ${recAfter.status}`);
    assert(recAfter.error && recAfter.error.code === 'E_DEL_PROVIDER_ERROR', `record error code E_DEL_PROVIDER_ERROR, got ${recAfter.error && recAfter.error.code}`);

    await approveCampaign(sys, started.campaignId);

    const all = await waitForTerminal(sys, started.campaignId);
    assert(all.state === 'COMPLETED', `campaign must COMPLETE, got ${all.state}`);
    assert(all.metrics.deployed === 3, `3 deployed, got ${all.metrics.deployed}`);
    assert(all.metrics.failed === 1, `1 failed execution, got ${all.metrics.failed}`);
    assert(PROVIDER_LOG.length === 3, `only 3 real provider contacts, got ${PROVIDER_LOG.length}`);
    sys.close();
  },
  'P1-3: halt persists across restart; approvals while paused never progress; resume deploys each business exactly once': async () => {
    resetProviderLog();
    const root = scratchRoot('regression-454-p13-halt');
    const stack = await createStack(root);
    stack.delivery.registerProvider('local', CountingLocalProvider);
    const sys = createSystem(root, stack);
    await sys.boot();
    const spec = baseSpec();
    const { started, deployApprovals, escalateApprovals } = await runToAwaiting(root, stack, sys, spec);

    const paused = await sys.pauseCampaign(started.campaignId);
    assert(paused.state === 'PAUSED', `campaign must PAUSE, got ${paused.state}`);

    for (const a of deployApprovals) sys.approve(a.id, { by: 'test-operator', reason: 'approve while paused' });
    await sleep(400);
    let st = sys.status(started.campaignId);
    assert(st.state === 'PAUSED', 'campaign must stay PAUSED after approvals while halted');
    assert(PROVIDER_LOG.length === 0, 'provider must never be contacted while halted');
    for (const e of st.executions) {
      const cp = checkpointOf(root, e.executionId);
      assert(['DEPLOYING', 'AWAITING_APPROVAL', 'ESCALATED', 'REJECTED'].includes(cp.status), `halted execution must not advance past gate, got ${cp.status}`);
    }

    sys.close();
    const stack2 = await createStack(root);
    stack2.delivery.registerProvider('local', CountingLocalProvider);
    const sys2 = createSystem(root, stack2);
    await sys2.boot();

    st = sys2.status(started.campaignId);
    assert(st.state === 'PAUSED', `halt must survive restart, got ${st.state}`);
    const pending2 = sys2.pendingApprovals();
    assert(pending2.length === 1 && pending2[0].kind === 'ESCALATE', `only the ESCALATE approval may remain pending, got ${pending2.map((a) => a.kind).join(',')}`);
    assert(PROVIDER_LOG.length === 0, 'no provider contact after restart while halted');

    sys2.approve(pending2[0].id, { by: 'test-operator', reason: 'proceed with risk' });
    await sleep(400);
    st = sys2.status(started.campaignId);
    assert(st.state === 'PAUSED', 'approval while halted after restart must not progress');
    assert(PROVIDER_LOG.length === 0, 'still no provider contact');

    await sys2.resumeCampaign(started.campaignId);
    await waitFor(() => sys2.pendingApprovals().filter((a) => a.kind === 'DEPLOY').length === 1, '006 deploy approval after resume');
    const escDeploy = sys2.pendingApprovals().filter((a) => a.kind === 'DEPLOY');
    for (const a of escDeploy) sys2.approve(a.id, { by: 'test-operator', reason: 'approve 006' });

    const all = await waitForTerminal(sys2, started.campaignId);
    assert(all.state === 'COMPLETED', `campaign must COMPLETE after resume, got ${all.state}`);
    assert(all.metrics.deployed === 4, `4 deployed, got ${all.metrics.deployed}`);
    assert(PROVIDER_LOG.length === 4, `each business deployed exactly once (${PROVIDER_LOG.length} provider contacts)`);
    assert(stack2.delivery.history().length === 4, '4 delivery records');
    sys2.close();
  },

  'P1-4: brain result carries the source record; dossier identity survives the pipeline end-to-end': async () => {
    const root = scratchRoot('regression-454-p14-identity');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();

    const sourceRecord = { ...SIMULATED_ROWS[0] };
    const br = await stack.brain.runBusiness(sourceRecord);
    assert(br.record && br.record.id === sourceRecord.id, 'brain result must carry the exact source record');

    const spec = baseSpec();
    const { started, byName } = await runToAwaiting(root, stack, sys, spec);
    await approveCampaign(sys, started.campaignId);

    const all = await waitForTerminal(sys, started.campaignId);
    assert(all.state === 'COMPLETED', `campaign must COMPLETE, got ${all.state}`);
    const exec = all.executions.find((e) => e.businessId === byName['Cairo Roast Coffee']);
    assert(exec && exec.status === 'DEPLOYED', '001 deployed');
    const full = sys.getExecution(exec.executionId);
    const dossier = stack.dossier.load(full.businessId, { version: full.outputs.dossierVersion });
    assert(dossier, 'dossier must exist');
    assert(dossier.documents.business.name === 'Cairo Roast Coffee', `business name preserved, got ${dossier.documents.business.name}`);
    assert(dossier.documents.contact.phones.includes('+201000000001'), `contact phone preserved, got ${dossier.documents.contact.phones.join(',')}`);
    assert(dossier.documents.business.location.area === 'Cairo', `location area preserved, got ${dossier.documents.business.location.area}`);
    sys.close();
  },

  'P1-5: concurrent campaigns produce uncorrupted namespaced checkpoints and clean up run state': async () => {
    const root = scratchRoot('regression-454-p15-concurrent');
    const rowsB = SIMULATED_ROWS.map((r) => ({
      ...r,
      id: r.id.replace('demo-cairo', 'demo-giza'),
      name: `${r.name} Giza`,
      area: 'Giza'
    }));
    const stack = await createAreaStack(root, { Cairo: SIMULATED_ROWS, Giza: rowsB });
    const sys = createSystem(root, stack);
    await sys.boot();

    const specA = baseSpec({ name: 'cairo-market-a' });
    const specB = baseSpec({
      name: 'giza-market-b',
      discovery: { market: 'Giza', category: 'restaurant', query: { area: 'Giza', category: 'restaurant' }, sources: ['simulated'] }
    });
    const a = sys.startCampaign(specA);
    const b = sys.startCampaign(specB);
    const [sumA, sumB] = await Promise.all([sys.runCampaign(a.campaignId), sys.runCampaign(b.campaignId)]);
    assert(sumA.state === 'RUNNING', `campaign A must RUN, got ${sumA.state}`);
    assert(sumB.state === 'RUNNING', `campaign B must RUN, got ${sumB.state}`);

    await approveCampaign(sys, a.campaignId);
    await approveCampaign(sys, b.campaignId);
    const [allA, allB] = await Promise.all([
      waitForTerminal(sys, a.campaignId),
      waitForTerminal(sys, b.campaignId)
    ]);
    assert(allA.state === 'COMPLETED' && allA.metrics.deployed === 4, `campaign A must COMPLETE with 4 deployed, got ${allA.state}/${allA.metrics.deployed}`);
    assert(allB.state === 'COMPLETED' && allB.metrics.deployed === 4, `campaign B must COMPLETE with 4 deployed, got ${allB.state}/${allB.metrics.deployed}`);

    const checkpointsDir = path.join(root, 'checkpoints');
    assert(fs.existsSync(checkpointsDir), 'checkpoints dir exists');
    let runDirs = 0;
    for (const runDirName of fs.readdirSync(checkpointsDir)) {
      const runDir = path.join(checkpointsDir, runDirName);
      runDirs++;
      const stages = fs.readdirSync(runDir);
      assert(stages.length > 0, `run ${runDirName} must have stage checkpoints`);
      for (const stageFile of stages) {
        const raw = fs.readFileSync(path.join(runDir, stageFile), 'utf8');
        const parsed = JSON.parse(raw);
        assert(parsed && typeof parsed === 'object' && !Array.isArray(parsed), `checkpoint ${runDirName}/${stageFile} must be a single valid JSON object`);
      }
    }
    assert(runDirs === 8, `8 pipeline runs expected (4 per campaign: 3 approved + 1 escalated), got ${runDirs}`);

    const leftovers = fs.readdirSync(root).filter((f) => f.startsWith('run-state-'));
    assert(leftovers.length === 0, `no run-state files may remain after successful runs, found ${leftovers.join(',')}`);

    for (const campaignId of [a.campaignId, b.campaignId]) {
      const st = sys.status(campaignId);
      for (const e of st.executions) {
        const cp = checkpointOf(root, e.executionId);
        assert(cp.campaignId === campaignId, `checkpoint ${e.executionId} must belong to campaign ${campaignId}`);
      }
    }

    const history = stack.delivery.history();
    assert(history.length === 8, `8 delivery records (4 per campaign), got ${history.length}`);
    for (const campaignId of [a.campaignId, b.campaignId]) {
      const st = sys.status(campaignId);
      for (const e of st.executions) {
        const n = history.filter((r) => r.trace.businessId === e.businessId).length;
        const expected = e.status === 'DEPLOYED' ? 1 : 0;
        assert(n === expected, `business ${e.businessId} (${e.status}) must have ${expected} delivery record(s), got ${n}`);
      }
    }
    sys.close();
  },

  'P1-6: force re-run resets budget and halt state, then reuses records without duplicate delivery': async () => {
    resetProviderLog();
    const root = scratchRoot('regression-454-p16-force');
    const stack = await createStack(root);
    stack.delivery.registerProvider('local', CountingLocalProvider);
    const sys = createSystem(root, stack);
    await sys.boot();

    const spec = baseSpec();
    const { started } = await runToAwaiting(root, stack, sys, spec);
    await approveCampaign(sys, started.campaignId);
    const first = await waitForTerminal(sys, started.campaignId);
    assert(first.state === 'COMPLETED' && first.metrics.deployed === 4, 'first run completes with 4 deployed');
    assert(PROVIDER_LOG.length === 4, 'first run contacts provider exactly 4 times');
    const c1 = campaignJson(root, started.campaignId);
    assert(c1.budget.counters.deployments === 4, 'counters tracked 4 deployments');

    const forced = await sys.runCampaign(started.campaignId, { force: true });
    assert(forced.state === 'RUNNING', `forced re-run must start, got ${forced.state}`);
    const c2 = campaignJson(root, started.campaignId);
    assert(c2.budget.counters.deployments === 0, `force must reset deployment counters, got ${c2.budget.counters.deployments}`);
    assert(c2.metrics.deployed === 0, 'force must reset metrics');
    assert(c2._halted !== true, 'force must clear the halt flag');

    await approveCampaign(sys, started.campaignId);
    const second = await waitForTerminal(sys, started.campaignId);
    assert(second.state === 'COMPLETED' && second.metrics.deployed === 4, 'forced re-run completes with 4 deployed');
    assert(PROVIDER_LOG.length === 4, 'forced re-run must reuse records without new provider contact');
    assert(stack.delivery.history().length === 4, 'no duplicate delivery records after force re-run');
    sys.close();
  },

  'P1-6: force must not bypass a paused (halted) campaign': async () => {
    resetProviderLog();
    const root = scratchRoot('regression-454-p16-force-halt');
    const stack = await createStack(root);
    stack.delivery.registerProvider('local', CountingLocalProvider);
    const sys = createSystem(root, stack);
    await sys.boot();

    const spec = baseSpec();
    const { started } = await runToAwaiting(root, stack, sys, spec);
    await sys.pauseCampaign(started.campaignId);
    const forced = await sys.runCampaign(started.campaignId, { force: true });
    assert(forced.state === 'PAUSED', `force must not bypass a paused campaign, got ${forced.state}`);
    assert(PROVIDER_LOG.length === 0, 'no provider contact while halted');
    const c = campaignJson(root, started.campaignId);
    assert(c.state === 'PAUSED', 'campaign file still PAUSED');
    assert(c._halted === true, 'halt flag preserved');
    sys.close();
  }
};

async function main() {
  const ok = await runTests('regression-454', regression);
  process.exit(ok ? 0 : 1);
}

main();
