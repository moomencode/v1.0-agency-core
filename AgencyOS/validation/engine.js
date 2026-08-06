import { BUILTIN_RULES } from './rules.js';
import { valError, VAL_CODES } from './errors.js';
import { buildReport } from './report.js';

export class ValidationEngine {
  constructor({ validator = null, root = '.' } = {}) {
    this.validator = validator;
    this.root = root;
    this.ruleSets = new Map();
    this.stats = { validations: 0, failures: 0, byKind: {} };
    for (const rule of BUILTIN_RULES) {
      for (const kind of rule.kinds) this.registerRule(rule, kind);
    }
  }

  registerRule(rule, kind = null) {
    const kinds = kind ? [kind] : rule.kinds || [];
    for (const k of kinds) {
      if (!this.ruleSets.has(k)) this.ruleSets.set(k, []);
      this.ruleSets.get(k).push(rule);
    }
  }

  kinds() {
    return [...this.ruleSets.keys()].sort();
  }

  run(kind, payload, options = {}) {
    const rules = this.ruleSets.get(kind);
    if (!rules) throw valError(VAL_CODES.UNKNOWN_KIND, `unknown validation kind "${kind}"`, { kind });
    const startedAt = new Date();
    const t0 = process.hrtime.bigint();
    const findings = [];
    const checks = [];
    const ctx = { kind, payload, options, parsed: undefined, findings, engine: this };
    const sorted = [...rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    for (const rule of sorted) {
      const before = findings.length;
      rule.check(ctx, findings);
      checks.push({ id: rule.id, label: rule.label, passed: findings.length === before, findings: findings.length - before });
    }
    const durationMs = Number(process.hrtime.bigint() - t0) / 1e6;
    this.stats.validations++;
    const hasErrors = findings.some((f) => f.severity === 'error');
    if (hasErrors) this.stats.failures++;
    this.stats.byKind[kind] = (this.stats.byKind[kind] || 0) + 1;
    const report = buildReport({ kind, target: options.target ?? kind, findings, checks, durationMs, startedAt: startedAt.toISOString() });
    report.value = ctx.parsed ?? payload;
    return report;
  }
}

export function createValidationEngine(opts) {
  return new ValidationEngine(opts);
}
