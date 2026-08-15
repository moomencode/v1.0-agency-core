import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { VercelProvider } from '../providers/vercel/index.js';
import { DEL_CODES } from '../errors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let passed = 0;
let failed = 0;
function assert(cond, label, extra = '') {
  if (cond) { passed++; console.log(`PASS ${label}`); }
  else { failed++; console.log(`FAIL ${label} ${extra}`); }
}

function makeProvider(readyState, { url = 'https://site.vercel.app', errorCode = null, status = 200 } = {}) {
  const http = async () => ({ status, json: async () => ({ readyState, url, errorCode }) });
  return new VercelProvider({ project: 'agency-site', team: null }, { secrets: { require: () => 'test-token' }, logger: null, http });
}

// 1 — READY is success
{
  const p = makeProvider('READY');
  const v = await p.verify('dep-1');
  assert(v.ready === true && v.terminal === false && v.status === 'READY', 'READY maps to ready', JSON.stringify(v));
  assert(v.url === 'https://site.vercel.app', 'url surfaced with READY');
}

// 2 — in-progress states keep polling (not ready, not terminal)
{
  for (const state of ['INITIALIZING', 'QUEUED', 'BUILDING']) {
    const v = await makeProvider(state).verify('dep-1');
    assert(v.ready === false && v.terminal === false, `${state} maps to in-progress`);
  }
}

// 3 — terminal non-ready states fast-fail
{
  for (const state of ['ERROR', 'CANCELED', 'ERRORED']) {
    const v = await makeProvider(state).verify('dep-1');
    assert(v.ready === false && v.terminal === true, `${state} maps to terminal`);
  }
}

// 4 — errorCode propagates on terminal states
{
  const v = await makeProvider('ERROR', { errorCode: 'DEPLOYMENT_FAILED' }).verify('dep-1');
  assert(v.errorCode === 'DEPLOYMENT_FAILED', 'errorCode surfaced');
}

// 5 — PRV-01: missing readyState is an explicit retryable error, not a poll
{
  let threw = null;
  try {
    await makeProvider(null).verify('dep-1');
  } catch (err) {
    threw = err;
  }
  assert(threw && threw.code === DEL_CODES.PROVIDER_ERROR, 'missing readyState throws PROVIDER_ERROR');
  assert(threw && threw.meta && threw.meta.retryable === true, 'missing readyState is retryable', JSON.stringify(threw?.meta));
}

// 6 — PRV-01: unrecognized readyState is an explicit retryable error
{
  let threw = null;
  try {
    await makeProvider('BUILDINGX').verify('dep-1');
  } catch (err) {
    threw = err;
  }
  assert(threw && threw.code === DEL_CODES.PROVIDER_ERROR, 'unknown readyState throws PROVIDER_ERROR');
  assert(threw && threw.meta && threw.meta.readyState === 'BUILDINGX', 'unknown state named in meta', JSON.stringify(threw?.meta));
  assert(threw && threw.meta && threw.meta.retryable === true, 'unknown state is retryable');
}

// 7 — API surface stability: provider id, dryRun, deploy/deploy errors unchanged
{
  const p = makeProvider('READY');
  assert(p.id === 'vercel', 'provider id stable');
  const dry = p.dryRun({ packageId: 'pkg-1', businessId: 'biz-1' });
  assert(dry.simulated === true && /^vercel-/.test(dry.deploymentId), 'dryRun shape unchanged', JSON.stringify(dry));
  let threw = null;
  try {
    await p.deploy({ tree: null });
  } catch (err) {
    threw = err;
  }
  assert(threw && threw.code === DEL_CODES.PACKAGE_MISSING, 'deploy guard unchanged');
}

console.log(`\ndelivery/vercel-verify: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;