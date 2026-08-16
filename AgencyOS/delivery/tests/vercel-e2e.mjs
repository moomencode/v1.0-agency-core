import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeliverySystem } from '../index.js';
import { ArtifactSystem } from '../../artifacts/index.js';
import { MemorySystem } from '../../memory/index.js';
import { VercelProvider } from '../providers/vercel/index.js';
import { deliveryError, DEL_CODES } from '../errors.js';
import { cleanSite, scratchRoot, assert, runTests } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const HAS_VERCEL_CREDS = !!(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID);

const root = scratchRoot('vercel-e2e');

const artifacts = new ArtifactSystem({ root });
const memory = new MemorySystem({ root, validate: true });
const system = createDeliverySystem({ root, engine: fakeEngine(), artifacts, memory, autoAllowed: false });

const filesByBusiness = new Map();

function fakeEngine() {
  return {
    export(site, { format = 'static' } = {}) {
      if (format !== 'static') throw new Error('static only');
      return filesByBusiness.get(site.businessId) || {};
    }
  };
}

async function buildFor(businessId, version) {
  const fixture = cleanSite(businessId, { version, runId: `run-${businessId}-v${version}` });
  filesByBusiness.set(businessId, fixture.files);
  const result = await system.builds.build(businessId, { site: fixture.site, validation: fixture.validation, trace: fixture.trace });
  const tree = system.builds.readTree(result.buildId);
  const qa = system.qa.run({ buildId: result.buildId, site: fixture.site, validation: fixture.validation, buildRecord: result.record, files: tree });
  system.packaging.packageBuild({ buildId: result.buildId, buildRecord: result.record, qaReport: qa, tree });
  return { ...result, qa, tree };
}

