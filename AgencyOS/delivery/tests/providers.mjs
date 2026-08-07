import fs from 'node:fs';
import path from 'node:path';
import { createDeliverySystem } from '../index.js';
import { PROVIDER_IDS } from '../index.js';
import { VercelClient } from '../providers/vercel/client.js';
import { VercelProvider } from '../providers/vercel/index.js';
import { MockProvider } from '../providers/mock.js';
import { LocalProvider } from '../providers/local.js';
import { assertProvider, PROVIDER_METHODS } from '../providers/interface.js';
import { SecretVault } from '../security/secrets.js';
import { DEL_CODES } from '../errors.js';
import { cleanSite, scratchRoot, ROOT, assert, runTests } from './helpers.mjs';

const root = scratchRoot('providers');
const vault = new SecretVault({ env: { VERCEL_TOKEN: 'fixture-token-0001' } });
const filesByBusiness = new Map();
const fakeEngine = {
  export(site) {
    return filesByBusiness.get(site.businessId) || {};
  }
};
const system = createDeliverySystem({ root, vault, engine: fakeEngine });

async function packageFor(businessId, version = 1) {
  const fixture = cleanSite(businessId, { version });
  filesByBusiness.set(businessId, fixture.files);
  const result = await system.builds.build(businessId, { site: fixture.site, validation: fixture.validation, trace: fixture.trace });
  const tree = system.builds.readTree(result.buildId);
  const qa = system.qa.run({ buildId: result.buildId, site: fixture.site, validation: fixture.validation, buildRecord: result.record, files: tree });
  system.packaging.packageBuild({ buildId: result.buildId, buildRecord: result.record, qaReport: qa, tree });
  return { packageId: result.buildId, tree, bundlePath: system.packaging.bundlePath(result.buildId), businessId, ...fixture };
}

function fakeHttp(routes) {
  return async (url, opts = {}) => {
    const method = opts.method || 'GET';
    const match = routes.find((r) => r.method === method && url.includes(r.include));
    if (!match) return { status: 404, json: async () => ({ error: { code: 'not_found' } }) };
    if (match.delayMs) await new Promise((r) => setTimeout(r, match.delayMs));
    return { status: match.status, json: async () => match.body };
  };
}

const FIXTURES = path.join(ROOT, 'delivery', 'providers', 'vercel', 'fixtures');

