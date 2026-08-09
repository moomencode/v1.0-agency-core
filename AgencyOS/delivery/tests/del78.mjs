import fs from 'node:fs';
import path from 'node:path';
import { createDeliverySystem } from '../index.js';
import { MockProvider } from '../providers/mock.js';
import { DEL_CODES } from '../errors.js';
import { cleanSite, scratchRoot, assert, runTests } from './helpers.mjs';

const root = scratchRoot('del78');
const filesByBusiness = new Map();
const fakeEngine = {
  export(site) {
    return filesByBusiness.get(site.businessId) || {};
  }
};
const system = createDeliverySystem({ root, engine: fakeEngine });

async function buildFor(businessId, version = 1) {
  const fixture = cleanSite(businessId, { version, runId: `run-${businessId}-v${version}` });
  filesByBusiness.set(businessId, fixture.files);
  const result = await system.builds.build(businessId, { site: fixture.site, validation: fixture.validation, trace: fixture.trace });
  const tree = system.builds.readTree(result.buildId);
  const qa = system.qa.run({ buildId: result.buildId, site: fixture.site, validation: fixture.validation, buildRecord: result.record, files: tree });
  system.packaging.packageBuild({ buildId: result.buildId, buildRecord: result.record, qaReport: qa, tree });
  return { buildId: result.buildId };
}

function mockFor(businessId) {
  const id = `${businessId}-mock`;
  const provider = new MockProvider({ project: businessId }, { root });
  system.registerProvider(id, provider);
  return { id, provider };
}

function buildRecordPath(buildId) {
  return path.join(root, 'storage', 'delivery', 'builds', buildId, 'build-record.json');
}

