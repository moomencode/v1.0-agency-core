import path from 'node:path';
import { rm, access, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DossierEngine } from '../../dossier/index.js';
import { PipelineRunner, createPipelineRunner, PIP_CODES } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const WORK = path.join(ROOT, 'storage', 'pipeline-tests', 'checkpoint-isolation');

await rm(WORK, { recursive: true, force: true });

function recordOf(id, name, overrides = {}) {
  return {
    id,
    name,
    category: 'cafe',
    area: 'Cairo',
    phone: '2027357788',
    email: `hi@${id}.com`,
    whatsapp: '201000000001',
    instagram: `https://instagram.com/${id}`,
    facebook: `https://facebook.com/${id}`,
    address: '12 Tahrir St',
    coordinates: { lat: 30.0444196, lng: 31.2357116 },
    photos: ['a', 'b', 'c'],
    menus: [{}, {}],
    booking: '/reservation',
    rating: 4.2,
    reviews: 230,
    website: `https://${id}.example`,
    probe: { ok: true, timeMs: 400 },
    sources: ['simulated', 'website'],
    weaknesses: [{ id: 'no-booking', severity: 'minor' }],
    scores: { business: { value: 69, breakdown: { presence: 20 } }, opportunity: { value: 77 } },
    ...overrides
  };
}

const de = new DossierEngine({ root: null });
const dossierA = await de.build(recordOf('iso-cairo-001', 'Cairo Roast Coffee'), { persist: false });
const dossierB = await de.build(recordOf('iso-cairo-002', 'Nile Bites Grill'), { persist: false });

class StageFailRunner extends PipelineRunner {
  constructor(opts) {
    super(opts);
    this.failAt = opts.failAt;
    this.armed = true;
  }
  async _runStage(stageId, ctx, dossier) {
    if (this.armed && stageId === this.failAt) {
      this.armed = false;
      throw Object.assign(new Error('simulated stage failure'), { code: PIP_CODES.STAGE_FAILED });
    }
    return super._runStage(stageId, ctx, dossier);
  }
}

// Fails only for one target business, so it can be shared across concurrent
// runs — this is how the production orchestrator reuses a single runner.
class FailByBusinessRunner extends PipelineRunner {
  constructor(opts) {
    super(opts);
    this.failAt = opts.failAt;
    this.target = opts.target;
  }
  async _runStage(stageId, ctx, dossier) {
    if (stageId === this.failAt && ctx.businessId === this.target) {
      throw Object.assign(new Error('simulated stage failure'), { code: PIP_CODES.STAGE_FAILED });
    }
    return super._runStage(stageId, ctx, dossier);
  }
}

async function expectStageFailure(runner, dossier, opts) {
  let failed = false;
  try {
    await runner.run(dossier, opts);
  } catch (e) {
    failed = e.code === PIP_CODES.STAGE_FAILED;
  }
  return failed;
}

let pass = 0;
let fail = 0;
const failures = [];

async function test(label, fn) {
  try {
    await fn();
    pass++;
    console.log(`PASS pipeline/checkpoint-isolation: ${label}`);
  } catch (err) {
    fail++;
    failures.push({ label, err });
    console.log(`FAIL pipeline/checkpoint-isolation: ${label} -> ${err.message}`);
  }
}

function assert(cond, label) {
  if (!cond) throw new Error(`ASSERT FAILED: ${label}`);
}

const exists = async (p) => {
  try { await access(p); return true; } catch { return false; }
};

// Pipeline state is namespaced per deterministic runId (which the orchestrator
// derives from the businessId — see runIdFor), so one business/run can never
// read another's checkpoint or run-state. These tests verify the CHAIN-10
// invariants against the merged per-runId layout:
//   checkpoints/<runId>/<stage>.json   +   run-state-<runId>.json at root

