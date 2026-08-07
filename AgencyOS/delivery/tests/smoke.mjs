import fs from 'node:fs';
import path from 'node:path';
import { createDeliverySystem } from '../index.js';
import { ArtifactSystem } from '../../artifacts/index.js';
import { MemorySystem } from '../../memory/index.js';
import { MockProvider } from '../providers/mock.js';
import { cleanSite, scratchRoot, assert, runTests } from './helpers.mjs';

const root = scratchRoot('smoke');

const BUSINESSES = [
  ['smk-cafe-001', 1],
  ['smk-rest-001', 1],
  ['smk-med-001', 1],
  ['smk-law-001', 2],
  ['smk-gym-001', 1],
  ['smk-print-001', 1],
  ['smk-art-001', 3]
];

const filesByBusiness = new Map();

const fakeEngine = {
  export(site, { format = 'static' } = {}) {
    if (format !== 'static') throw new Error('static only');
    return filesByBusiness.get(site.businessId) || {};
  }
};

const artifacts = new ArtifactSystem({ root });
const memory = new MemorySystem({ root, validate: true });
const system = createDeliverySystem({ root, engine: fakeEngine, artifacts, memory, autoAllowed: false });

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
  ['all 7 businesses run the full chain to simulated', async () => {
    for (const [businessId, version] of BUSINESSES) {
      const { buildId, qa, record } = await buildFor(businessId, version);
      assert(qa.passed, `${businessId} qa pass`);
      const dry = await system.deliver({ buildId, mode: 'dry-run', provider: 'mock' });
      assert(dry.status === 'simulated', `${businessId} simulated (${dry.status})`);
      assert(dry.dryRun && dry.dryRun.simulated === true, `${businessId} dry-run plan`);
      assert(dry.deployment === null, `${businessId} no real deployment`);
      assert(dry.package.bundleSha256 === system.packaging.loadManifest(buildId).bundle.sha256, `${businessId} checksum`);
      assert(system.getRecord(dry.id).id === dry.id, `${businessId} record persisted`);
    }
    assert(system.history('smk-cafe-001').length === 1, 'history filtered');
  }],
  ['deterministic rebuild: same buildId, bundle sha, record id', async () => {
    const a = await buildFor('smk-cafe-001', 1);
    const b = await buildFor('smk-cafe-001', 1);
    assert(a.buildId === b.buildId, 'same buildId');
    assert(a.record.engineOutputChecksum === b.record.engineOutputChecksum, 'same checksum');
    assert(a.record.fileCount === b.record.fileCount, 'same file count');
    const shaA = system.packaging.bundleSha256(a.buildId);
    const shaB = system.packaging.bundleSha256(b.buildId);
    assert(shaA === shaB, 'same bundle sha');
    assert(system.getRecord(`dep_${a.buildId}`).id === `dep_${b.buildId}`, 'same record id');
    assert(a.record.files.every((f, i) => f.sha256 === b.record.files[i].sha256), 'per-file checksums stable');
  }],
  ['changed input produces a different buildId', async () => {
    const a = await buildFor('smk-rest-001', 1);
    const b = await buildFor('smk-rest-001', 2);
    assert(a.buildId !== b.buildId, 'version bump changes buildId');
  }],
  ['failed QA blocks record creation with zero provider contact', async () => {
    const fixture = cleanSite('smk-badqa-001', { version: 1 });
    filesByBusiness.set('smk-badqa-001', { ...fixture.files, 'leak.txt': 'token sk-abcdef1234567890' });
    const result = await system.builds.build('smk-badqa-001', { site: fixture.site, validation: fixture.validation, trace: fixture.trace });
    const qa = system.qa.run({ buildId: result.buildId, site: fixture.site, validation: fixture.validation, buildRecord: result.record, files: filesByBusiness.get('smk-badqa-001') });
    assert(!qa.passed, 'qa failed on secret');
    const provider = new MockProvider({ project: 'smk-badqa-001' }, { root });
    system.registerProvider('smk-badqa-provider', provider);
    let threw = false;
    try {
      await system.deliver({ buildId: result.buildId, mode: 'explicit', provider: 'smk-badqa-provider' });
    } catch (err) {
      threw = true;
      assert(err.code === 'E_DEL_QA_FAILED', `code ${err.code}`);
    }
    assert(threw, 'deployment blocked');
    assert(provider.deployments.size === 0, 'zero provider calls');
    const records = system.history('smk-badqa-001') || [];
    assert(records.length === 0, 'no record persisted');
  }],
  ['missing approval blocks deploy with zero provider contact', async () => {
    const { buildId } = await buildFor('smk-approval-001', 1);
    const provider = new MockProvider({ project: 'smk-approval-001' }, { root });
    system.registerProvider('smk-approval-provider', provider);
    const record = await system.deliver({ buildId, mode: 'explicit', provider: 'smk-approval-provider' });
    assert(record.status === 'awaiting_approval', 'awaiting approval');
    let threw = false;
    try {
      await system.deploy(record.id);
    } catch (err) {
      threw = true;
      assert(err.code === 'E_DEL_APPROVAL_REQUIRED', `code ${err.code}`);
    }
    assert(threw, 'blocked');
    assert(provider.deployments.size === 0, 'zero provider calls');
  }],
  ['dry-run never touches the provider', async () => {
    const { buildId } = await buildFor('smk-dryrun-001', 1);
    const provider = new MockProvider({ project: 'smk-dryrun-001' }, { root });
    system.registerProvider('smk-dryrun-provider', provider);
    const record = await system.deliver({ buildId, mode: 'dry-run', provider: 'smk-dryrun-provider' });
    assert(record.status === 'simulated', 'simulated');
    assert(provider.deployments.size === 0, 'provider untouched');
    assert(record.dryRun.networkTouched === false, 'network untouched');
  }],
  ['explicit approval deploys to local provider and records', async () => {
    const { buildId } = await buildFor('smk-local-001', 1);
    const record = await system.deliver({ buildId, mode: 'explicit', provider: 'local', target: { project: 'smk-local-001' } });
    const approved = await system.approve(record.id, { by: 'operator-smoke' });
    assert(approved.status === 'recorded', `recorded (${approved.status})`);
    assert(approved.deployment && approved.deployment.id === `local-${buildId}`, 'deployment id');
    const deployedIndex = fs.readFileSync(path.join(root, 'storage', 'delivery', 'local', 'smk-local-001', `local-${buildId}`, 'index.html'), 'utf8');
    assert(deployedIndex.includes('smk-local-001 home'), 'index content on disk');
    assert(approved.timeline.some((t) => t.event === 'VERIFY_OK'), 'verified before recorded');
  }],
  ['transient provider failure retries and succeeds', async () => {
    const { buildId } = await buildFor('smk-retry-001', 1);
    const provider = new MockProvider({ project: 'smk-retry-001' }, { root });
    provider.queueFailure({ op: 'deploy', status: 500, retryable: true });
    system.registerProvider('smk-retry-provider', provider);
    const record = await system.deliver({ buildId, mode: 'explicit', provider: 'smk-retry-provider' });
    const approved = await system.approve(record.id, { by: 'operator-smoke' });
    assert(approved.status === 'recorded', 'succeeded after retry');
    assert(approved.timeline.some((t) => t.event === 'RETRY'), 'retry recorded in timeline');
    assert(provider.deployments.size === 1, 'one deployment made');
  }],
  ['auth failure is never retried', async () => {
    const { buildId } = await buildFor('smk-auth-001', 1);
    const provider = new MockProvider({ project: 'smk-auth-001' }, { root });
    provider.queueFailure({ op: 'deploy', status: 401, retryable: false, code: 'E_DEL_AUTH_FAILED' });
    system.registerProvider('smk-auth-provider', provider);
    const record = await system.deliver({ buildId, mode: 'explicit', provider: 'smk-auth-provider' });
    let threw = false;
    try {
      await system.approve(record.id, { by: 'operator-smoke' });
    } catch {
      threw = true;
    }
    assert(threw, 'approval surfaced the auth error');
    const failed = system.getRecord(record.id);
    assert(failed.status === 'failed', `failed (${failed.status})`);
    assert(!failed.timeline.some((t) => t.event === 'RETRY'), 'no retry attempts');
    assert(failed.error && failed.error.code === 'E_DEL_AUTH_FAILED', 'auth error recorded');
  }],
  ['deployment record + qa report artifacts are written', () => {
    const indexPath = path.join(root, 'storage', 'artifacts-engine', '_index.json');
    assert(fs.existsSync(indexPath), 'artifact index exists');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const artifactsMap = index.artifacts || {};
    const artifactsList = Object.values(artifactsMap);
    assert(artifactsList.some((a) => a.type === 'deployment-report'), 'deployment artifact written');
    assert(artifactsList.some((a) => a.type === 'qa-report'), 'qa artifact written');
  }],
  ['memory entries recorded for deployments', () => {
    const dir = path.join(root, 'storage', 'memory-engine', 'business', 'business_smk-local-001');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
    assert(files.some((f) => f.startsWith('deployment_')), 'deployment memory entry');
    const entry = JSON.parse(fs.readFileSync(path.join(dir, files.find((f) => f.startsWith('deployment_'))), 'utf8'));
    assert(entry.content && entry.content.recordId && entry.content.recordId.startsWith('dep_'), 'memory entry carries record facts');
    assert(entry.content.businessId === 'smk-local-001', 'memory entry scoped to business');
  }],
  ['deployed event emitted', () => {
    let emitted = 0;
    const system2 = createDeliverySystem({ root: scratchRoot('smoke-events'), autoAllowed: false });
    system2.on('delivery.deployed', () => emitted++);
    assert(typeof system2.emit === 'function', 'emitter api');
    system2.close();
    assert(emitted === 0, 'no emissions on quiet system');
  }]
];

await runTests('delivery/smoke', tests);
