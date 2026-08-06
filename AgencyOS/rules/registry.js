import { rulError, RUL_CODES } from './errors.js';

export function defineRule({ id, category, label, weight = 1, evaluate, scope = null }) {
  if (!id || typeof id !== 'string') throw rulError(RUL_CODES.INVALID_RULE, 'rule id is required');
  if (!category || typeof category !== 'string') throw rulError(RUL_CODES.INVALID_RULE, `rule "${id}" needs a category`);
  if (typeof evaluate !== 'function') throw rulError(RUL_CODES.INVALID_RULE, `rule "${id}" needs evaluate(ctx)`);
  return { id, category, label: label || id, weight: Number(weight) || 1, scope, evaluate };
}

export class RuleRegistry {
  constructor({ rules = [] } = {}) {
    this.defs = new Map();
    for (const rule of rules) this.register(rule);
  }

  register(rule) {
    const def = typeof rule === 'function' || rule && rule.evaluate ? rule : defineRule(rule);
    this.defs.set(def.id, def);
    return def;
  }

  unregister(id) {
    return this.defs.delete(id);
  }

  get(id) {
    if (!this.defs.has(id)) throw rulError(RUL_CODES.UNKNOWN_RULE, `unknown rule "${id}"`);
    return this.defs.get(id);
  }

  has(id) {
    return this.defs.has(id);
  }

  list({ category = null, scope = null } = {}) {
    let out = [...this.defs.values()];
    if (category) out = out.filter((r) => r.category === category);
    if (scope) out = out.filter((r) => !r.scope || r.scope === scope);
    return out;
  }

  categories() {
    return [...new Set([...this.defs.values()].map((r) => r.category))];
  }

  run(ctx, { category = null, scope = null } = {}) {
    const results = [];
    for (const rule of this.list({ category, scope })) {
      let out;
      try {
        out = rule.evaluate(ctx);
      } catch (e) {
        throw rulError(RUL_CODES.EVAL_FAILED, `rule "${rule.id}" failed: ${e.message}`, { ruleId: rule.id });
      }
      const matched = !!out && out.matched !== false;
      const score = out && typeof out.score === 'number' ? out.score : (matched ? 1 : 0);
      results.push({
        ruleId: rule.id,
        category: rule.category,
        label: rule.label,
        weight: rule.weight,
        matched,
        score: Number(score.toFixed(4)),
        reason: (out && out.reason) || (matched ? rule.label : ''),
        details: (out && out.details) || null
      });
    }
    return results;
  }
}