await test('a business never resumes another business run because their runIds differ', async () => {
  const root = path.join(WORK, 'cross-business');
  // A fails part-way, leaving checkpoints + run-state under A's runId.
  const failedA = await expectStageFailure(new StageFailRunner({ root, failAt: 'generate-theme' }), dossierA, {
    businessId: 'iso-cairo-001',
    runId: 'run-a'
  });
  assert(failedA, 'A fails at generate-theme');
  assert(await exists(path.join(root, 'checkpoints', 'run-a', 'validate.json')), 'A checkpoint stored under A runId');
  assert(await exists(path.join(root, 'run-state-run-a.json')), 'A run-state stored under A runId');

  // B runs the same shared root with resume=true. Its runId differs (production
  // derives runId from businessId), so it must start fresh and never touch A.
  const ctxB = await createPipelineRunner({ root }).run(dossierB, {
    businessId: 'iso-cairo-002',
    runId: 'run-b',
    resume: true
  });
  assert(ctxB.status === 'ready', `B completes fresh (${ctxB.status})`);
  assert(ctxB.businessId === 'iso-cairo-002', 'B ctx belongs to B');
  assert(ctxB.resumed === false, 'B is not resumed from A state');
  assert(ctxB.stages.every((s) => !s.resumed), 'B ran every stage fresh');
  assert(ctxB.stages.length === 13, `B ran all 13 stages, got ${ctxB.stages.length}`);
  // Content-level isolation: B's generated configs carry B's identity, not A's.
  assert(String(ctxB.configs['business.json'].name).includes('Nile Bites'), 'B configs built from B dossier');
  assert(!String(ctxB.configs['business.json'].name).includes('Cairo Roast'), 'B configs do not leak A dossier');
});

await test('same business resumes its own checkpoints with the same runId', async () => {
  const root = path.join(WORK, 'same-business');
  const failedA = await expectStageFailure(new StageFailRunner({ root, failAt: 'generate-theme' }), dossierA, {
    businessId: 'iso-cairo-001',
    runId: 'run-same'
  });
  assert(failedA, 'A fails at generate-theme');
  const runner = createPipelineRunner({ root });
  assert(await runner.hasRunState('run-same'), 'run-state recorded for the failed run');
  const resumed = await runner.run(dossierA, {
    businessId: 'iso-cairo-001',
    runId: 'run-same',
    resume: true
  });
  assert(resumed.status === 'ready', `resume completes (${resumed.status})`);
  assert(resumed.resumed === true, 'resume flag set');
  assert(resumed.stages.some((s) => s.resumed), 'stages resumed from checkpoints');
  assert(resumed.stages.filter((s) => !s.ok).length === 0, 'no failed stages after resume');
  assert(resumed.businessId === 'iso-cairo-001', 'still the same business');
});

await test('a changed runId never resumes stale state', async () => {
  const root = path.join(WORK, 'changed-runid');
  const failedA = await expectStageFailure(new StageFailRunner({ root, failAt: 'generate-theme' }), dossierA, {
    businessId: 'iso-cairo-001',
    runId: 'run-first'
  });
  assert(failedA, 'A fails on run-first');
  const fresh = await createPipelineRunner({ root }).run(dossierA, {
    businessId: 'iso-cairo-001',
    runId: 'run-second',
    resume: true
  });
  assert(fresh.status === 'ready', `fresh run completes (${fresh.status})`);
  assert(fresh.resumed === false, 'no resume from a different run identity');
  assert(fresh.stages.every((s) => !s.resumed), 'all stages ran fresh');
});

await test('resume=true with no prior checkpoint runs fresh instead of failing', async () => {
  const root = path.join(WORK, 'no-state');
  const ctx = await createPipelineRunner({ root }).run(dossierA, {
    businessId: 'iso-cairo-003',
    runId: 'run-brand-new',
    resume: true
  });
  assert(ctx.status === 'ready', `completes (${ctx.status})`);
  assert(ctx.resumed === false, 'treated as a fresh run');
  assert(ctx.businessId === 'iso-cairo-003', 'correct business');
});

