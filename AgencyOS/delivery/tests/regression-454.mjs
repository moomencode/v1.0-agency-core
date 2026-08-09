import fs from 'node:fs';
import path from 'node:path';
import { createDeliverySystem } from '../index.js';
import { ArtifactSystem } from '../../artifacts/index.js';
import { MemorySystem } from '../../memory/index.js';
import { MockProvider } from '../providers/mock.js';
import { SecretVault } from '../security/secrets.js';
import { deliveryError, DEL_CODES } from '../errors.js';
import { cleanSite, scratchRoot, assert, runTests } from './helpers.mjs';

const root = scratchRoot('regression-454');
const filesByBusiness = new Map();

const fakeEngine = {
  export(site) {
    return filesByBusiness.get(site.businessId) || {};
  }
};

const artifacts = new ArtifactSystem({ root });
const memory = new MemorySystem({ root, validate: true });
const vault = new SecretVault({ env: { VLT_TOP_SECRET: 'VLT-TOP-SECRET-42' } });
const system = createDeliverySystem({ root, engine: fakeEngine, artifacts, memory, autoAllowed: false, vault });

class LeakyProvider extends MockProvider {
  async deploy(packageInfo) {
    throw deliveryError(DEL_CODES.AUTH_FAILED, 'deploy rejected: credential sk-abcdef0123456789xyz leaked; scope VLT-TOP-SECRET-42', { status: 401, retryable: false });
  }
}

async function buildFor(businessId, version = 1) {
  const fixture = cleanSite(businessId, { version, runId: `run-${businessId}-v${version}` });
  filesByBusiness.set(businessId, fixture.files);
  const result = await system.builds.build(businessId, { site: fixture.site, validation: fixture.validation, trace: fixture.trace });
  const tree = system.builds.readTree(result.buildId);
  const qa = system.qa.run({ buildId: result.buildId, site: fixture.site, validation: fixture.validation, buildRecord: result.record, files: tree });
  system.packaging.packageBuild({ buildId: result.buildId, buildRecord: result.record, qaReport: qa, tree });
  return { ...result, qa, tree };
}

function patchRecord(record, patch) {
  const storePath = path.join(root, 'storage', 'delivery', 'records', `${record.id}.json`);
  const staged = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  Object.assign(staged, patch);
  fs.writeFileSync(storePath, JSON.stringify(staged, null, 2));
}

