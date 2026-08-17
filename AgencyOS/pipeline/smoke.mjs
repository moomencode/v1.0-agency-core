import assert from 'node:assert/strict';
import path from 'node:path';
import { rm, readFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createExecutor } from '../runtime/executor.js';
import { DossierEngine } from '../dossier/index.js';
import { PipelineRunner, createPipelineRunner, createRegistry, PIPELINE_EVENTS, PIP_CODES } from './index.js';
import { stableJson } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WORK = path.join(ROOT, 'storage', 'pipeline-smoke');

let n = 0;
function assertOk(label, info = '') {
  n++;
  console.log(`  ok ${n} — ${label} ${info}`);
}

function recordOf(overrides = {}) {
  return {
    id: 'dis-cairo-001', name: 'Cairo Roastery', category: 'cafe', area: 'Cairo',
    phone: '2027357788', email: 'hi@roastery.com', whatsapp: '201000000001',
    instagram: 'https://instagram.com/roastery', facebook: 'https://facebook.com/roastery',
    address: '12 Tahrir St', coordinates: { lat: 30.0444196, lng: 31.2357116 },
    photos: ['a', 'b', 'c'], menus: [{}, {}], booking: '/reservation',
    rating: 4.2, reviews: 230, website: 'https://roastery.example', probe: { ok: true, timeMs: 400 },
    sources: ['simulated', 'website'], weaknesses: [{ id: 'no-booking', severity: 'minor' }],
    scores: { business: { value: 69, breakdown: { presence: 20 } }, opportunity: { value: 77 } },
    ...overrides
  };
}

await rm(WORK, { recursive: true, force: true });

const executor = await createExecutor({ runId: 'pipeline-smoke' });
const de = new DossierEngine({ root: null });
const record = recordOf();
const dossier = await de.build(record, { persist: false });

const runner = createPipelineRunner({ root: WORK, validator: executor.validator, bus: executor.bus, logger: executor.logger });

// 1 — full run
const events = [];
runner.bus.emitter.on(PIPELINE_EVENTS.PIPELINE_COMPLETED, (ev) => events.push(ev));
const ctx = await runner.run(dossier, { businessId: 'dis-cairo-001', runId: 'smoke-run-1' });
assert.strictEqual(ctx.status, 'ready', 'pipeline ready');
assert.strictEqual(ctx.stages.length, 13, '13 stages');
assert.ok(ctx.stages.every((s) => s.ok), 'all stages ok');
assert.strictEqual(ctx.configCount, 19, '19 config files');
assert.strictEqual(ctx.qaPassed, true, 'qa passed');
assert.strictEqual(ctx.qaChecks, 7, 'seven qa checks (incl. contact-hours warning)');
assert.strictEqual(events.length, 1, 'completed event');
assertOk('full pipeline run ready', `(${ctx.stages.filter((s) => s.resumed).length} resumed)`);

// 2 — build package structure
const cfgDir = path.join(ctx.outputRoot, 'website-config');
const cfgFiles = (await readdir(cfgDir)).sort();
assert.strictEqual(cfgFiles.length, 19, '19 config files on disk');
assert.deepStrictEqual(cfgFiles, [
  'booking.json', 'brand.json', 'business.json', 'contact.json', 'faq.json', 'features.json',
  'footer.json', 'gallery.json', 'hero.json', 'i18n.json', 'menu.json', 'navigation.json',
  'offers.json', 'reviews.json', 'seo.json', 'services.json', 'social.json', 'stats.json', 'theme.json'
], 'exact config file set');
await access(path.join(ctx.outputRoot, 'reports', 'pipeline-report.md'));
await access(path.join(ctx.outputRoot, 'reports', 'generation-report.md'));
await access(path.join(ctx.outputRoot, 'reports', 'validation-report.md'));
await access(path.join(ctx.outputRoot, 'reports', 'qa-report.md'));
await access(path.join(ctx.outputRoot, 'logs', 'run.log'));
await access(path.join(ctx.outputRoot, 'artifacts', 'summary.json'));
await access(path.join(ctx.outputRoot, 'artifacts', 'manifest.json'));
await access(path.join(ctx.outputRoot, 'artifacts', 'structured-data.json'));
await access(path.join(ctx.outputRoot, 'artifacts', 'sections.json'));
await access(path.join(ctx.outputRoot, 'summary.json'));
assertOk('build package structure complete');

const diskSeo = JSON.parse(await readFile(path.join(cfgDir, 'seo.json'), 'utf8'));
assert.strictEqual(diskSeo.canonical, 'https://roastery.example', 'canonical from dossier website');
assertOk('config content matches dossier');