const tests = [
  ['dry-run never blocks a later real deployment of the same buildId', async () => {
    const { buildId } = await buildFor('d78-cafe-001', 1);
    const { id: providerId, provider } = mockFor('d78-cafe-001');

    const dry = await system.deliver({ buildId, mode: 'dry-run', provider: providerId });
    assert(dry.status === 'simulated', `dry-run simulated (${dry.status})`);
    assert(provider.deployments.size === 0, 'no provider contact during dry-run');

    const rearmed = await system.deliver({ buildId, mode: 'explicit', provider: providerId, target: { project: 'd78-cafe-001' } });
    assert(rearmed.id === dry.id, 'same deterministic record re-armed');
    assert(rearmed.status === 'awaiting_approval', `re-armed to awaiting_approval (${rearmed.status})`);
    assert(rearmed.dryRun && rearmed.dryRun.simulated === true, 'historical dry-run plan preserved');
    assert(rearmed.timeline.some((t) => t.event === 'SIMULATED'), 'simulation kept on timeline');
    assert(rearmed.timeline.some((t) => t.event === 'APPROVAL_NEEDED' && t.from === 'simulated'), 're-arm transition recorded');
    assert(provider.deployments.size === 0, 'no provider contact until approval');

    const recorded = await system.approve(rearmed.id, { by: 'operator-d78' });
    assert(recorded.status === 'recorded', `recorded after approval (${recorded.status})`);
    assert(provider.deployments.size === 1, 'exactly one physical deployment');

    const again = await system.deliver({ buildId, mode: 'explicit', provider: providerId, target: { project: 'd78-cafe-001' } });
    assert(again.id === recorded.id, 'subsequent identical request reuses the record');
    assert(again.status === 'recorded', 'recorded reuse');
    assert(provider.deployments.size === 1, 'no second deployment on reuse');
  }],
  ['dry-run re-arms through auto mode with exactly one deployment', async () => {
    const autoRoot = scratchRoot('del78-auto');
    const autoFiles = new Map();
    const autoSystem = createDeliverySystem({
      root: autoRoot,
      engine: { export(site) { return autoFiles.get(site.businessId) || {}; } },
      autoAllowed: true
    });
    const fixture = cleanSite('d78-auto-001', { version: 1 });
    autoFiles.set('d78-auto-001', fixture.files);
    const result = await autoSystem.builds.build('d78-auto-001', { site: fixture.site, validation: fixture.validation, trace: fixture.trace });
    const tree = autoSystem.builds.readTree(result.buildId);
    const qa = autoSystem.qa.run({ buildId: result.buildId, site: fixture.site, validation: fixture.validation, buildRecord: result.record, files: tree });
    autoSystem.packaging.packageBuild({ buildId: result.buildId, buildRecord: result.record, qaReport: qa, tree });

    const provider = new MockProvider({ project: 'd78-auto-001' }, { root: autoRoot });
    autoSystem.registerProvider('auto-mock', provider);

    const dry = await autoSystem.deliver({ buildId: result.buildId, mode: 'dry-run', provider: 'auto-mock' });
    assert(dry.status === 'simulated', `dry-run simulated (${dry.status})`);
    const recorded = await autoSystem.deliver({ buildId: result.buildId, mode: 'auto', provider: 'auto-mock' });
    assert(recorded.id === dry.id, 'same record re-armed in auto');
    assert(recorded.status === 'recorded', `auto re-arm recorded (${recorded.status})`);
    assert(provider.deployments.size === 1, 'exactly one physical deployment');
  }],
  ['idempotent dry-run reuses the simulated record without duplicating it', async () => {
    const { buildId } = await buildFor('d78-med-001', 1);
    const { id: providerId } = mockFor('d78-med-001');
    const a = await system.deliver({ buildId, mode: 'dry-run', provider: providerId });
    const b = await system.deliver({ buildId, mode: 'dry-run', provider: providerId });
    assert(a.id === b.id, 'same record id');
    assert(b.status === 'simulated', 'stays simulated');
    assert(b.createdAt === a.createdAt, 'createdAt preserved');
  }],
  ['malformed buildId is rejected before any record lookup', async () => {
    mockFor('d78-bad-001');
    let threw = false;
    try {
      await system.deliver({ buildId: 'NOT_A_BUILD_ID', mode: 'dry-run', provider: 'd78-bad-001-mock' });
    } catch (err) {
      threw = true;
      // assertBuildId (the integrated implementation's first gate) rejects a
      // malformed syntax as E_DEL_UNKNOWN_BUILD; the stored-record identity
      // checks below reject tampered/inconsistent identities as BAD_BUILD_ID.
      assert(err.code === DEL_CODES.UNKNOWN_BUILD, `code ${err.code}`);
    }
    assert(threw, 'malformed buildId rejected');
  }],
  ['buildId whose stored record checksum is tampered is rejected', async () => {
    const { buildId } = await buildFor('d78-tamper-001', 1);
    mockFor('d78-tamper-001');
    const rec = JSON.parse(fs.readFileSync(buildRecordPath(buildId), 'utf8'));
    rec.engineOutputChecksum = 'f'.repeat(64);
    fs.writeFileSync(buildRecordPath(buildId), JSON.stringify(rec, null, 2));
    let threw = false;
    try {
      await system.deliver({ buildId, mode: 'dry-run', provider: 'd78-tamper-001-mock' });
    } catch (err) {
      threw = true;
      assert(err.code === DEL_CODES.BAD_BUILD_ID, `code ${err.code}`);
    }
    assert(threw, 'inconsistent build record rejected');
  }],
  ['buildId whose record declares a different identity is rejected', async () => {
    const { buildId } = await buildFor('d78-swap-001', 1);
    mockFor('d78-swap-001');
    const rec = JSON.parse(fs.readFileSync(buildRecordPath(buildId), 'utf8'));
    rec.buildId = '1111111111111111';
    fs.writeFileSync(buildRecordPath(buildId), JSON.stringify(rec, null, 2));
    let threw = false;
    try {
      await system.deliver({ buildId, mode: 'dry-run', provider: 'd78-swap-001-mock' });
    } catch (err) {
      threw = true;
      assert(err.code === DEL_CODES.BAD_BUILD_ID, `code ${err.code}`);
    }
    assert(threw, 'mismatched declared identity rejected');
  }],
  ['rearm refreshes provider/target/rollbackOf, re-validates schema, keeps deterministic identity', async () => {
    const { buildId } = await buildFor('d78-rearm-001', 1);
    const { id: p1 } = mockFor('d78-rearm-001');
    const dry = await system.deliver({ buildId, mode: 'dry-run', provider: p1, target: { project: 'd78-rearm-001' } });
    assert(dry.status === 'simulated', `dry-run simulated (${dry.status})`);
    assert(dry.provider === p1, 'simulated record carries its original provider');

    const { id: p2 } = mockFor('d78-rearm-002');
    const rearmed = await system.deliver({
      buildId,
      mode: 'explicit',
      provider: p2,
      target: { project: 'd78-rearm-002', region: 'eu' },
      rollbackOf: 'dep_0000000000000001'
    });
    assert(rearmed.id === dry.id, 'same deterministic record re-armed (identity preserved)');
    assert(rearmed.status === 'awaiting_approval', `re-armed to awaiting_approval (${rearmed.status})`);
    assert(rearmed.provider === p2, 'provider refreshed');
    assert(rearmed.target.project === 'd78-rearm-002' && rearmed.target.region === 'eu', 'target refreshed');
    assert(rearmed.rollbackOf === 'dep_0000000000000001', 'rollbackOf refreshed');

    // The updated record must still satisfy the deployment-record schema.
    const schema = system.validator.validate(rearmed, system.schemas['deployment-record'], { schemaPath: 'delivery:deployment-record' });
    assert(schema.valid, `updated record schema valid (${JSON.stringify(schema.errors)})`);

    // No duplicate record: the store still holds one deterministic record for
    // this buildId, and it is the refreshed (re-armed) record.
    const stored = system.getRecord(dry.id);
    assert(stored.provider === p2 && stored.rollbackOf === 'dep_0000000000000001', 'stored record carries the refreshed fields');
    assert(stored.target.project === 'd78-rearm-002', 'stored target refreshed');

    // Rearm audit evidence is preserved on the promoted record.
    const logDir = path.join(root, 'logs', 'delivery');
    const logFile = fs.readdirSync(logDir).sort().at(-1);
    const lastAudit = JSON.parse(fs.readFileSync(path.join(logDir, logFile), 'utf8').trim().split('\n').at(-1));
    assert(lastAudit.action === 'record_promoted' && lastAudit.rearmed === true, 'rearmed audit evidence recorded');
  }]
];

await runTests('delivery/del78', tests);
