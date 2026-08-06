import { polError, POL_CODES } from './errors.js';

function getPath(obj, path) {
  if (obj == null) return undefined;
  return String(path).split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

function compare(actual, op, limit) {
  if (actual == null) return false;
  switch (op) {
    case 'gte': return actual >= limit;
    case 'lte': return actual <= limit;
    case 'gt': return actual > limit;
    case 'lt': return actual < limit;
    case 'eq': return actual === limit;
    default: throw polError(POL_CODES.INVALID_POLICY, `unsupported operator "${op}"`);
  }
}

export class PolicyEngine {
  constructor({ policies = null, overrides = null } = {}) {
    const base = policies && Array.isArray(policies) ? policies : null;
    this.config = {
      version: 1,
      policies: base || []
    };
    if (!base && !overrides) {
      throw polError(POL_CODES.INVALID_POLICY, 'policy engine requires a policy set (defaults.json or explicit array)');
    }
    if (overrides && Array.isArray(overrides)) {
      this.applyOverrides(overrides);
    }
  }

  static fromJson(policiesJson) {
    const parsed = typeof policiesJson === 'string' ? JSON.parse(policiesJson) : policiesJson;
    if (!parsed || !Array.isArray(parsed.policies)) throw polError(POL_CODES.INVALID_POLICY, 'policy config must be { policies: [...] }');
    const engine = new PolicyEngine({ policies: parsed.policies });
    engine.config.description = parsed.description;
    engine.config.version = parsed.version || 1;
    return engine;
  }

  applyOverrides(overrides) {
    for (const o of overrides) {
      const idx = this.config.policies.findIndex((p) => p.id === o.id);
      if (idx < 0) throw polError(POL_CODES.UNKNOWN_POLICY, `cannot override unknown policy "${o.id}"`);
      this.config.policies[idx] = { ...this.config.policies[idx], ...o };
    }
    return this;
  }

  get(id) {
    const p = this.config.policies.find((x) => x.id === id);
    if (!p) throw polError(POL_CODES.UNKNOWN_POLICY, `unknown policy "${id}"`);
    return p;
  }

  list() {
    return this.config.policies.map((p) => ({ id: p.id, label: p.label, kind: p.kind, mandatory: p.mandatory, value: p.value }));
  }

  evaluate(ctx) {
    const results = [];
    for (const p of this.config.policies) {
      let passed;
      let actual = null;
      let note = null;
      if (p.kind === 'threshold') {
        actual = getPath(ctx, p.field);
        passed = actual != null && compare(actual, p.op, p.value);
        if (actual == null) {
          passed = !p.mandatory;
          note = 'no data for field; skipped (non-mandatory)';
        }
      } else if (p.kind === 'ignore') {
        actual = getPath(ctx, p.flag);
        passed = actual === p.expect;
      } else {
        throw polError(POL_CODES.INVALID_POLICY, `unsupported policy kind "${p.kind}" for "${p.id}"`);
      }
      const reason = passed ? null : (note || p.reason || `policy "${p.id}" not satisfied`);
      results.push({
        id: p.id,
        label: p.label,
        kind: p.kind,
        mandatory: p.mandatory,
        passed,
        actual,
        limit: p.value,
        reason,
        template: p.reason
      });
    }
    const failed = results.filter((r) => !r.passed);
    const mandatoryFailed = failed.filter((r) => r.mandatory);
    return {
      verdict: mandatoryFailed.length === 0 ? 'pass' : 'fail',
      passed: results.filter((r) => r.passed).length,
      failed: failed.length,
      mandatoryFailed: mandatoryFailed.length,
      results
    };
  }

  summarize(evaluation) {
    const reasons = evaluation.results.filter((r) => !r.passed).map((r) => `${r.id}: ${r.reason}`);
    return {
      verdict: evaluation.verdict,
      summary: reasons.length ? `blocked by ${reasons.length} polic${reasons.length === 1 ? 'y' : 'ies'}: ${reasons.join('; ')}` : 'all policies satisfied',
      reasons
    };
  }
}

export function createPolicyEngine(opts) {
  return new PolicyEngine(opts);
}