const tests = [
  ['mock and local satisfy the provider interface contract', () => {
    const mock = new MockProvider({ project: 'mock-proj' }, { root });
    const local = new LocalProvider({ project: 'local-proj' }, { root });
    assertProvider(mock);
    assertProvider(local);
    for (const m of PROVIDER_METHODS) {
      assert(typeof mock[m] === 'function', `mock.${m}`);
      assert(typeof local[m] === 'function', `local.${m}`);
    }
  }],
  ['mock deploy/verify/promote lifecycle', async () => {
    const mock = new MockProvider({ project: 'mock-proj' }, { root });
    assert((await mock.validateConfig()).ok === true, 'config ok');
    const info = { packageId: '0123456789abcdef', tree: { 'index.html': '<h1>x</h1>' }, businessId: 'biz' };
    const d = await mock.deploy(info);
    assert(d.deploymentId === 'mock-0123456789abcdef', 'deploymentId');
    assert(d.state === 'READY', 'ready');
    assert((await mock.verify(d.deploymentId)).status === 'READY', 'verify ready');
    const promoted = await mock.promote(d.deploymentId);
    assert(promoted.deploymentId === d.deploymentId, 'promote target');
    assert(mock.alias === d.deploymentId, 'alias set');
    assert(mock.dryRun(info).simulated === true, 'dry run simulated');
    assert((await mock.listDeployments()).length === 1, 'listed');
  }],
  ['mock transient failure throws retryable network error', async () => {
    const mock = new MockProvider({ project: 'mock-proj' }, { root });
    mock.queueFailure({ op: 'deploy', status: 500, retryable: true });
    let threw = false;
    try {
      await mock.deploy({ packageId: '0123456789abcdef', tree: {}, businessId: 'biz' });
    } catch (err) {
      threw = true;
      assert(err.retryable === true, 'retryable');
    }
    assert(threw, 'threw');
  }],
  ['mock auth failure is not retryable', async () => {
    const mock = new MockProvider({ project: 'mock-proj' }, { root });
    mock.queueFailure({ op: 'deploy', status: 401, retryable: false, code: DEL_CODES.AUTH_FAILED });
    let threw = false;
    try {
      await mock.deploy({ packageId: '0123456789abcdef', tree: {}, businessId: 'biz' });
    } catch (err) {
      threw = true;
      assert(err.code === DEL_CODES.AUTH_FAILED, 'code');
      assert(err.retryable === false, 'not retryable');
    }
    assert(threw, 'threw');
  }],
  ['local provider deploys to disk and promotes', async () => {
    const local = new LocalProvider({ project: 'local-proj' }, { root });
    const info = await packageFor('prov-local-001');
    const d = await local.deploy(info);
    assert(d.state === 'READY', 'ready');
    const dir = path.join(root, 'storage', 'delivery', 'local', 'local-proj', d.deploymentId);
    assert(fs.existsSync(path.join(dir, 'index.html')), 'index.html written');
    assert(fs.readFileSync(path.join(dir, 'about.html'), 'utf8').includes('prov-local-001 about'), 'content written');
    assert((await local.verify(d.deploymentId)).status === 'READY', 'verify');
    const current = JSON.parse(fs.readFileSync(path.join(root, 'storage', 'delivery', 'local', 'local-proj', 'current.json'), 'utf8'));
    assert(current.deploymentId === d.deploymentId, 'current pointer');
    await local.promote(d.deploymentId);
    assert((await local.listDeployments()).some((x) => x.id === d.deploymentId), 'listed');
    assert(local.dryRun(info).simulated === true, 'dry run');
  }],
  ['vercel client createDeployment encodes files and parses fixtures', async () => {
    const http = fakeHttp([
      { method: 'POST', include: '/v13/deployments', status: 200, body: JSON.parse(fs.readFileSync(path.join(FIXTURES, 'deployment-created.json'), 'utf8')) }
    ]);
    const client = new VercelClient({ token: 't', project: 'agency-demo', http });
    const data = await client.createDeployment({ 'index.html': '<h1>hi</h1>' }, { name: 'biz', target: 'production' });
    assert(data.id === 'dpl_recorded_fixture_000000000001', 'fixture id');
    assert(data.readyState === 'QUEUED', 'queued');
  }],
  ['vercel client maps auth errors as non-retryable', async () => {
    const http = fakeHttp([{ method: 'POST', include: '/v13/deployments', status: 401, body: { error: { code: 'TOKEN_INVALID' } } }]);
    const client = new VercelClient({ token: 'bad', project: 'agency-demo', http });
    let threw = false;
    try {
      await client.createDeployment({ 'index.html': 'x' }, {});
    } catch (err) {
      threw = true;
      assert(err.code === DEL_CODES.AUTH_FAILED, `code ${err.code}`);
      assert(err.retryable === false, 'non-retryable');
    }
    assert(threw, 'threw');
  }],
  ['vercel client maps rate limits as retryable', async () => {
    const http = fakeHttp([{ method: 'POST', include: '/v13/deployments', status: 429, body: {} }]);
    const client = new VercelClient({ token: 't', project: 'agency-demo', http });
    let threw = false;
    try {
      await client.createDeployment({ 'index.html': 'x' }, {});
    } catch (err) {
      threw = true;
      assert(err.code === DEL_CODES.RATE_LIMITED, `code ${err.code}`);
      assert(err.retryable === true, 'retryable');
    }
    assert(threw, 'threw');
  }],
  ['vercel client maps 5xx as retryable network errors', async () => {
    const http = fakeHttp([{ method: 'POST', include: '/v13/deployments', status: 503, body: {} }]);
    const client = new VercelClient({ token: 't', project: 'agency-demo', http });
    let threw = false;
    try {
      await client.createDeployment({ 'index.html': 'x' }, {});
    } catch (err) {
      threw = true;
      assert(err.code === DEL_CODES.NETWORK_ERROR, `code ${err.code}`);
      assert(err.retryable === true, 'retryable');
    }
    assert(threw, 'threw');
  }],
  ['vercel provider deploy -> verify lifecycle with fixtures', async () => {
    const http = fakeHttp([
      { method: 'GET', include: '/v9/projects/', status: 200, body: JSON.parse(fs.readFileSync(path.join(FIXTURES, 'project.json'), 'utf8')) },
      { method: 'POST', include: '/v13/deployments', status: 200, body: JSON.parse(fs.readFileSync(path.join(FIXTURES, 'deployment-created.json'), 'utf8')) },
      { method: 'GET', include: '/v13/deployments/', status: 200, body: JSON.parse(fs.readFileSync(path.join(FIXTURES, 'deployment-ready.json'), 'utf8')) }
    ]);
    const provider = new VercelProvider({ project: 'agency-demo' }, { secrets: vault, http, logger: null });
    assert((await provider.validateConfig()).ok === true, 'preflight ok');
    const info = await packageFor('prov-vercel-001');
    const d = await provider.deploy(info);
    assert(d.deploymentId === 'dpl_recorded_fixture_000000000001', 'deployed fixture id');
    const v = await provider.verify(d.deploymentId);
    assert(v.status === 'READY', 'verified ready');
    assert(provider.urlFor ? (await provider.urlFor(d.deploymentId)) === v.url : true, 'url');
  }],
  ['vercel provider health fails cleanly on missing token', async () => {
    const empty = new SecretVault({ env: {} });
    const provider = new VercelProvider({ project: 'agency-demo' }, { secrets: empty, http: null, logger: null });
    const health = await provider.health();
    assert(health.ok === false, 'not ok');
    assert(health.code === DEL_CODES.SECRET_MISSING, 'missing token code');
  }],
  ['vercel dryRun is fully simulated (no http)', () => {
    const provider = new VercelProvider({ project: 'agency-demo' }, { secrets: vault });
    const plan = provider.dryRun({ packageId: '0123456789abcdef' });
    assert(plan.simulated === true, 'simulated');
    assert(plan.url === 'https://agency-demo.vercel.app', 'url');
    assert(plan.deploymentId === 'vercel-0123456789abcdef', 'id');
  }],
  ['registry resolves registered providers via system', () => {
    assert(system.registry.has(PROVIDER_IDS.MOCK), 'mock registered');
    assert(system.registry.has(PROVIDER_IDS.LOCAL), 'local registered');
    assert(system.registry.has(PROVIDER_IDS.VERCEL), 'vercel registered');
    const inst = system.registry.get(PROVIDER_IDS.LOCAL, { config: { project: 'x' }, ctx: { root } });
    assert(inst.id === 'local', 'instance');
  }]
];

await runTests('delivery/providers', tests);
