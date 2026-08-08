import { orcError, ORC_CODES } from '../errors.js';
import { APPROVAL_KINDS } from '../approval/store.js';

export const AUTONOMY_LEVELS = {
  L0: 'MANUAL',
  L1: 'DISCOVERY',
  L2: 'QUALIFICATION',
  L3: 'GENERATION',
  L4: 'DEPLOYMENT_APPROVAL',
  L5: 'FULLY_AUTONOMOUS'
};

export const AUTONOMY_CONFIG = {
  L0: {
    name: 'MANUAL',
    autoSteps: [],
    humanApprovals: ['MANUAL_STEP', 'ESCALATE', 'DEPLOY', 'QA_OVERRIDE', 'SENSITIVE', 'POLICY_VIOLATION'],
    autoGrant: []
  },
  L1: {
    name: 'DISCOVERY',
    autoSteps: ['discover', 'qualify'],
    humanApprovals: ['MANUAL_STEP', 'ESCALATE', 'DEPLOY', 'QA_OVERRIDE', 'SENSITIVE', 'POLICY_VIOLATION'],
    autoGrant: []
  },
  L2: {
    name: 'QUALIFICATION',
    autoSteps: ['discover', 'qualify', 'evaluate', 'build-dossier'],
    humanApprovals: ['MANUAL_STEP', 'ESCALATE', 'DEPLOY', 'QA_OVERRIDE', 'SENSITIVE', 'POLICY_VIOLATION'],
    autoGrant: []
  },
  L3: {
    name: 'GENERATION',
    autoSteps: ['discover', 'qualify', 'evaluate', 'build-dossier', 'generate-config', 'render-site', 'run-qa', 'package', 'request-delivery', 'deploy', 'verify', 'persist', 'report'],
    humanApprovals: ['ESCALATE', 'DEPLOY', 'QA_OVERRIDE', 'SENSITIVE', 'POLICY_VIOLATION'],
    autoGrant: []
  },
  L4: {
    name: 'DEPLOYMENT_APPROVAL',
    autoSteps: ['discover', 'qualify', 'evaluate', 'build-dossier', 'generate-config', 'render-site', 'run-qa', 'package', 'request-delivery', 'deploy', 'verify', 'persist', 'report'],
    humanApprovals: ['ESCALATE', 'DEPLOY', 'QA_OVERRIDE', 'SENSITIVE', 'POLICY_VIOLATION'],
    autoGrant: []
  },
  L5: {
    name: 'FULLY_AUTONOMOUS',
    autoSteps: ['discover', 'qualify', 'evaluate', 'build-dossier', 'generate-config', 'render-site', 'run-qa', 'package', 'request-delivery', 'deploy', 'verify', 'persist', 'report'],
    humanApprovals: ['ESCALATE', 'QA_OVERRIDE', 'SENSITIVE', 'POLICY_VIOLATION'],
    autoGrant: ['DEPLOY']
  }
};

export const HUMAN_ONLY_KINDS = ['ESCALATE', 'QA_OVERRIDE', 'SENSITIVE', 'POLICY_VIOLATION', 'MANUAL_STEP'];

export class PolicyGate {
  constructor({ config = AUTONOMY_CONFIG } = {}) {
    this.config = config;
  }

  resolve(level) {
    const key = String(level || 'L4').toUpperCase();
    const def = this.config[key];
    if (!def) {
      throw orcError(ORC_CODES.CAMPAIGN_INVALID, `unknown autonomy level "${key}"`, {
        level,
        known: Object.keys(this.config),
        retryable: false
      });
    }
    return {
      level: key,
      name: def.name,
      autoSteps: [...def.autoSteps],
      humanApprovals: [...def.humanApprovals],
      autoGrant: [...def.autoGrant]
    };
  }

  stepIsAutomatic(stepId, resolution) {
    return resolution.autoSteps.includes(stepId);
  }

  approvalRequiredFor(stepId, kind, resolution) {
    if (!resolution.autoSteps.includes(stepId)) {
      return kind === 'MANUAL_STEP' || kind === 'SENSITIVE';
    }
    return resolution.humanApprovals.includes(kind);
  }

  canAutoGrant(kind, resolution) {
    return resolution.autoGrant.includes(kind);
  }

  alwaysHuman(kind) {
    return HUMAN_ONLY_KINDS.includes(kind);
  }

  deployModeFor(level) {
    if (level === 'L5') return 'auto';
    if (level === 'L4') return 'explicit';
    return 'dry-run';
  }

  assertProviderAllowed(provider, campaign) {
    const allowed = (campaign.deployment && campaign.deployment.allowedProviders) || ['local'];
    if (!allowed.includes(provider)) {
      throw orcError(ORC_CODES.POLICY_FAILURE, `provider "${provider}" is not in the campaign whitelist`, {
        provider,
        allowed,
        retryable: false
      });
    }
  }

  canAutoDeploy(campaign, { deliveryAutoAllowed = false, killSwitch = false } = {}) {
    if (killSwitch) return false;
    const level = campaign.autonomyLevel;
    if (level !== 'L5') return false;
    if (!deliveryAutoAllowed) return false;
    return true;
  }
}

export function createPolicyGate(opts = {}) {
  return new PolicyGate(opts);
}
