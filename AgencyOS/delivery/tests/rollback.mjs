import fs from 'node:fs';
import path from 'node:path';
import { createDeliverySystem } from '../index.js';
import { MockProvider } from '../providers/mock.js';
import { cleanSite, scratchRoot, assert, runTests } from './helpers.mjs';

const root = scratchRoot('rollback');
const filesByBusiness = new Map();
const fakeEngine = {
  export(site) {
    return filesByBusiness.get(site.businessId) || {};
  }
};
const system = createDeliverySystem({ root, engine: fakeEngine });

async function buildAndQa(businessId, version) {
  const fixture = cleanSite(businessId, { version, runId: `run-${businessId}-v${version}` });
  filesByBusiness.set(businessId, fixture.files);
  const result = await system.builds.build(businessId, { site: fixture.site, validation: fixture.validation, trace: fixture.trace });
  const tree = system.builds.readTree(result.buildId);
  const qa = system.qa.run({ buildId: result.buildId, site: fixture.site, validation: fixture.validation, buildRecord: result.record, files: tree });
  system.packaging.packageBuild({ buildId: result.buildId, buildRecord: result.record, qaReport: qa, tree });
  return { buildId: result.buildId, fixture };
}

async function deployRecorded(businessId, version) {
  const { buildId } = await buildAndQa(businessId, version);
  const record = await system.deliver({ buildId, mode: 'explicit', provider: 'local', target: { project: `local-${businessId}` } });
  assert(record.status === 'awaiting_approval', 'explicit requires approval');
  return system.approve(record.id, { by: 'tester' });
}

