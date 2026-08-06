import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { plrError, PLR_CODES } from './errors.js';
import { ExecutionPlanRunner } from '../execution-plans/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_CATALOG = JSON.parse(readFileSync(join(__dirname, 'plans', 'catalog.json'), 'utf8'));
const DEFAULT_PLAN = JSON.parse(readFileSync(join(__dirname, '..', 'execution-plans', 'plans', 'default.json'), 'utf8'));

export class PlannerEngine {
  constructor({ catalog = null, plans = null } = {}) {
    this.catalog = { ...DEFAULT_CATALOG, ...(catalog || {}), hints: { ...DEFAULT_CATALOG.hints, ...((catalog || {}).hints || {}) } };
    this.plans = { ...(plans || {}), default: (plans && plans.default) || DEFAULT_PLAN };
    this.runner = new ExecutionPlanRunner();
  }

  resolve(hint) {
    if (!hint || typeof hint !== 'string') return this.catalog.defaultPlan;
    return this.catalog.hints[hint] || this.catalog.defaultPlan;
  }

  planFor(planId) {
    const plan = this.plans[planId];
    if (!plan) throw plrError(PLR_CODES.UNKNOWN_PLAN, `unknown plan "${planId}"`);
    return this.runner.loadPlan(plan);
  }

  pick(strategy, { planId = null } = {}) {
    if (!strategy || typeof strategy !== 'object') throw plrError(PLR_CODES.UNKNOWN_STRATEGY, 'strategy selection required');
    return planId || this.resolve(strategy.planHint);
  }

  gateContext(decision, policies) {
    const summaryObj = policies && typeof policies === 'object'
      ? (policies.verdict ? policies : (policies.summary && policies.summary.verdict ? policies.summary : null))
      : null;
    return {
      policyVerdict: summaryObj ? summaryObj.verdict : 'pass',
      decisionVerdict: decision ? decision.verdict : 'REJECT',
      decisionId: decision ? decision.decisionId : null,
      businessId: decision ? decision.businessId : null
    };
  }

  expectedGates(plan) {
    const loaded = this.runner.loadPlan(typeof plan === 'string' ? this.planFor(plan) : plan);
    return loaded.steps.filter((s) => s.gate).map((s) => ({ stepId: s.id, gate: s.gate, action: s.action }));
  }

  proceed(decision) {
    if (!decision || !decision.verdict) throw plrError(PLR_CODES.NO_DECISION, 'decision required');
    switch (decision.verdict) {
      case 'APPROVE':
        return { ok: true, reason: 'decision approved, executing plan' };
      case 'ESCALATE':
        return { ok: true, reason: 'decision escalated, human review required before outreach', escalated: true };
      case 'PARK':
        return { ok: false, reason: 'decision parked, waiting for more signals' };
      default:
        return { ok: false, reason: `decision ${decision.verdict}, not executable` };
    }
  }

  select(strategy, decision, policies) {
    const planId = this.pick(strategy);
    const plan = this.planFor(planId);
    const context = this.gateContext(decision, policies);
    return { strategy, planId, plan, gateContext: context, expectedGates: this.expectedGates(plan) };
  }
}

export function createPlannerEngine(opts) {
  return new PlannerEngine(opts);
}
