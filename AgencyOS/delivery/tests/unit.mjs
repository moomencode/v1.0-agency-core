import path from 'node:path';
import fs from 'node:fs';
import { createDeliverySystem, DEPLOY_MODES } from '../index.js';
import { buildIdFrom, recordIdFor, computeEngineChecksum, stableJson, sha256 } from '../utils.js';
import { deliveryError, DEL_CODES } from '../errors.js';
import { canTransition, applyTransition, DEPLOY_EVENTS, TERMINAL_STATES, DEPLOY_STATES } from '../deployment/state.js';
import { classifyProviderError, deliveryRetry, shouldRetryDelivery, pollUntil } from '../deployment/retry.js';
import { redact } from '../security/redaction.js';
import { scanText, scanFiles } from '../security/scan.js';
import { SecretVault } from '../security/secrets.js';
import { checkBudget } from '../build/budget.js';
import { scratchRoot, assert, runTests } from './helpers.mjs';

const root = scratchRoot('unit');

const tests = [
  ['buildId is deterministic from trace + checksum', () => {
    const trace = { businessId: 'unit-cafe-001', dossierVersion: 3, pipelineRunId: 'run-abc' };
    const checksum = 'a'.repeat(64);
    const a = buildIdFrom(trace, checksum);
    const b = buildIdFrom({ ...trace }, checksum);
    assert(a === b, 'same inputs -> same buildId');
    assert(/^[0-9a-f]{16}$/.test(a), 'buildId is 16 lowercase hex');
    const c = buildIdFrom(trace, sha256('other'));
    assert(a !== c, 'different checksum -> different buildId');
    const d = buildIdFrom({ ...trace, dossierVersion: 4 }, checksum);
    assert(a !== d, 'different dossierVersion -> different buildId');
  }],
  ['recordId derives from buildId with dep_ prefix', () => {
    assert(recordIdFor('0123456789abcdef') === 'dep_0123456789abcdef', 'prefix dep_');
  }],
  ['computeEngineChecksum is deterministic', () => {
    const site = { a: 1 };
    const files = { 'index.html': '<h1>x</h1>' };
    assert(computeEngineChecksum(site, files) === computeEngineChecksum({ a: 1 }, { 'index.html': '<h1>x</h1>' }), 'stable');
    assert(computeEngineChecksum(site, files) !== computeEngineChecksum(site, { 'index.html': '<h1>y</h1>' }), 'content-sensitive');
  }],
  ['stableJson orders keys deterministically', () => {
    assert(stableJson({ b: 1, a: 2 }) === stableJson({ a: 2, b: 1 }), 'key order independent');
  }],
  ['state machine: happy path transitions', () => {
    const record = { id: 'dep_x', status: 'created', timeline: [] };
    applyTransition(record, DEPLOY_EVENTS.PACKAGED);
    assert(record.status === 'packaged', 'packaged');
    applyTransition(record, DEPLOY_EVENTS.APPROVAL_NEEDED);
    assert(record.status === 'awaiting_approval', 'awaiting_approval');
    applyTransition(record, DEPLOY_EVENTS.APPROVED);
    assert(record.status === 'approved', 'approved');
    applyTransition(record, DEPLOY_EVENTS.DEPLOY_START);
    assert(record.status === 'deploying', 'deploying');
    applyTransition(record, DEPLOY_EVENTS.DEPLOY_OK);
    assert(record.status === 'deployed', 'deployed');
    applyTransition(record, DEPLOY_EVENTS.VERIFY_OK);
    assert(record.status === 'verified', 'verified');
    applyTransition(record, DEPLOY_EVENTS.RECORDED);
    assert(record.status === 'recorded', 'recorded');
    assert(record.timeline.length === 7, `timeline appended 7 events, got ${record.timeline.length}`);
    assert(TERMINAL_STATES.has('recorded'), 'recorded is terminal');
  }],
  ['state machine: rollback + revert lanes', () => {
    const record = { id: 'dep_x', status: 'recorded', timeline: [] };
    applyTransition(record, DEPLOY_EVENTS.ROLLBACK_START);
    assert(record.status === 'rollback_requested', 'rollback_requested');
    applyTransition(record, DEPLOY_EVENTS.ROLLBACK_OK);
    assert(record.status === 'rolled_back', 'rolled_back');
    applyTransition(record, DEPLOY_EVENTS.REVERT_START);
    assert(record.status === 'reverting', 'reverting');
    applyTransition(record, DEPLOY_EVENTS.REVERT_OK);
    assert(record.status === 'reverted', 'reverted');
  }],
  ['state machine: invalid transitions throw BAD_STATE', () => {
    let threw = false;
    try {
      applyTransition({ id: 'dep_x', status: 'created', timeline: [] }, DEPLOY_EVENTS.DEPLOY_START);
    } catch (err) {
      threw = true;
      assert(err.code === DEL_CODES.BAD_STATE, `code ${err.code}`);
    }
    assert(threw, 'invalid transition throws');
    assert(!canTransition('recorded', DEPLOY_EVENTS.DEPLOY_START), 'canTransition false');
  }],
  ['state machine: retry is a self-loop on deploying', () => {
    const record = { id: 'dep_x', status: 'deploying', timeline: [] };
    applyTransition(record, DEPLOY_EVENTS.RETRY);
    assert(record.status === 'deploying', 'self-loop');
  }],
  ['state machine: retry is a legal self-loop on rollback_requested and reverting', () => {
    assert(canTransition('rollback_requested', DEPLOY_EVENTS.RETRY), 'rollback_requested accepts RETRY');
    assert(canTransition('reverting', DEPLOY_EVENTS.RETRY), 'reverting accepts RETRY');
    const rb = { id: 'dep_rb', status: 'rollback_requested', timeline: [] };
    applyTransition(rb, DEPLOY_EVENTS.RETRY);
    assert(rb.status === 'rollback_requested', 'rollback self-loop');
    const rv = { id: 'dep_rv', status: 'reverting', timeline: [] };
    applyTransition(rv, DEPLOY_EVENTS.RETRY);
    assert(rv.status === 'reverting', 'revert self-loop');
  }],
  ['DEPLOY_STATES covers all terminal states', () => {
    for (const s of TERMINAL_STATES) assert(DEPLOY_STATES.includes(s), `state ${s} listed`);
  }],
  ['error factory sets retryable and status meta', () => {
    const err = deliveryError(DEL_CODES.AUTH_FAILED, 'nope', { retryable: false, status: 401 });
    assert(err.name === 'DeliveryError', 'name');
    assert(err.code === DEL_CODES.AUTH_FAILED, 'code');
    assert(err.retryable === false, 'retryable false');
    assert(err.status === 401, 'status');
    const r = deliveryError(DEL_CODES.NETWORK_ERROR, 'boom', { status: 500 });
    assert(r.retryable === true, 'default retryable true');
  }],
  ['classifyProviderError: auth never retries', () => {
    const err = classifyProviderError(DEL_CODES.AUTH_FAILED, '401', { status: 401, retryable: false });
    assert(err.retryable === false, 'auth non-retryable');
    assert(!shouldRetryDelivery(err), 'shouldRetry false');
  }],
  ['classifyProviderError: 5xx retries', () => {
    const err = classifyProviderError(DEL_CODES.NETWORK_ERROR, '503', { status: 503, retryable: true });
    assert(shouldRetryDelivery(err), '5xx retryable');
  }],
  ['deliveryRetry retries transient failures', async () => {
    let calls = 0;
    const result = await deliveryRetry(async () => {
      calls++;
      if (calls < 3) throw classifyProviderError(DEL_CODES.NETWORK_ERROR, 'transient', { status: 502, retryable: true });
      return { ok: true };
    }, { maxAttempts: 5, initialDelayMs: 1 });
    assert(result.ok, 'succeeded');
    assert(calls === 3, `3 attempts, got ${calls}`);
    assert(result.attemptCount === 2, 'attemptCount reports failed attempts');
  }],
  ['deliveryRetry never retries non-retryable errors', async () => {
    let calls = 0;
    let threw = false;
    try {
      await deliveryRetry(async () => {
        calls++;
        throw deliveryError(DEL_CODES.AUTH_FAILED, 'denied', { retryable: false });
      }, { maxAttempts: 5, initialDelayMs: 1 });
    } catch (err) {
      threw = true;
      assert(err.code === DEL_CODES.AUTH_FAILED, 'auth error surfaces');
    }
    assert(threw, 'threw');
    assert(calls === 1, `single attempt, got ${calls}`);
  }],
  ['deliveryRetry honors explicit retryable:false on provider errors', async () => {
    let calls = 0;
    await assertRejects(
      deliveryRetry(async () => {
        calls++;
        throw classifyProviderError(DEL_CODES.PROVIDER_ERROR, 'bad request', { status: 400, retryable: false });
      }, { maxAttempts: 5, initialDelayMs: 1 }),
      '400 not retried'
    );
    assert(calls === 1, `single attempt for 400, got ${calls}`);
  }],
  ['pollUntil stops on predicate success', async () => {
    let calls = 0;
    const out = await pollUntil(async () => {
      calls++;
      return calls >= 2 ? { status: 'READY' } : { status: 'BUILDING' };
    }, { maxAttempts: 10, initialDelayMs: 1, predicate: (v) => v.status === 'READY' });
    assert(out.status === 'READY', 'ready');
    assert(calls === 2, `2 polls, got ${calls}`);
  }],
  ['pollUntil gives up at maxAttempts', async () => {
    const out = await pollUntil(async () => ({ status: 'BUILDING' }), { maxAttempts: 3, initialDelayMs: 1 });
    assert(out.status === 'BUILDING', 'last value returned');
  }],
  ['scanText detects known secret patterns', () => {
    const cases = [
      ['sk-abcdef0123456789', 'known-prefix'],
      ['ghp_abcdefghijklmnopqrstuvwxyz123456', 'known-prefix'],
      ['AKIAIOSFODNN7EXAMPLE', 'aws-access-key'],
      ['xoxb-1234567890-abcdefgh', 'known-prefix'],
      ['VERCEL_TOKEN=abcdef0123456789abcdef0123456789', 'key-value-secret']
    ];
    for (const [text, type] of cases) {
      const matches = scanText(text);
      assert(matches.length >= 1, `detected ${type} in ${text.slice(0, 12)}... (got ${matches.length})`);
      assert(matches.some((m) => m.type === type), `type ${type} matched`);
    }
  }],
  ['scanText rejects benign text', () => {
    const benign = ['hello world', 'access denied', 'token amount: 12', 'my name is skyler'];
    for (const text of benign) {
      assert(scanText(text).length === 0, `no match for "${text}"`);
    }
  }],
  ['scanFiles reports paths and matches', () => {
    const results = scanFiles({ 'index.html': '<p>api key: sk-abcdef0123456789</p>', 'ok.txt': 'fine' });
    assert(results.length === 1, `one file flagged, got ${results.length}`);
    assert(results[0].path === 'index.html', 'path flagged');
  }],
  ['redact removes known secret values recursively', () => {
    const vault = new SecretVault({ env: { VERCEL_TOKEN: 'secret-token-123' } });
    const record = { target: { token: 'secret-token-123' }, keep: 'visible' };
    const out = redact(record, { vault });
    assert(out.target.token === '[REDACTED]', 'token value redacted');
    assert(out.keep === 'visible', 'non-secret preserved');
    assert(!JSON.stringify(out).includes('secret-token-123'), 'no raw secret in output');
  }],
  ['redact masks key-based secret fields', () => {
    const out = redact({ auth: { apiKey: 'abc', password: 'hunter2' }, url: 'https://x' }, {});
    assert(out.auth.apiKey === '[REDACTED]' && out.auth.password === '[REDACTED]', 'key-based');
    assert(out.url === 'https://x', 'url untouched');
  }],
  ['SecretVault reads env and .env file', () => {
    const envPath = path.join(root, 'secrets', '.env');
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, 'VERCEL_TOKEN=file-secret-456\n# comment\nEMPTY=\n');
    const vault = new SecretVault({ env: { HOME_TOKEN: 'env-secret' }, envPath });
    assert(vault.get('HOME_TOKEN') === 'env-secret', 'env value');
    assert(vault.get('VERCEL_TOKEN') === 'file-secret-456', '.env value');
    assert(vault.get('EMPTY') === '', 'empty value kept as empty string');
  }],
  ['SecretVault.require throws E_DEL_SECRET_MISSING', () => {
    const vault = new SecretVault({ env: {} });
    let threw = false;
    try {
      vault.require('MISSING_TOKEN');
    } catch (err) {
      threw = true;
      assert(err.code === DEL_CODES.SECRET_MISSING, `code ${err.code}`);
    }
    assert(threw, 'threw');
  }],
  ['budget passes small trees and fails oversized', () => {
    const small = checkBudget({ 'a.txt': 'x'.repeat(100) }, { maxTotalBytes: 1000, maxGzipBytes: 1000 });
    assert(small.passed, 'small passes');
    const big = checkBudget({ 'a.txt': 'x'.repeat(2000) }, { maxTotalBytes: 1000, maxGzipBytes: 1000 });
    assert(!big.passed, 'big fails');
    assert(big.totalBytes === 2000, 'totalBytes measured');
  }],
  ['record schema validates generated records', () => {
    const system = createDeliverySystem({ root });
    const record = {
      schema: 'https://agency.os/delivery/deployment-record',
      id: 'dep_0123456789abcdef',
      businessId: 'x',
      trace: { businessId: 'x', buildId: '0123456789abcdef' },
      provider: 'mock',
      target: {},
      mode: 'dry-run',
      status: 'created',
      package: { packageId: '0123456789abcdef', bundleSha256: 'a'.repeat(64), fileCount: 2 },
      timeline: [{ event: 'PACKAGED', from: 'created', to: 'packaged', at: new Date().toISOString() }],
      createdAt: new Date().toISOString()
    };
    const result = system.validator.validate(record, system.schemas['deployment-record'], { schemaPath: 'delivery:deployment-record' });
    assert(result.valid, `valid: ${JSON.stringify(result.errors)}`);
    const bad = system.validator.validate({ ...record, id: 'nope' }, system.schemas['deployment-record'], { schemaPath: 'delivery:deployment-record' });
    assert(!bad.valid, 'invalid id rejected');
  }],
  ['build records carry createdAt metadata without touching deterministic identity', async () => {
    const files = { 'index.html': '<h1>hi</h1>' };
    const engine = { export: () => files };
    const system = createDeliverySystem({ root: scratchRoot('unit-build-created'), engine });
    const site = { businessId: 'unit-created-001', engineVersion: 'test-engine-1.0', pages: [] };
    const validation = { passed: true, totals: {} };
    const trace = { businessId: 'unit-created-001', dossierVersion: 1, pipelineRunId: 'run-created' };
    const a = await system.builds.build('unit-created-001', { site, validation, trace });
    assert(a.record.createdAt && typeof a.record.createdAt === 'string', 'createdAt present');
    assert(!Number.isNaN(Date.parse(a.record.createdAt)), 'createdAt is an ISO date-time');
    const b = await system.builds.build('unit-created-001', { site, validation, trace });
    assert(a.buildId === b.buildId, 'deterministic buildId unchanged by createdAt');
    assert(a.record.createdAt === b.record.createdAt, 'reused record keeps original createdAt');
    const schema = system.schemas['build-record'];
    const ok = system.validator.validate(a.record, schema, { schemaPath: 'delivery:build-record' });
    assert(ok.valid, `build record satisfies build-record schema: ${JSON.stringify(ok.errors)}`);
    const c = await system.builds.build('unit-created-002', {
      site: { ...site, businessId: 'unit-created-002' },
      validation,
      trace: { ...trace, businessId: 'unit-created-002' }
    });
    assert(c.record.createdAt && !Number.isNaN(Date.parse(c.record.createdAt)), 'fresh build also carries createdAt');
  }],
  ['DELIVERY modes are enumerable and fixed', () => {
    assert(JSON.stringify(DEPLOY_MODES) === JSON.stringify(['dry-run', 'explicit', 'auto']), 'modes');
  }]
];

async function assertRejects(promise, label) {
  let threw = false;
  try {
    await promise;
  } catch {
    threw = true;
  }
  assert(threw, label);
}

await runTests('delivery/unit', tests);
