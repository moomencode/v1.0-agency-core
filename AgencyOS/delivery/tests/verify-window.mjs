import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeliverySystem } from '../index.js';
import { VercelProvider, VERCEL_READY_STATE, VERCEL_TERMINAL_STATES } from '../providers/vercel/index.js';
import { pollUntil, classifyProviderError } from '../deployment/retry.js';
import { DEL_CODES } from '../errors.js';
import { SecretVault } from '../security/secrets.js';
import { cleanSite, scratchRoot, assert, runTests } from './helpers.mjs';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'providers', 'vercel', 'fixtures');
const vault = new SecretVault({ env: { VERCEL_TOKEN: 'fixture-token-0001' } });

const filesByBusiness = new Map();
const fakeEngine = {
  export(site, { format = 'static' } = {}) {
    if (format !== 'static') throw new Error('static only');
    return filesByBusiness.get(site.businessId) || {};
  }
};

async function buildFor(system, businessId) {
  const fixture = cleanSite(businessId, { version: 1, runId: `run-vw-${businessId}` });
  filesByBusiness.set(businessId, fixture.files);
  const result = await system.builds.build(businessId, { site: fixture.site, validation: fixture.validation, trace: fixture.trace });
  const tree = system.builds.readTree(result.buildId);
  const qa = system.qa.run({ buildId: result.buildId, site: fixture.site, validation: fixture.validation, buildRecord: result.record, files: tree });
  system.packaging.packageBuild({ buildId: result.buildId, buildRecord: result.record, qaReport: qa, tree });
  return result;
}

// A provider whose `verify()` walks a scripted readyState plan. The plan's last
// entry repeats once reached, so `['QUEUED','BUILDING','READY']` reaches READY
// on the third poll and `['BUILDING','ERROR']` terminates on the second.
class ScriptedProvider {
  constructor(config = {}, ctx = {}) {
    this.id = 'scripted';
    this.config = { project: 'scripted-project', ...config };
    this.ctx = ctx;
    this.verifyPlan = config.verifyPlan || ['READY'];
    this.verifyCount = 0;
    this.deployments = new Map();
  }

  async validateConfig() {
    return { ok: true, project: this.config.project };
  }

  async health() {
    return { ok: true, provider: 'scripted' };
  }

  async deploy(packageInfo) {
    const deploymentId = `scr-${packageInfo.packageId}`;
    this.deployments.set(deploymentId, { id: deploymentId, state: 'QUEUED', url: `https://scripted.example/${packageInfo.packageId}` });
    return { deploymentId, url: this.deployments.get(deploymentId).url, state: 'QUEUED' };
  }

  async verify(deploymentId) {
    if (!this.deployments.has(deploymentId)) {
      throw classifyProviderError(DEL_CODES.PROVIDER_ERROR, `unknown deployment ${deploymentId}`, { status: 404, retryable: false });
    }
    const idx = Math.min(this.verifyCount, this.verifyPlan.length - 1);
    this.verifyCount++;
    const status = this.verifyPlan[idx];
    const d = this.deployments.get(deploymentId);
    d.state = status;
    return { status, ready: status === 'READY', terminal: VERCEL_TERMINAL_STATES.includes(status), url: d.url };
  }

  async urlFor(deploymentId) {
    return this.deployments.get(deploymentId)?.url || null;
  }

  async promote(deploymentId) {
    return { alias: this.config.project, deploymentId };
  }

  async listDeployments() {
    return [...this.deployments.values()].map((d) => ({ id: d.id, state: d.state, url: d.url }));
  }

  dryRun(packageInfo) {
    return { provider: 'scripted', deploymentId: `scr-${packageInfo.packageId}`, url: `https://scripted.example`, simulated: true };
  }
}