// 3 — determinism: same dossier → identical checksums
const runner2 = createPipelineRunner({ root: path.join(WORK, 'run2'), validator: executor.validator });
const ctx2 = await runner2.run(dossier, { businessId: 'dis-cairo-001', runId: 'smoke-run-2' });
const run1 = JSON.parse(await readFile(path.join(ctx.outputRoot, 'artifacts', 'summary.json'), 'utf8'));
const run2 = JSON.parse(await readFile(path.join(ctx2.outputRoot, 'artifacts', 'summary.json'), 'utf8'));
assert.deepStrictEqual(run1.checksums, run2.checksums, 'identical checksums across runs');
assert.deepStrictEqual(run1.configBytes, run2.configBytes, 'identical config bytes');
assertOk('100% deterministic across runs');

// 4 — resume: fail at generate-theme, then resume from checkpoints
{
  const failRoot = path.join(WORK, 'resume');
  class FailingRunner extends PipelineRunner {
    constructor(opts) {
      super(opts);
      this.failOnce = true;
    }
    async _runStage(stageId, ctx, dossier) {
      if (stageId === 'generate-theme' && this.failOnce) {
        this.failOnce = false;
        throw Object.assign(new Error('simulated theme failure'), { code: PIP_CODES.STAGE_FAILED });
      }
      return super._runStage(stageId, ctx, dossier);
    }
  }
  const badRunner = new FailingRunner({ root: failRoot, logger: executor.logger });
  let failed = false;
  try {
    await badRunner.run(dossier, { businessId: 'dis-cairo-001', runId: 'resume-run' });
  } catch (e) {
    failed = e.code === PIP_CODES.STAGE_FAILED;
  }
  assert.ok(failed, 'run failed at theme stage');
  assertOk('failure recorded at stage', '(generate-theme)');

  const resumeRunner = createPipelineRunner({ root: failRoot, validator: executor.validator, logger: executor.logger });
  const resumed = await resumeRunner.run(dossier, { businessId: 'dis-cairo-001', runId: 'resume-run', resume: true });
  assert.strictEqual(resumed.status, 'ready', 'resume completes');
  const resumedStages = resumed.stages.filter((s) => s.resumed);
  assert.ok(resumedStages.length >= 2, 'stages resumed from checkpoints', `(${resumedStages.length})`);
  assert.strictEqual(resumed.stages.filter((s) => !s.ok).length, 0, 'no failed stages after resume');
  assert.strictEqual(resumed.configCount, 19, 'configs after resume');
  assertOk('resume from checkpoint completes deterministically');
}

// 5 — QA failure halts the pipeline
{
  const qaRoot = path.join(WORK, 'qa-fail');
  class CorruptingRunner extends PipelineRunner {
    async _runStage(stageId, ctx, dossier) {
      if (stageId === 'generate-build-package') {
        ctx.configs['seo.json'] = { ...ctx.configs['seo.json'], title: '' };
      }
      return super._runStage(stageId, ctx, dossier);
    }
  }
  const qaRunner = new CorruptingRunner({ root: qaRoot, validator: executor.validator });
  let qaFailed = false;
  try {
    await qaRunner.run(dossier, { businessId: 'dis-cairo-001', runId: 'qa-fail-run' });
  } catch (e) {
    qaFailed = e.code === PIP_CODES.QA_FAILED;
  }
  assert.ok(qaFailed, 'qa failure halts pipeline');
  const qaReport = await readFile(path.join(qaRoot, 'build', 'reports', 'qa-report.md'), 'utf8');
  assert.ok(qaReport.includes('FAILED'), 'qa report written on failure');
  assertOk('qa failure halts + report persisted');
}

// 6 — validator wiring validates every config
const vctx = await runner2.run(dossier, { businessId: 'dis-cairo-001', runId: 'smoke-run-3' });
assert.ok(vctx.validation.validator === 'wired', 'validator wired');
assert.ok(vctx.validation.perConfig.every((c) => c.valid), 'all configs schema-valid');
assertOk('runtime validator validated all configs');

// 7 — registry integrity
const reg = runner.registry;
assert.strictEqual(reg.sortStages('website-production').length, 13, 'topo order 13 stages');
assert.throws(() => reg.get('missing'), (e) => e.code === PIP_CODES.UNKNOWN_PIPELINE, 'unknown pipeline');
assertOk('registry integrity');

await executor.close?.();
console.log(`=== PIPELINE SMOKE: ${n} PASS, 0 FAIL ===`);
process.exit(0);
