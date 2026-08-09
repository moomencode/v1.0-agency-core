import { createDeliverySystem } from '../index.js';
import { MockProvider } from '../providers/mock.js';
import { DEL_CODES } from '../errors.js';
import { cleanSite, scratchRoot, assert, runTests } from './helpers.mjs';

const root = scratchRoot('accounting');
const filesByBusiness = new Map();

const fakeEngine = {
  export(site, { format = 'static' } = {}) {
    if (format !== 'static') throw new Error('static only');
    return filesByBusiness.get(site.businessId) || {};
  }
};

const system = createDeliverySystem({
  root,
  engine: fakeEngine,
  autoAllowed: true,
  retryConfig: { maxAttempts: 3, initialDelayMs: 10 }
});

async function packageFor(businessId, version = 1) {
  const fixture = cleanSite(businessId, { version });
  filesByBusiness.set(businessId, fixture.files);
  const result = await system.builds.build(businessId, { site: fixture.site, validation: fixture.validation, trace: fixture.trace });
  const tree = system.builds.readTree(result.buildId);
  const qa = system.qa.run({ buildId: result.buildId, site: fixture.site, validation: fixture.validation, buildRecord: result.record, files: tree });
  system.packaging.packageBuild({ buildId: result.buildId, buildRecord: result.record, qaReport: qa, tree });
  return { ...result, qa, tree };
}

const tests = [
  ['first-attempt success records exactly one provider call', async () => {
    const { buildId } = await packageFor('acc-success-001');
    const provider = new MockProvider({ project: 'acc-success-001' }, { root });
    system.registerProvider('acc-success-provider', provider);
    let calls = 0;
    const record = await system.deliver({
      buildId,
      mode: 'auto',
      provider: 'acc-success-provider',
      target: { project: 'acc-success-001' },
      onProviderAttempt: () => {
        calls++;
        return true;
      }
    });
    assert(record.status === 'recorded', `recorded (${record.status})`);
    assert(calls === 1, `exactly 1 provider call, got ${calls}`);
    assert(provider.deployments.size === 1, 'one deployment made');
  }],
  ['success after retry records every attempt', async () => {
    const { buildId } = await packageFor('acc-retry-001');
    const provider = new MockProvider({ project: 'acc-retry-001' }, { root });
    provider.queueFailure({ op: 'deploy', status: 500, retryable: true });
    system.registerProvider('acc-retry-provider', provider);
    let calls = 0;
    const record = await system.deliver({
      buildId,
      mode: 'auto',
      provider: 'acc-retry-provider',
      target: { project: 'acc-retry-001' },
      onProviderAttempt: () => {
        calls++;
        return true;
      }
    });
    assert(record.status === 'recorded', `succeeded after retry (${record.status})`);
    assert(calls === 2, `initial + 1 retry = 2 attempts, got ${calls}`);
    assert(provider.deployments.size === 1, 'one deployment made');
  }],
  ['exhausted retries record every attempt and fail the record', async () => {
    const { buildId } = await packageFor('acc-exhaust-001');
    const provider = new MockProvider({ project: 'acc-exhaust-001' }, { root });
    provider.queueFailure({ op: 'deploy', status: 500, retryable: true });
    provider.queueFailure({ op: 'deploy', status: 500, retryable: true });
    provider.queueFailure({ op: 'deploy', status: 500, retryable: true });
    system.registerProvider('acc-exhaust-provider', provider);
    let calls = 0;
    let threw = false;
    try {
      await system.deliver({
        buildId,
        mode: 'auto',
        provider: 'acc-exhaust-provider',
        target: { project: 'acc-exhaust-001' },
        onProviderAttempt: () => {
          calls++;
          return true;
        }
      });
    } catch {
      threw = true;
    }
    assert(threw, 'exhausted retries surface the error');
    assert(calls === 3, `all 3 attempts recorded, got ${calls}`);
    const record = system.getRecord(`dep_${buildId}`);
    assert(record.status === 'failed', `record failed (${record.status})`);
  }],
  ['auth failure records exactly one attempt with no fake retries', async () => {
    const { buildId } = await packageFor('acc-auth-001');
    const provider = new MockProvider({ project: 'acc-auth-001' }, { root });
    provider.queueFailure({ op: 'deploy', status: 401, retryable: false, code: 'E_DEL_AUTH_FAILED' });
    system.registerProvider('acc-auth-provider', provider);
    let calls = 0;
    let threw = false;
    try {
      await system.deliver({
        buildId,
        mode: 'auto',
        provider: 'acc-auth-provider',
        target: { project: 'acc-auth-001' },
        onProviderAttempt: () => {
          calls++;
          return true;
        }
      });
    } catch (err) {
      threw = true;
      assert(err.code === DEL_CODES.AUTH_FAILED, `auth code (${err.code})`);
    }
    assert(threw, 'auth failure surfaced');
    assert(calls === 1, `exactly 1 attempt, got ${calls}`);
  }],
  ['budget guard refusal stops the deployment before provider contact', async () => {
    const { buildId } = await packageFor('acc-guard-001');
    const provider = new MockProvider({ project: 'acc-guard-001' }, { root });
    system.registerProvider('acc-guard-provider', provider);
    let calls = 0;
    let threw = false;
    try {
      await system.deliver({
        buildId,
        mode: 'auto',
        provider: 'acc-guard-provider',
        target: { project: 'acc-guard-001' },
        onProviderAttempt: () => {
          calls++;
          return false;
        }
      });
    } catch (err) {
      threw = true;
      assert(err.code === DEL_CODES.PROVIDER_BUDGET, `budget refusal code (${err.code})`);
    }
    assert(threw, 'guard refusal surfaced');
    assert(calls === 1, 'guard invoked exactly once');
    assert(provider.deployments.size === 0, 'provider never contacted');
  }],
  ['dry-run records zero provider calls', async () => {
    const { buildId } = await packageFor('acc-dryrun-001');
    let calls = 0;
    const record = await system.deliver({ buildId, mode: 'dry-run', provider: 'mock', onProviderAttempt: () => { calls++; return true; } });
    assert(record.status === 'simulated', 'simulated');
    assert(calls === 0, 'zero provider calls on dry-run');
  }]
];

await runTests('delivery/accounting', tests);
