import { assert, runTests } from './helpers.mjs';
import { PolicyGate, AUTONOMY_CONFIG, AUTONOMY_LEVELS, HUMAN_ONLY_KINDS } from '../policy/gate.js';
import { ORC_CODES } from '../errors.js';

const ALL_STEPS = [
  'discover', 'qualify', 'evaluate', 'build-dossier', 'generate-config', 'render-site',
  'run-qa', 'package', 'request-delivery', 'deploy', 'verify', 'persist', 'report'
];

export const policy = {
  'five autonomy levels with names': () => {
    assert(Object.keys(AUTONOMY_LEVELS).length >= 5);
    assert(AUTONOMY_LEVELS.L0 === 'MANUAL');
    assert(AUTONOMY_LEVELS.L5 === 'FULLY_AUTONOMOUS');
    for (const [k, v] of Object.entries(AUTONOMY_LEVELS)) assert(AUTONOMY_CONFIG[k], `${k} must exist in config`);
  },

  'resolve returns frozen copies': () => {
    const gate = new PolicyGate();
    const r1 = gate.resolve('L4');
    assert(r1.level === 'L4');
    assert(r1.name === 'DEPLOYMENT_APPROVAL');
    const r2 = gate.resolve('l4');
    assert(r2.level === 'L4', 'level must normalize to uppercase');
    r1.autoSteps.push('x');
    assert(!gate.resolve('L4').autoSteps.includes('x'), 'resolve must return a copy');
  },

  'unknown level throws': () => {
    const gate = new PolicyGate();
    let threw = null;
    try {
      gate.resolve('L9');
    } catch (err) {
      threw = err;
    }
    assert(threw && threw.code === ORC_CODES.CAMPAIGN_INVALID);
  },

  'L0 requires manual approval for every step': () => {
    const gate = new PolicyGate();
    const r = gate.resolve('L0');
    assert(r.autoSteps.length === 0);
    for (const step of ALL_STEPS) {
      assert(!gate.stepIsAutomatic(step, r), `${step} must not be automatic at L0`);
    }
  },

  'L3 auto-runs the full pipeline in dry-run': () => {
    const gate = new PolicyGate();
    const r = gate.resolve('L3');
    for (const step of ALL_STEPS) {
      assert(gate.stepIsAutomatic(step, r), `${step} must be automatic at L3`);
    }
    assert(gate.deployModeFor('L3') === 'dry-run');
    assert(!gate.canAutoGrant('DEPLOY', r), 'L3 must not auto-grant deployments');
  },

  'L4 is automatic except deployment approval': () => {
    const gate = new PolicyGate();
    const r = gate.resolve('L4');
    for (const step of ALL_STEPS) {
      assert(gate.stepIsAutomatic(step, r), `${step} must be automatic at L4`);
    }
    assert(gate.deployModeFor('L4') === 'explicit');
    assert(r.humanApprovals.includes('DEPLOY'));
    assert(r.humanApprovals.includes('ESCALATE'));
    assert(!gate.canAutoGrant('DEPLOY', r));
  },

  'L5 auto-grants deploy approvals': () => {
    const gate = new PolicyGate();
    const r = gate.resolve('L5');
    for (const step of ALL_STEPS) {
      assert(gate.stepIsAutomatic(step, r), `${step} must be automatic at L5`);
    }
    assert(gate.deployModeFor('L5') === 'auto');
    assert(gate.canAutoGrant('DEPLOY', r), 'L5 must auto-grant DEPLOY');
    assert(!r.humanApprovals.includes('DEPLOY'), 'DEPLOY is not human at L5');
    assert(r.humanApprovals.includes('ESCALATE'));
    assert(r.humanApprovals.includes('SENSITIVE'));
  },

  'human-only kinds are never auto-granted': () => {
    const gate = new PolicyGate();
    for (const level of ['L0', 'L1', 'L2', 'L3', 'L4', 'L5']) {
      const r = gate.resolve(level);
      for (const kind of HUMAN_ONLY_KINDS) {
        assert(!gate.canAutoGrant(kind, r), `${kind} must never auto-grant at ${level}`);
        assert(gate.alwaysHuman(kind));
      }
    }
    assert(HUMAN_ONLY_KINDS.includes('ESCALATE'));
    assert(HUMAN_ONLY_KINDS.includes('SENSITIVE'));
    assert(HUMAN_ONLY_KINDS.includes('POLICY_VIOLATION'));
  },

  'provider whitelist enforced': () => {
    const gate = new PolicyGate();
    const campaign = { deployment: { provider: 'local', allowedProviders: ['local'] } };
    assert(gate.assertProviderAllowed('local', campaign) === undefined);
    let threw = null;
    try {
      gate.assertProviderAllowed('vercel', campaign);
    } catch (err) {
      threw = err;
    }
    assert(threw && threw.code === ORC_CODES.POLICY_FAILURE);
    const open = { deployment: { provider: 'mock', allowedProviders: ['local', 'mock'] } };
    assert(gate.assertProviderAllowed('mock', open) === undefined);
    const none = { deployment: null };
    assert(gate.assertProviderAllowed('local', none) === undefined, 'defaults to local-only');
  },

  'canAutoDeploy requires L5 + autoAllowed + no kill switch': () => {
    const gate = new PolicyGate();
    const c5 = { autonomyLevel: 'L5' };
    assert(gate.canAutoDeploy(c5, { deliveryAutoAllowed: true }) === true);
    assert(gate.canAutoDeploy(c5, { deliveryAutoAllowed: false }) === false);
    assert(gate.canAutoDeploy(c5, { deliveryAutoAllowed: true, killSwitch: true }) === false);
    assert(gate.canAutoDeploy({ autonomyLevel: 'L4' }, { deliveryAutoAllowed: true }) === false);
  }
};

async function main() {
  const ok = await runTests('policy', policy);
  process.exit(ok ? 0 : 1);
}

main();