const tests = [
  // ---- P1-2: crash-mid-deploy recovery (no duplicate deployments, fail-safe terminal) ----
  ['P1-2 recovery: deploying record with provider id is verified and recorded without re-deploy', async () => {
    const { buildId } = await buildFor('r45-rec-001', 1);
    const provider = new MockProvider({ project: 'r45-rec-001' }, { root });
    system.registerProvider('r45-rec-provider', provider);
    const record = await system.deliver({ buildId, mode: 'explicit', provider: 'r45-rec-provider' });
    assert(record.status === 'awaiting_approval', 'awaiting approval');
    await provider.deploy({ packageId: buildId });
    patchRecord(record, { status: 'deploying', deployment: { id: `mock-${buildId}`, url: `https://r45-rec-001.vercel.mock/${buildId}`, state: 'READY' } });
    const recovered = await system.recover(record.id);
    assert(recovered.status === 'recorded', `recovered to recorded (${recovered.status})`);
    assert(recovered.timeline.some((t) => t.event === 'VERIFY_OK'), 'verified after interruption');
    assert(recovered.timeline.some((t) => t.event === 'RECORDED'), 'recorded after interruption');
    assert(provider.deployments.size === 1, 'exactly one provider deployment — never re-deployed');
  }],
  ['P1-2 recovery: deploying record without provider id fails terminal without re-deploy', async () => {
    const { buildId } = await buildFor('r45-rec-002', 1);
    const provider = new MockProvider({ project: 'r45-rec-002' }, { root });
    system.registerProvider('r45-rec-002-provider', provider);
    const record = await system.deliver({ buildId, mode: 'explicit', provider: 'r45-rec-002-provider' });
    patchRecord(record, { status: 'deploying', deployment: { id: null, url: null, state: 'DEPLOYING' } });
    let threw = false;
    try {
      await system.recover(record.id);
    } catch (err) {
      threw = true;
      assert(err.code === 'E_DEL_PROVIDER_ERROR', `code ${err.code}`);
    }
    assert(threw, 'recovery refused');
    const failed = system.getRecord(record.id);
    assert(failed.status === 'failed', `terminal failed (${failed.status})`);
    assert(failed.error && failed.error.code === 'E_DEL_PROVIDER_ERROR', 'evidence preserved in error');
    assert(provider.deployments.size === 0, 'provider never contacted');
  }],
  ['P1-2 recovery: ambiguous provider state fails terminal without re-deploy', async () => {
    const { buildId } = await buildFor('r45-rec-003', 1);
    const provider = new MockProvider({ project: 'r45-rec-003' }, { root });
    system.registerProvider('r45-rec-003-provider', provider);
    const record = await system.deliver({ buildId, mode: 'explicit', provider: 'r45-rec-003-provider' });
    patchRecord(record, { status: 'deploying', deployment: { id: `mock-${buildId}`, url: null, state: 'DEPLOYING' } });
    let threw = false;
    try {
      await system.recover(record.id);
    } catch (err) {
      threw = true;
      assert(err.code === 'E_DEL_PROVIDER_ERROR', `code ${err.code}`);
    }
    assert(threw, 'ambiguous state refused');
    const failed = system.getRecord(record.id);
    assert(failed.status === 'failed', `terminal failed (${failed.status})`);
    assert(provider.deployments.size === 0, 'no re-deploy attempted');
  }],
  ['P1-2 recovery: verified record finalizes to recorded', async () => {
    const { buildId } = await buildFor('r45-rec-004', 1);
    const provider = new MockProvider({ project: 'r45-rec-004' }, { root });
    system.registerProvider('r45-rec-004-provider', provider);
    const record = await system.deliver({ buildId, mode: 'explicit', provider: 'r45-rec-004-provider' });
    await provider.deploy({ packageId: buildId });
    patchRecord(record, { status: 'verified', deployment: { id: `mock-${buildId}`, url: `https://r45-rec-004.vercel.mock/${buildId}`, state: 'READY' } });
    const recovered = await system.recover(record.id);
    assert(recovered.status === 'recorded', `recorded (${recovered.status})`);
    assert(provider.deployments.size === 1, 'no extra deployment');
  }],

  // ---- P1-7: dry-run simulated is not a dead end; dry-run never contacts provider; build identity ----
  ['P1-7 dry-run simulated record promotes to a real explicit deployment (no dead end)', async () => {
    const { buildId } = await buildFor('r45-sim-001', 1);
    const provider = new MockProvider({ project: 'r45-sim-001' }, { root });
    system.registerProvider('r45-sim-001-provider', provider);
    const dry = await system.deliver({ buildId, mode: 'dry-run', provider: 'r45-sim-001-provider' });
    assert(dry.status === 'simulated', `simulated (${dry.status})`);
    assert(dry.dryRun && dry.dryRun.networkTouched === false, 'dry-run never contacted provider');
    assert(provider.deployments.size === 0, 'provider untouched during dry-run');
    const promoted = await system.deliver({ buildId, mode: 'explicit', provider: 'r45-sim-001-provider' });
    assert(promoted.id === dry.id, 'same deterministic record');
    assert(promoted.status === 'awaiting_approval', 'explicit promotion waits for approval (gate preserved)');
    const approved = await system.approve(promoted.id, { by: 'operator-r45' });
    assert(approved.status === 'recorded', `recorded (${approved.status})`);
    assert(provider.deployments.size === 1, 'exactly one real deployment');
    assert(approved.timeline.some((t) => t.event === 'APPROVAL_NEEDED' && t.from === 'simulated'), 'promotion kept gate evidence');
  }],
  ['P1-7 dry-run simulated record promotes directly for auto mode', async () => {
    const { buildId } = await buildFor('r45-sim-002', 1);
    system.registerProvider('r45-sim-002-provider', new MockProvider({ project: 'r45-sim-002' }, { root }));
    const dry = await system.deliver({ buildId, mode: 'dry-run', provider: 'r45-sim-002-provider' });
    assert(dry.status === 'simulated', 'simulated');
    const autoSystem = createDeliverySystem({ root, engine: fakeEngine, autoAllowed: true });
    const provider = new MockProvider({ project: 'r45-sim-002' }, { root });
    autoSystem.registerProvider('r45-sim-002-provider', provider);
    const promoted = await autoSystem.deliver({ buildId, mode: 'auto', provider: 'r45-sim-002-provider' });
    assert(promoted.status === 'recorded', `auto promotion deploys (${promoted.status})`);
    assert(provider.deployments.size === 1, 'one deployment');
    autoSystem.close();
  }],
  ['P1-7 simulated record aborted by operator is terminal and refuses re-request', async () => {
    const { buildId } = await buildFor('r45-sim-003', 1);
    const provider = new MockProvider({ project: 'r45-sim-003' }, { root });
    system.registerProvider('r45-sim-003-provider', provider);
    const dry = await system.deliver({ buildId, mode: 'dry-run', provider: 'r45-sim-003-provider' });
    assert(dry.status === 'simulated', 'simulated');
    const storePath = path.join(root, 'storage', 'delivery', 'records', `${dry.id}.json`);
    const staged = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    staged.status = 'failed';
    staged.timeline.push({ event: 'ABORT', from: 'simulated', to: 'failed', at: new Date().toISOString(), actor: 'operator-r45', note: 'aborted after dry-run' });
    fs.writeFileSync(storePath, JSON.stringify(staged, null, 2));
    let refused = false;
    try {
      await system.deliver({ buildId, mode: 'explicit', provider: 'r45-sim-003-provider' });
    } catch (err) {
      refused = true;
      assert(err.code === 'E_DEL_RECORD_CONFLICT', `conflict (${err.code})`);
    }
    assert(refused, 'aborted simulated record refuses promotion');
    assert(provider.deployments.size === 0, 'no provider contact');
  }],
  ['P1-7 malformed build identity is rejected at the delivery boundary', async () => {
    let threw = false;
    try {
      await system.deliver({ buildId: 'not-a-real-build', mode: 'explicit', provider: 'mock' });
    } catch (err) {
      threw = true;
      assert(err.code === 'E_DEL_UNKNOWN_BUILD', `code ${err.code}`);
    }
    assert(threw, 'malformed buildId rejected');
  }],

  // ---- P1-8: substring-aware redaction before persistence and audit ----
  ['P1-8 embedded secrets in failure notes are redacted in record, timeline and audit', async () => {
    const { buildId } = await buildFor('r45-sec-001', 1);
    const provider = new LeakyProvider({ project: 'r45-sec-001' }, { root });
    system.registerProvider('r45-sec-001-provider', provider);
    const record = await system.deliver({ buildId, mode: 'explicit', provider: 'r45-sec-001-provider' });
    let threw = false;
    try {
      await system.approve(record.id, { by: 'operator-r45' });
    } catch {
      threw = true;
    }
    assert(threw, 'leaky deploy failed');
    const failed = system.getRecord(record.id);
    assert(failed.status === 'failed', 'failed');
    const raw = JSON.stringify(failed);
    assert(!raw.includes('sk-abcdef0123456789xyz'), 'no embedded token in persisted record');
    assert(!raw.includes('VLT-TOP-SECRET-42'), 'no embedded vault value in persisted record');
    assert(raw.includes('[REDACTED]'), 'redaction marker present');
    assert(failed.error.note.includes('[REDACTED]'), 'error note redacted');
    const abort = failed.timeline.filter((t) => t.note && t.note.includes('deployment failed')).pop();
    assert(abort && !abort.note.includes('sk-abcdef0123456789xyz'), 'timeline note redacted');
    const logDir = path.join(root, 'logs', 'delivery');
    const logFile = fs.readdirSync(logDir).sort().at(-1);
    const auditContent = fs.readFileSync(path.join(logDir, logFile), 'utf8');
    assert(!auditContent.includes('sk-abcdef0123456789xyz'), 'audit log clean of embedded token');
    assert(!auditContent.includes('VLT-TOP-SECRET-42'), 'audit log clean of embedded vault value');
  }],
  ['P1-8 benign business names in notes are not destroyed', async () => {
    const { buildId } = await buildFor('r45-sec-002', 1);
    const provider = new MockProvider({ project: 'r45-sec-002' }, { root });
    system.registerProvider('r45-sec-002-provider', provider);
    const record = await system.deliver({ buildId, mode: 'explicit', provider: 'r45-sec-002-provider' });
    const approved = await system.approve(record.id, { by: 'operator-r45' });
    assert(approved.status === 'recorded', 'deployed');
    const again = await system.deliver({ buildId, mode: 'dry-run', provider: 'r45-sec-002-provider' });
    assert(again.id === record.id, 'same deterministic record reused');
    assert(!JSON.stringify(again).includes('[REDACTED]'), 'benign record contains no false redactions');
  }],

  // ---- P1-9: rollback retry legality ----
  ['P1-9 retryable rollback failure retries and recovers (RETRY legal on rollback_requested)', async () => {
    const { buildId: v1 } = await buildFor('r45-rb-001', 1);
    const provider = new MockProvider({ project: 'r45-rb-001' }, { root });
    system.registerProvider('r45-rb-001-provider', provider);
    const r1 = await system.deliver({ buildId: v1, mode: 'explicit', provider: 'r45-rb-001-provider' });
    await system.approve(r1.id, { by: 'operator-r45' });
    const { buildId: v2 } = await buildFor('r45-rb-001', 2);
    const r2 = await system.deliver({ buildId: v2, mode: 'explicit', provider: 'r45-rb-001-provider' });
    await system.approve(r2.id, { by: 'operator-r45' });
    system.approveRollback(r2.id, { by: 'operator-r45' });
    provider.queueFailure({ op: 'promote', status: 500, retryable: true });
    const { original } = await system.rollback({ recordId: r2.id, by: 'operator-r45', mode: 'explicit' });
    assert(original.status === 'rolled_back', `rolled back (${original.status})`);
    const retries = original.timeline.filter((t) => t.event === 'RETRY' && t.from === 'rollback_requested');
    assert(retries.length > 0, 'retry applied legally on rollback_requested');
    assert(original.rollback && original.rollback.buildId === v1, 'rolled back to v1');
  }],
  ['P1-9 non-retryable rollback failure aborts cleanly without illegal RETRY', async () => {
    const { buildId: v1 } = await buildFor('r45-rb-002', 1);
    const provider = new MockProvider({ project: 'r45-rb-002' }, { root });
    system.registerProvider('r45-rb-002-provider', provider);
    const r1 = await system.deliver({ buildId: v1, mode: 'explicit', provider: 'r45-rb-002-provider' });
    await system.approve(r1.id, { by: 'operator-r45' });
    const { buildId: v2 } = await buildFor('r45-rb-002', 2);
    const r2 = await system.deliver({ buildId: v2, mode: 'explicit', provider: 'r45-rb-002-provider' });
    await system.approve(r2.id, { by: 'operator-r45' });
    system.approveRollback(r2.id, { by: 'operator-r45' });
    provider.queueFailure({ op: 'promote', status: 401, retryable: false, code: 'E_DEL_AUTH_FAILED' });
    let threw = false;
    let errCode = null;
    try {
      await system.rollback({ recordId: r2.id, by: 'operator-r45', mode: 'explicit' });
    } catch (err) {
      threw = true;
      errCode = err.code;
    }
    assert(threw, 'rollback aborted');
    assert(errCode === 'E_DEL_AUTH_FAILED', `original error surfaced (${errCode}) — not masked by state error`);
    const failed = system.getRecord(r2.id);
    assert(failed.status === 'failed', `terminal failed (${failed.status})`);
    assert(!failed.timeline.some((t) => t.event === 'RETRY'), 'no illegal retry attempt');
  }]
];

await runTests('delivery/regression-454', tests);
