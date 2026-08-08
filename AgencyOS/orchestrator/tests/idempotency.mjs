import { assert, runTests, scratchRoot, baseSpec, createStack, createSystem } from './helpers.mjs';

async function approveUntilNone(sys) {
  for (let round = 0; round < 4; round++) {
    const pending = sys.pendingApprovals();
    if (!pending.length) return;
    for (const a of pending) sys.approve(a.id, { by: 'ops', reason: 'idem' });
    await new Promise((r) => setTimeout(r, 1500));
  }
  assert(sys.pendingApprovals().length === 0, 'all approval waves must be decided');
}

async function waitTerminal(sys, campaignId, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = sys.status(campaignId);
    if (last.state !== 'RUNNING' && last.state !== 'PAUSED' && last.state !== 'DRAFT' && last.state !== 'QUEUED') return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`campaign stuck in ${last && last.state}`);
}

export const idempotency = {
  'startCampaign twice returns the same campaign id and does not duplicate executions': async () => {
    const root = scratchRoot('idem-1');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    const spec = baseSpec();
    const a = sys.startCampaign(spec);
    const b = sys.startCampaign(spec);
    assert(a.campaignId === b.campaignId, 'same spec must produce the same campaign id');
    assert(a.resumed === false && b.resumed === true, 'first start fresh, second start resumes');
    await sys.runCampaign(a.campaignId);
    await approveUntilNone(sys);
    await waitTerminal(sys, a.campaignId);
    const again = sys.startCampaign(spec);
    assert(again.campaignId === a.campaignId, 'finished campaign keeps its id');
    const execs = sys.status(a.campaignId).executions;
    assert(execs.length === 6, 'no duplicated executions after repeated starts');
    sys.close();
  },

  'runCampaign is safe to call twice on the same campaign': async () => {
    const root = scratchRoot('idem-2');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    const started = sys.startCampaign(baseSpec());
    const s1 = await sys.runCampaign(started.campaignId);
    const s2 = await sys.runCampaign(started.campaignId);
    assert(s1.state === 'RUNNING' && s2.state === 'RUNNING');
    assert(s2.note === 'already running', 'second run must report already running');
    const s2summary = sys.status(started.campaignId);
    assert(s2summary.executions.length === s1.executions.length, 'second run must not duplicate executions');
    assert(s1.executions.every((e) => s2summary.executions.some((x) => x.executionId === e.executionId)));
    sys.close();
  },

  'approval ids are stable across queries': async () => {
    const root = scratchRoot('idem-3');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    const started = sys.startCampaign(baseSpec());
    await sys.runCampaign(started.campaignId);
    const first = sys.pendingApprovals().map((a) => a.id);
    const second = sys.pendingApprovals().map((a) => a.id);
    assert(first.length === 4);
    assert(JSON.stringify([...first].sort()) === JSON.stringify([...second].sort()), 'requery must not mint new approvals');
    sys.close();
  },

  'build ids are reused for identical site output across runs': async () => {
    const root = scratchRoot('idem-4');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    const started = sys.startCampaign(baseSpec());
    await sys.runCampaign(started.campaignId);
    await approveUntilNone(sys);
    await waitTerminal(sys, started.campaignId);
    const s = sys.status(started.campaignId);
    const deployed = s.executions.filter((e) => e.status === 'DEPLOYED');
    assert(deployed.length === 4);
    const firstBuilds = deployed.map((e) => sys.getExecution(e.executionId).outputs.buildId);
    const rerun = sys.startCampaign(baseSpec(), { force: true });
    await sys.runCampaign(rerun.campaignId);
    await approveUntilNone(sys);
    await waitTerminal(sys, rerun.campaignId);
    const s2 = sys.status(rerun.campaignId);
    const deployed2 = s2.executions.filter((e) => e.status === 'DEPLOYED');
    assert(deployed2.length === 4);
    const secondBuilds = deployed2.map((e) => sys.getExecution(e.executionId).outputs.buildId);
    assert(firstBuilds.length === secondBuilds.length);
    for (const b of firstBuilds) assert(secondBuilds.includes(b), 'build ids must be reused for identical sites');
    for (const e of deployed2) {
      const full = sys.getExecution(e.executionId);
      assert(full.outputs.siteReused === true, `site ${e.businessId} must report reused build`);
    }
    sys.close();
  },

  'single campaign-report artifact and no duplicate decision records after force rerun': async () => {
    const root = scratchRoot('idem-5');
    const stack = await createStack(root);
    const sys = createSystem(root, stack);
    await sys.boot();
    const started = sys.startCampaign(baseSpec());
    await sys.runCampaign(started.campaignId);
    await approveUntilNone(sys);
    await waitTerminal(sys, started.campaignId);
    const rerun = sys.startCampaign(baseSpec(), { force: true });
    await sys.runCampaign(rerun.campaignId);
    await approveUntilNone(sys);
    await waitTerminal(sys, rerun.campaignId);
    const all = stack.artifacts.manager.list({ projectId: 'unassigned' });
    const byType = all.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {});
    assert(byType['campaign-report'] === 1, `one campaign report, got ${byType['campaign-report']}`);
    assert(byType['decision-record'] === 6, `decision records deduped, got ${byType['decision-record']}`);
    const reportArtifacts = all.filter((a) => a.type === 'execution-report');
    const names = reportArtifacts.map((a) => a.name);
    assert(new Set(names).size === names.length, 'execution report names must be unique');
    sys.close();
  }
};

async function main() {
  const ok = await runTests('idempotency', idempotency);
  process.exit(ok ? 0 : 1);
}

main();