const tests = [
  ['explicit approval gates real deployment', async () => {
    const { buildId } = await buildAndQa('rb-cafe-001', 1);
    const record = await system.deliver({ buildId, mode: 'explicit', provider: 'local', target: { project: 'local-rb-cafe-001' } });
    assert(record.status === 'awaiting_approval', 'awaiting approval');
    let threw = false;
    try {
      await system.deploy(record.id);
    } catch (err) {
      threw = true;
      assert(err.code === 'E_DEL_APPROVAL_REQUIRED', `code ${err.code}`);
    }
    assert(threw, 'deploy blocked before approval');
    const approved = await system.approve(record.id, { by: 'operator-1' });
    assert(approved.status === 'recorded', `recorded, got ${approved.status}`);
    assert(approved.approvals.some((a) => a.approved && a.by === 'operator-1'), 'approval recorded');
  }],
  ['rejection terminates the record without deploying', async () => {
    const { buildId } = await buildAndQa('rb-rest-001', 1);
    const record = await system.deliver({ buildId, mode: 'explicit', provider: 'local', target: { project: 'local-rb-rest-001' } });
    const rejected = await system.reject(record.id, { by: 'operator-2' });
    assert(rejected.status === 'rejected', 'rejected');
    const current = fs.existsSync(path.join(root, 'storage', 'delivery', 'local', 'local-rb-rest-001', 'current.json'));
    assert(!current, 'nothing deployed');
  }],
  ['rollback promotes previous package and re-points the alias', async () => {
    const v1 = await deployRecorded('rb-med-001', 1);
    const v2 = await deployRecorded('rb-med-001', 2);
    assert(v1.id !== v2.id, 'distinct records');
    const currentBefore = JSON.parse(fs.readFileSync(path.join(root, 'storage', 'delivery', 'local', 'local-rb-med-001', 'current.json'), 'utf8'));
    assert(currentBefore.deploymentId === `local-${v2.trace.buildId}`, 'v2 live');
    assert(v2.rollbackOf === null, 'no rollback link yet');

    system.approveRollback(v2.id, { by: 'operator-3' });
    const { original, previous } = await system.rollback({ recordId: v2.id, by: 'operator-3', mode: 'explicit' });
    assert(original.status === 'rolled_back', `rolled_back, got ${original.status}`);
    assert(previous.id === v1.id, 'previous = v1');
    assert(original.rollback.buildId === v1.trace.buildId, 'rollback build recorded');
    const currentAfter = JSON.parse(fs.readFileSync(path.join(root, 'storage', 'delivery', 'local', 'local-rb-med-001', 'current.json'), 'utf8'));
    assert(currentAfter.deploymentId === `local-${v1.trace.buildId}`, 'alias back on v1');
    assert(system.getRecord(v1.id).status === 'recorded', 'v1 record untouched');
  }],
  ['rollback requires explicit approval in explicit mode', async () => {
    await deployRecorded('rb-dent-001', 1);
    const v2 = await deployRecorded('rb-dent-001', 2);
    let threw = false;
    try {
      await system.rollback({ recordId: v2.id, by: 'operator-4', mode: 'explicit' });
    } catch (err) {
      threw = true;
      assert(err.code === 'E_DEL_APPROVAL_REQUIRED', `code ${err.code}`);
    }
    assert(threw, 'approval required');
    system.approveRollback(v2.id, { by: 'operator-4' });
    const { original } = await system.rollback({ recordId: v2.id, by: 'operator-4', mode: 'explicit' });
    assert(original.status === 'rolled_back', 'approved rollback succeeds');
  }],
  ['rollback dry-run touches no provider state', async () => {
    await deployRecorded('rb-lawn-001', 1);
    const v2 = await deployRecorded('rb-lawn-001', 2);
    const before = fs.readFileSync(path.join(root, 'storage', 'delivery', 'local', 'local-rb-lawn-001', 'current.json'), 'utf8');
    const { original } = await system.rollback({ recordId: v2.id, by: 'operator-5', mode: 'dry-run' });
    assert(original.status === 'rolled_back', 'dry-run rollback recorded');
    assert(original.dryRun && original.dryRun.simulated === true, 'simulated plan');
    const after = fs.readFileSync(path.join(root, 'storage', 'delivery', 'local', 'local-rb-lawn-001', 'current.json'), 'utf8');
    assert(before === after, 'alias untouched by dry-run');
  }],
  ['revert re-promotes the original deployment', async () => {
    const v1 = await deployRecorded('rb-phar-001', 1);
    const v2 = await deployRecorded('rb-phar-001', 2);
    await system.rollback({ recordId: v2.id, by: 'operator-6', mode: 'dry-run' });
    system.approveRollback(v2.id, { by: 'operator-6' });
    const reverted = await system.revert({ recordId: v2.id, by: 'operator-6', mode: 'explicit' });
    assert(reverted.status === 'reverted', `reverted, got ${reverted.status}`);
    const current = JSON.parse(fs.readFileSync(path.join(root, 'storage', 'delivery', 'local', 'local-rb-phar-001', 'current.json'), 'utf8'));
    assert(current.deploymentId === `local-${v2.trace.buildId}`, 'v2 live again');
    assert(system.getRecord(v1.id).status === 'recorded', 'v1 untouched');
  }],
  ['revert on non-rolled_back record is rejected', async () => {
    const v1 = await deployRecorded('rb-pet-001', 1);
    let threw = false;
    try {
      await system.revert({ recordId: v1.id, by: 'operator-7' });
    } catch (err) {
      threw = true;
      assert(err.code === 'E_DEL_ROLLBACK_INVALID', `code ${err.code}`);
    }
    assert(threw, 'invalid revert rejected');
  }],
  ['rollback of a failed record is rejected', async () => {
    const { buildId } = await buildAndQa('rb-gym-001', 1);
    const record = await system.deliver({ buildId, mode: 'dry-run' });
    let threw = false;
    try {
      await system.rollback({ recordId: record.id, by: 'operator-8' });
    } catch (err) {
      threw = true;
      assert(err.code === 'E_DEL_ROLLBACK_INVALID', `code ${err.code}`);
    }
    assert(threw, 'simulated records not rollbackable');
  }],
  ['auto mode stays disabled unless explicitly allowed', async () => {
    const { buildId } = await buildAndQa('rb-auto-001', 1);
    let threw = false;
    try {
      await system.deliver({ buildId, mode: 'auto', provider: 'local' });
    } catch (err) {
      threw = true;
      assert(err.code === 'E_DEL_AUTO_DISABLED', `code ${err.code}`);
    }
    assert(threw, 'auto disabled by default');
  }],
  ['rollback retries transient promote failures and succeeds', async () => {
    const businessId = 'rb-retry-trans-001';
    const provider = new MockProvider({ project: businessId }, { root });
    system.registerProvider(`${businessId}-mock`, provider);
    const v1 = await buildAndQa(businessId, 1);
    const first = await system.deliver({ buildId: v1.buildId, mode: 'explicit', provider: `${businessId}-mock` });
    await system.approve(first.id, { by: 'operator-t1' });
    const v2 = await buildAndQa(businessId, 2);
    const second = await system.deliver({ buildId: v2.buildId, mode: 'explicit', provider: `${businessId}-mock` });
    await system.approve(second.id, { by: 'operator-t1' });

    provider.queueFailure({ op: 'promote', status: 500, retryable: true });
    system.approveRollback(second.id, { by: 'operator-t1' });
    const { original } = await system.rollback({ recordId: second.id, by: 'operator-t1', mode: 'explicit' });
    assert(original.status === 'rolled_back', `rolled_back after retry (${original.status})`);
    assert(original.rollback && original.rollback.buildId === v1.buildId, 'rolled back to v1');
    assert(original.timeline.some((t) => t.event === 'RETRY' && t.from === 'rollback_requested'), 'retry recorded on rollback lane');
    assert(provider.alias === `mock-${v1.buildId}`, 'alias re-pointed to v1');
  }],
  ['revert retries transient promote failures and stays legal', async () => {
    const businessId = 'rb-retry-rev-001';
    const provider = new MockProvider({ project: businessId }, { root });
    system.registerProvider(`${businessId}-mock`, provider);
    const v1 = await buildAndQa(businessId, 1);
    const first = await system.deliver({ buildId: v1.buildId, mode: 'explicit', provider: `${businessId}-mock` });
    await system.approve(first.id, { by: 'operator-t2' });
    const v2 = await buildAndQa(businessId, 2);
    const second = await system.deliver({ buildId: v2.buildId, mode: 'explicit', provider: `${businessId}-mock` });
    await system.approve(second.id, { by: 'operator-t2' });
    system.approveRollback(second.id, { by: 'operator-t2' });
    await system.rollback({ recordId: second.id, by: 'operator-t2', mode: 'explicit' });

    provider.queueFailure({ op: 'promote', status: 502, retryable: true });
    system.approveRollback(second.id, { by: 'operator-t2' });
    const reverted = await system.revert({ recordId: second.id, by: 'operator-t2', mode: 'explicit' });
    assert(reverted.status === 'reverted', `reverted after retry (${reverted.status})`);
    assert(reverted.timeline.some((t) => t.event === 'RETRY' && t.from === 'reverting'), 'retry recorded on revert lane');
  }],
  ['auth failure during rollback promote is terminal and never retried', async () => {
    const businessId = 'rb-retry-auth-001';
    const provider = new MockProvider({ project: businessId }, { root });
    system.registerProvider(`${businessId}-mock`, provider);
    const v1 = await buildAndQa(businessId, 1);
    const first = await system.deliver({ buildId: v1.buildId, mode: 'explicit', provider: `${businessId}-mock` });
    await system.approve(first.id, { by: 'operator-t3' });
    const v2 = await buildAndQa(businessId, 2);
    const second = await system.deliver({ buildId: v2.buildId, mode: 'explicit', provider: `${businessId}-mock` });
    await system.approve(second.id, { by: 'operator-t3' });

    provider.queueFailure({ op: 'promote', status: 401, retryable: false, code: 'E_DEL_AUTH_FAILED' });
    system.approveRollback(second.id, { by: 'operator-t3' });
    let threw = false;
    try {
      await system.rollback({ recordId: second.id, by: 'operator-t3', mode: 'explicit' });
    } catch (err) {
      threw = true;
      assert(err.code === 'E_DEL_AUTH_FAILED', `code ${err.code}`);
    }
    assert(threw, 'auth error surfaced');
    const failed = system.getRecord(second.id);
    assert(failed.status === 'failed', `record terminal failed (${failed.status})`);
    assert(!failed.timeline.some((t) => t.event === 'RETRY'), 'no retry attempts');
    assert(failed.timeline.some((t) => t.event === 'ABORT'), 'aborted to failed');
  }]
];

await runTests('delivery/rollback', tests);