const tests = [
  ['pollUntil fast-fails when stopWhen sees a terminal state', async () => {
    let calls = 0;
    const noTerminal = await pollUntil(
      async () => { calls++; return { status: 'BUILDING', ready: false }; },
      { maxAttempts: 10, initialDelayMs: 1, predicate: (v) => v.ready === true, stopWhen: (v) => v.terminal === true }
    );
    assert(noTerminal.status === 'BUILDING', 'no terminal seen -> full window');
    assert(calls === 10, `no terminal -> maxAttempts reached (calls=${calls})`);

    let calls2 = 0;
    const out = await pollUntil(
      async () => {
        calls2++;
        return calls2 === 1 ? { status: 'BUILDING', ready: false, terminal: false } : { status: 'ERROR', ready: false, terminal: true };
      },
      { maxAttempts: 10, initialDelayMs: 1, predicate: (v) => v.ready === true, stopWhen: (v) => v.terminal === true }
    );
    assert(calls2 === 2, `terminal fast-fail after 2 polls, got ${calls2}`);
    assert(out.status === 'ERROR' && out.terminal === true, 'terminal result returned');
  }],

  ['pollUntil respects a wall-clock timeoutMs budget', async () => {
    let calls = 0;
    const out = await pollUntil(
      async () => { calls++; return { status: 'BUILDING', ready: false }; },
      { maxAttempts: 1000, initialDelayMs: 10, timeoutMs: 40, predicate: (v) => v.ready === true }
    );
    assert(out.status === 'BUILDING', 'returned last poll');
    assert(calls < 1000, `did not exhaust maxAttempts (calls=${calls})`);
  }],

  ['vercel verify() maps READY/ERROR fixtures to ready/terminal metadata', async () => {
    const readFixture = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
    const readyProvider = new VercelProvider(
      { project: 'agency-demo' },
      { secrets: vault, http: async () => ({ status: 200, json: async () => readFixture('deployment-ready.json') }), logger: null }
    );
    const v = await readyProvider.verify('dpl_recorded_fixture_000000000001');
    assert(v.status === 'READY' && v.ready === true && v.terminal === false, `ready metadata, got ${JSON.stringify(v)}`);

    const errProvider = new VercelProvider(
      { project: 'agency-demo' },
      { secrets: vault, http: async () => ({ status: 200, json: async () => readFixture('deployment-error.json') }), logger: null }
    );
    const e = await errProvider.verify('dpl_recorded_fixture_000000000001');
    assert(e.status === 'ERROR' && e.ready === false && e.terminal === true && e.errorCode === 'BUILD_FAILED', `terminal metadata, got ${JSON.stringify(e)}`);

    assert(VERCEL_READY_STATE === 'READY', 'READY constant');
    assert(VERCEL_TERMINAL_STATES.includes('ERROR') && VERCEL_TERMINAL_STATES.includes('CANCELED'), 'terminal constants');
  }],

  ['deployment that reaches READY after several polls succeeds and records READY state', async () => {
    const system = createDeliverySystem({
      root: scratchRoot('verify-ready'),
      engine: fakeEngine,
      autoAllowed: true,
      verifyConfig: { maxAttempts: 10, initialDelayMs: 1, timeoutMs: 500 }
    });
    const provider = new ScriptedProvider({ verifyPlan: ['QUEUED', 'BUILDING', 'READY'] }, {});
    system.registerProvider('scripted', provider);
    const { buildId } = await buildFor(system, 'vw-ready-001');
    const rec = await system.deliver({ buildId, mode: 'auto', provider: 'scripted', target: {} });
    assert(rec.status === 'recorded', `recorded, got ${rec.status}`);
    assert(rec.deployment && rec.deployment.state === 'READY', `deployment.state READY, got ${rec.deployment && rec.deployment.state}`);
    assert(rec.deployment.id === `scr-${buildId}`, `deployment id, got ${rec.deployment && rec.deployment.id}`);
    assert(provider.verifyCount === 3, `polled until READY (3 verify calls), got ${provider.verifyCount}`);
    system.close();
  }],

  ['deployment entering terminal ERROR fails fast with a clear reason', async () => {
    const system = createDeliverySystem({
      root: scratchRoot('verify-error'),
      engine: fakeEngine,
      autoAllowed: true,
      verifyConfig: { maxAttempts: 20, initialDelayMs: 1, timeoutMs: 500 }
    });
    const provider = new ScriptedProvider({ verifyPlan: ['BUILDING', 'BUILDING', 'ERROR'] }, {});
    system.registerProvider('scripted', provider);
    const { buildId } = await buildFor(system, 'vw-error-001');
    let threw = null;
    try {
      await system.deliver({ buildId, mode: 'auto', provider: 'scripted', target: {} });
    } catch (err) {
      threw = err;
    }
    assert(threw, 'deliver must reject on terminal failure');
    assert(threw.code === DEL_CODES.PROVIDER_ERROR, `code ${threw.code}`);
    assert(threw.message.includes('terminal state ERROR'), `message: ${threw.message}`);
    const rec = system.getRecord(`dep_${buildId}`);
    assert(rec.status === 'failed', `record failed, got ${rec.status}`);
    assert(rec.error && rec.error.note && rec.error.note.includes('terminal state ERROR'), 'failed record carries the terminal reason');
    assert(provider.verifyCount === 3, `fast-fail: only 3 verify calls (not 20), got ${provider.verifyCount}`);
    system.close();
  }],

  ['deployment stuck in an in-progress state times out within the window', async () => {
    const system = createDeliverySystem({
      root: scratchRoot('verify-timeout'),
      engine: fakeEngine,
      autoAllowed: true,
      verifyConfig: { maxAttempts: 100, initialDelayMs: 1, timeoutMs: 40 }
    });
    const provider = new ScriptedProvider({ verifyPlan: ['BUILDING'] }, {});
    system.registerProvider('scripted', provider);
    const { buildId } = await buildFor(system, 'vw-timeout-001');
    let threw = null;
    try {
      await system.deliver({ buildId, mode: 'auto', provider: 'scripted', target: {} });
    } catch (err) {
      threw = err;
    }
    assert(threw, 'deliver must reject on window exhaustion');
    assert(threw.code === DEL_CODES.PROVIDER_ERROR, `code ${threw.code}`);
    assert(threw.message.includes('within the verification window'), `message: ${threw.message}`);
    assert(provider.verifyCount < 100, `bounded by timeoutMs (calls=${provider.verifyCount})`);
    const rec = system.getRecord(`dep_${buildId}`);
    assert(rec.status === 'failed', `record failed, got ${rec.status}`);
    system.close();
  }]
];

await runTests('delivery/verify-window', tests);