await test('concurrent runs on a shared runner keep each run state in its own namespace', async () => {
  const root = path.join(WORK, 'concurrent');
  const runner = new FailByBusinessRunner({ root, failAt: 'generate-theme', target: 'iso-cairo-001' });
  const [resA, resB] = await Promise.all([
    runner
      .run(dossierA, { businessId: 'iso-cairo-001', runId: 'run-ca', resume: true })
      .then(() => ({ ok: true }), (err) => ({ ok: false, code: err.code })),
    runner
      .run(dossierB, { businessId: 'iso-cairo-002', runId: 'run-nb', resume: true })
      .then((ctx) => ({ ok: true, status: ctx.status, resumed: ctx.resumed }), (err) => ({ ok: false, code: err.code }))
  ]);
  assert(!resA.ok && resA.code === PIP_CODES.STAGE_FAILED, 'A fails at generate-theme under concurrency');
  assert(resB.ok && resB.status === 'ready' && resB.resumed === false, 'B completes fresh under concurrency');

  // A's failed state must be in A's own namespace with A's own identity, even
  // though the shared runner had overlapping calls on the same instance.
  const aState = JSON.parse(await readFile(path.join(root, 'run-state-run-ca.json'), 'utf8'));
  assert(aState.businessId === 'iso-cairo-001', 'run-state records business A (not a concurrent business)');
  assert(aState.runId === 'run-ca', 'run-state records A runId');
  assert(aState.completedStages.every((s) => ['validate', 'normalize'].includes(s)), 'A completed only its own early stages');
  assert(await exists(path.join(root, 'checkpoints', 'run-ca', 'validate.json')), 'A checkpoints under A runId');
  // B succeeded and must have no run-state; A's failure must not be visible under B.
  assert(!(await exists(path.join(root, 'run-state-run-nb.json'))), 'B left no run-state (it succeeded)');
});

await test('default (no runId) deterministically namespaces separate businesses', async () => {
  const ctxA = await createPipelineRunner({ root: path.join(WORK, 'default-ids') }).run(dossierA, { businessId: 'iso-cairo-001' });
  const ctxB = await createPipelineRunner({ root: path.join(WORK, 'default-ids') }).run(dossierB, { businessId: 'iso-cairo-002' });
  assert(ctxA.status === 'ready' && ctxB.status === 'ready', 'both ready');
  assert(ctxA.runId !== ctxB.runId, 'default runIds differ per business');
  assert(ctxA.businessId === 'iso-cairo-001' && ctxB.businessId === 'iso-cairo-002', 'no cross-business identity leakage');
});

await test('default (no runId) resumes from its deterministic runId and leaves no garbage run-state-run.json', async () => {
  const root = path.join(WORK, 'default-resume');
  // Fail mid-run WITHOUT an explicit runId: the resolved deterministic runId must
  // namespace BOTH the checkpoints and the run-state, so nothing is persisted
  // under the literal `run` identity.
  const failedA = await expectStageFailure(new StageFailRunner({ root, failAt: 'generate-theme' }), dossierA, {
    businessId: 'iso-cairo-001'
  });
  assert(failedA, 'A fails at generate-theme with no runId');
  assert(!(await exists(path.join(root, 'run-state-run.json'))), 'no garbage run-state-run.json from the raw null runId');
  assert(!(await exists(path.join(root, 'checkpoints', 'run'))), 'no checkpoints under the literal-run folder');
  const namespaced = (await readdir(root)).filter((f) => f.startsWith('run-state-run-') && f.endsWith('.json'));
  assert(namespaced.length === 1, `exactly one deterministic run-state file, got ${namespaced.length}`);

  // Resuming the same business WITHOUT a runId must find the state written under
  // that same deterministic runId and continue from its checkpoints.
  const resumed = await createPipelineRunner({ root }).run(dossierA, {
    businessId: 'iso-cairo-001',
    resume: true
  });
  assert(resumed.status === 'ready', `resume completes (${resumed.status})`);
  assert(resumed.resumed === true, 'resumed from the deterministic runId');
  assert(resumed.stages.some((s) => s.resumed), 'checkpoint found and reused');
  assert(resumed.businessId === 'iso-cairo-001', 'same business');
  assert(resumed.stages.filter((s) => !s.ok).length === 0, 'no failed stages after resume');

  // Successful completion must clean up the deterministic run-state.
  const remaining = (await readdir(root)).filter((f) => f.startsWith('run-state-run-') && f.endsWith('.json'));
  assert(remaining.length === 0, 'run-state cleaned up on successful completion');
});

console.log(`pipeline/checkpoint-isolation: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) {
  for (const f of failures) console.log(`  - ${f.label}: ${f.err.message}`);
  process.exitCode = 1;
}