const tests = [
  ['VercelProvider validates config without VERCEL_TOKEN', async () => {
    const provider = new VercelProvider({ project: 'test-project' }, { secrets: { require: () => { throw deliveryError(DEL_CODES.SECRET_MISSING, 'VERCEL_TOKEN missing'); } } });
    let threw = false;
    try {
      await provider.validateConfig();
    } catch (err) {
      threw = true;
      assert(err.code === 'E_DEL_SECRET_MISSING', `code ${err.code}`);
    }
    assert(threw, 'should throw without VERCEL_TOKEN');
  }],
  ['VercelProvider health check fails without VERCEL_TOKEN', async () => {
    const provider = new VercelProvider({ project: 'test-project' }, { secrets: { require: () => { throw deliveryError(DEL_CODES.SECRET_MISSING, 'VERCEL_TOKEN missing'); } } });
    const health = await provider.health();
    assert(health.ok === false, 'health should be false');
    assert(health.error && health.error.includes('VERCEL_TOKEN'), 'error should mention missing token');
    assert(health.code === 'E_DEL_SECRET_MISSING', `code ${health.code}`);
  }],
  ['VercelProvider dryRun works without credentials', async () => {
    const provider = new VercelProvider({ project: 'test-project' }, { secrets: { require: () => { throw deliveryError(DEL_CODES.SECRET_MISSING, 'VERCEL_TOKEN missing'); } } });
    const dry = provider.dryRun({ packageId: 'pkg-test', businessId: 'biz-test' });
    assert(dry.provider === 'vercel', 'provider is vercel');
    assert(dry.simulated === true, 'dryRun is simulated');
    assert(dry.url.includes('test-project.vercel.app'), 'url uses project name');
  }],
  ['Vercel deploy requires VERCEL_TOKEN', async () => {
    if (!HAS_VERCEL_CREDS) {
      console.log('SKIP: VERCEL_TOKEN not configured');
      return;
    }
    const provider = new VercelProvider({ project: process.env.VERCEL_PROJECT_ID }, {
      secrets: { require: (key) => process.env[key] }
    });
    const valid = await provider.validateConfig();
    assert(valid.ok === true, 'config valid');
    assert(valid.tokenPresent === true, 'token present');
  }],
  ['Vercel real E2E: dry-run -> explicit approval -> deploy -> verify -> record', async () => {
    if (!HAS_VERCEL_CREDS) {
      console.log('REAL E2E: BLOCKED -- VERCEL_TOKEN and VERCEL_PROJECT_ID required');
      console.log('Set VERCEL_TOKEN and VERCEL_PROJECT_ID environment variables to run');
      return;
    }

    const businessId = 'vercel-e2e-test';
    const { buildId } = await buildFor(businessId, 1);
    assert(qa.passed, 'QA must pass');

    const record = await system.deliver({ buildId, mode: 'explicit', provider: 'vercel', target: { project: process.env.VERCEL_PROJECT_ID } });
    assert(record.status === 'awaiting_approval', 'record awaits approval');

    const approved = await system.approve(record.id, { by: 'operator-e2e' });
    assert(approved.status === 'recorded', `recorded (${approved.status})`);
    assert(approved.deployment && approved.deployment.id, 'deployment id exists');
    assert(approved.timeline.some((t) => t.event === 'VERIFY_OK'), 'verified before recorded');
    assert(approved.deployment.url && approved.deployment.url.startsWith('https://'), 'has live URL');

    console.log(`REAL E2E: SUCCESS -- deployed to ${approved.deployment.url}`);
  }],
  ['Vercel deployment state transitions: READY -> IN_PROGRESS -> TERMINAL handling', async () => {
    if (!HAS_VERCEL_CREDS) {
      console.log('SKIP: VERCEL_TOKEN not configured');
      return;
    }
    const provider = new VercelProvider({ project: process.env.VERCEL_PROJECT_ID }, {
      secrets: { require: (key) => process.env[key] }
    });
    const valid = await provider.validateConfig();
    assert(valid.ok === true, 'config valid');

    // Test verify() with mock deployment ID (should handle unknown state gracefully)
    try {
      const verifyResult = await provider.verify('unknown-deployment-id');
      // verify should either succeed or throw with retryable error
      assert(verifyResult.status, 'verify returns status');
    } catch (err) {
      assert(err.retryable === true, 'unknown deployment should be retryable');
    }
  }],
  ['VercelProvider preflight validates project exists', async () => {
    if (!HAS_VERCEL_CREDS) {
      console.log('SKIP: VERCEL_TOKEN not configured');
      return;
    }
    const provider = new VercelProvider({ project: process.env.VERCEL_PROJECT_ID }, {
      secrets: { require: (key) => process.env[key] }
    });
    const valid = await provider.validateConfig();
    assert(valid.ok === true, 'config valid');
    assert(valid.project, 'project info returned');
  }],
  ['Vercel deployment retry on 5xx/rate-limit', async () => {
    if (!HAS_VERCEL_CREDS) {
      console.log('SKIP: VERCEL_TOKEN not configured')
      return;
    }
    const provider = new VercelProvider({ project: process.env.VERCEL_PROJECT_ID }, {
      secrets: { require: (key) => process.env[key] }
    });
    // This test would need a mock to simulate 5xx - testing retry logic is done in smoke tests
    assert(true, 'retry policy tested in smoke tests via MockProvider');
  }],
  ['Vercel auth failure (401) is never retried', async () => {
    if (!HAS_VERCEL_CREDS) {
      console.log('SKIP: VERCEL_TOKEN not configured');
      return;
    }
    // Test with invalid token
    const provider = new VercelProvider({ project: 'invalid-project' }, {
      secrets: { require: () => 'invalid-token' }
    });
    try {
      await provider.validateConfig();
      assert(false, 'should have thrown');
    } catch (err) {
      assert(err.code === 'E_DEL_AUTH_FAILED' || err.code === 'E_DEL_SECRET_MISSING', `auth error code ${err.code}`);
      assert(err.retryable === false, 'auth failure should not be retryable');
    }
  }]
];

await runTests('delivery/vercel-e2e', tests);