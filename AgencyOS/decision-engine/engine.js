import { RuleRegistry } from '../rules/index.js';
import { hashString, stableStringify, shortHash } from '../runtime/utils.js';
import { decError, DEC_CODES } from './errors.js';
import { computeEstimates, computeConfidence, computeRisk, computePriorities } from './estimates.js';
import { ALL_DECISION_RULES } from './rules/index.js';

export const VERDICTS = ['APPROVE', 'REJECT', 'ESCALATE', 'PARK'];

// 4.7.1: content-addressed version identity for a policy/strategy document
// set. The version is the sha256 of the canonical (stable-stringified)
// { version, policies|strategies } subset — extra document fields never
// influence it, so every caller of the same applied set derives the same id
// and decisions stamped with it are byte-stable experiment inputs. Pure
// function; no state, no storage.
export function materializeVersion(set) {
  if (!set || typeof set !== 'object') {
    throw decError(DEC_CODES.INVALID_CONTEXT, 'materializeVersion requires { version, policies|strategies }', {});
  }
  const hasStrategies = Array.isArray(set.strategies) && !Array.isArray(set.policies);
  const canonical = hasStrategies
    ? { version: Number(set.version) || 1, strategies: set.strategies }
    : { version: Number(set.version) || 1, policies: Array.isArray(set.policies) ? set.policies : [] };
  const sha256 = hashString(stableStringify(canonical));
  const count = hasStrategies ? canonical.strategies.length : canonical.policies.length;
  return { id: `ver-${sha256.slice(0, 16)}`, sha256, count };
}

export class DecisionEngine {
  constructor({ rules = null, validator = null, schema = null } = {}) {
    this.registry = new RuleRegistry({ rules: rules || ALL_DECISION_RULES });
    this.validator = validator || null;
    this.schema = schema || null;
  }

  materializeVersion(set) {
    return materializeVersion(set);
  }

  estimate(ctx) {
    return computeEstimates(ctx);
  }

  confidence(ctx) {
    return computeConfidence(ctx);
  }

  risk(ctx, confidence) {
    return computeRisk(ctx, confidence);
  }

  priorities(ctx, estimates) {
    return computePriorities(ctx, estimates);
  }

  evaluate(ctx, { policies = null } = {}) {
    if (!ctx || typeof ctx !== 'object' || !ctx.businessId) {
      throw decError(DEC_CODES.INVALID_CONTEXT, 'decision requires a context with businessId');
    }
    const estimates = this.estimate(ctx);
    const confidence = this.confidence(ctx);
    const risk = this.risk(ctx, confidence);
    const augmented = { ...ctx, estimates, confidence, risk };
    const policySummary = policies ? (typeof policies === 'object' && policies.summary ? policies.summary : null) : null;
    if (policies && !policySummary) {
      const full = typeof policies.evaluate === 'function' ? policies.evaluate(ctx) : null;
      if (full) augmented.policySummary = full.verdict === 'pass' ? { verdict: 'pass', mandatoryFailed: 0, summary: 'all policies satisfied', reasons: [] } : { verdict: 'fail', mandatoryFailed: full.mandatoryFailed || 0, summary: `${full.failed} policies failed`, reasons: (full.results || []).filter((r) => !r.passed).map((r) => r.reason) };
    } else if (policySummary) {
      augmented.policySummary = policySummary;
    }
    const ruleResults = this.registry.run(augmented);
    const matchedRules = ruleResults.filter((r) => r.matched);
    const qualification = ruleResults.filter((r) => r.category === 'qualification');
    const noData = matchedRules.some((r) => r.ruleId === 'no-data');
    const policyBlocked = matchedRules.some((r) => r.ruleId === 'policy-blocked');
    const riskHigh = matchedRules.some((r) => r.ruleId === 'risk-high');

    let verdict = 'APPROVE';
    if (policyBlocked) verdict = 'REJECT';
    else if (noData) verdict = 'PARK';
    else if (riskHigh) verdict = 'ESCALATE';

    const priorities = this.priorities(ctx, estimates);
    return {
      version: 1,
      decisionId: `dec-${shortHash(ctx.businessId, 10)}`,
      businessId: ctx.businessId,
      verdict,
      risk,
      confidence,
      estimates,
      priority: priorities,
      qualificationScore: Math.round(qualification.reduce((a, r) => a + r.score * r.weight, 0) * 100) / 100,
      ruleResults,
      policySummary: augmented.policySummary || null,
      createdAt: new Date().toISOString()
    };
  }

  validate(decision) {
    if (!this.validator || !this.schema) return { valid: true, errors: [] };
    return this.validator.validate(decision, this.schema, { schemaPath: 'brain:decision' });
  }
}

export function createDecisionEngine(opts) {
  return new DecisionEngine(opts);
}
