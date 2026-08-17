import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExecutor } from '../../runtime/executor.js';
import { DossierEngine } from '../../dossier/index.js';
import { createPipelineRunner, PIP_CODES } from '../index.js';

// Shift-left secret scan (Production Readiness hardening, P1-1): the
// generate-config stage rejects secret-like generated configs and the
// rejection stays PIP_CODES.VALIDATION_FAILED. Deterministic, no credentials,
// no network.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const WORK = path.join(ROOT, 'storage', 'pipeline-secret-scan');

let passed = 0;
let failed = 0;
function assert(cond, label, extra = '') {
  if (cond) {
    passed++;
    console.log(`PASS ${label}`);
  } else {
    failed++;
    console.log(`FAIL ${label} ${extra}`);
  }
}
function section(label) {
  console.log(`== ${label}`);
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

await fs.promises.rm(WORK, { recursive: true, force: true });

const executor = await createExecutor({ runId: 'pipeline-secret-scan' });
const de = new DossierEngine({ root: null });
const dossier = await de.build(recordOf(), { persist: false });

section('pipeline shift-left secret scan');
{
  const runner = createPipelineRunner({ root: path.join(WORK, 'clean'), validator: executor.validator, logger: executor.logger });
  const ctx = await runner.run(dossier, { businessId: 'dis-cairo-001', runId: 'secret-scan-clean' });
  assert(ctx.status === 'ready', 'clean generated configs pass');
  assert(ctx.configCount === 19, '19 configs still generated');
  assert(ctx.qaPassed === true, 'clean run still passes QA');

  const poisoned = await de.build(recordOf(), { persist: false });
  poisoned.documents.social.platforms = [{ platform: 'instagram', url: 'https://instagram.com/roastery?token=superSecretValue123', present: true }];
  const badRunner = createPipelineRunner({ root: path.join(WORK, 'bad'), validator: executor.validator, logger: executor.logger });
  let err = null;
  try {
    await badRunner.run(poisoned, { businessId: 'dis-cairo-001', runId: 'secret-scan-bad' });
  } catch (e) {
    err = e;
  }
  assert(err !== null, 'secret-like generated config rejected');
  assert(err && err.code === PIP_CODES.VALIDATION_FAILED, 'rejection stays PIP_CODES.VALIDATION_FAILED', err && err.code);
  assert(err && err.message.includes('secret scan'), 'rejection message identifies the scan');
}

await executor.close?.();
console.log(`\npipeline/tests/secret-scan.mjs: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;