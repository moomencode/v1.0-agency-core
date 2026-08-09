import { brnError, BRN_CODES } from './errors.js';
import { ContextEngine } from '../context/index.js';
import { PolicyEngine } from '../policies/index.js';
import { DecisionEngine } from '../decision-engine/index.js';
import { ReasoningEngine } from '../reasoning/index.js';
import { StrategyEngine } from '../strategy/index.js';
import { PlannerEngine } from '../planner/index.js';
import { StateMachine } from '../state-machine/index.js';
import { ExecutionPlanRunner } from '../execution-plans/index.js';
import { MetricsCollector } from '../metrics/index.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const BRAIN_EVENTS = {
  LEAD_DISCOVERED: 'brain.lead_discovered',
  DECISION_MADE: 'brain.decision_made',
  STRATEGY_SELECTED: 'brain.strategy_selected',
  PLAN_STARTED: 'brain.plan_started',
  PLAN_COMPLETED: 'brain.plan_completed'
};

function loadJson(relative) {
  return JSON.parse(readFileSync(join(__dirname, relative), 'utf8'));
}

const DEFAULT_POLICIES = loadJson('../policies/defaults.json');
const DEFAULT_STRATEGIES = loadJson('../strategy/strategies/default.json');

export class Brain {
  constructor({
    executor = null,
    bus = null,
    logger = null,
    validator = null,
    contextEngine = null,
    policyEngine = null,
    decisionEngine = null,
    reasoningEngine = null,
    strategyEngine = null,
    planner = null,
    stateMachine = null,
    planRunner = null,
    metrics = null,
    policies = null
  } = {}) {
    this.executor = executor;
    this.bus = bus || (executor ? executor.bus : null);
    this.logger = logger || null;
    this.validator = validator || (executor ? executor.validator : null);
    this.contextEngine = contextEngine || new ContextEngine();
    this.policyEngine = policyEngine || new PolicyEngine({ policies: policies || DEFAULT_POLICIES.policies });
    this.decisionEngine = decisionEngine || new DecisionEngine();
    this.reasoningEngine = reasoningEngine || new ReasoningEngine();
    this.strategyEngine = strategyEngine || new StrategyEngine({ strategies: DEFAULT_STRATEGIES.strategies });
    this.planner = planner || new PlannerEngine();
    this.stateMachine = stateMachine || new StateMachine();
    this.planRunner = planRunner || new ExecutionPlanRunner();
    this.metrics = metrics || new MetricsCollector({ events: { discovered: true, approved: true, succeeded: true, failed: true } });
    this.customExecutors = {};
  }

  registerExecutor(action, fn) {
    this.customExecutors[action] = fn;
    return this;
  }

  validateRecord(record) {
    if (!record || typeof record !== 'object' || !record.id) {
      throw brnError(BRN_CODES.INVALID_RECORD, 'business record requires an id');
    }
    return true;
  }

  _emit(event, businessId, detail) {
    if (this.bus && typeof this.bus.emitEvent === 'function') {
      this.bus.emitEvent(event, { module: 'brain', businessId }, detail);
    }
  }

  async runBusiness(record, { emit = true } = {}) {
    this.validateRecord(record);
    if (emit) this._emit(BRAIN_EVENTS.LEAD_DISCOVERED, record.id, { name: record.name, category: record.category });

    const context = this.contextEngine.build(record);
    const estimates = this.decisionEngine.estimate(context);
    context.estimates = estimates;
    const policyResult = this.policyEngine.evaluate(context);
    const policySummary = { ...this.policyEngine.summarize(policyResult), mandatoryFailed: policyResult.mandatoryFailed };
    const decision = this.decisionEngine.evaluate(context, { policies: { summary: policySummary } });
    const trace = this.reasoningEngine.trace(decision, context);
    if (emit) this._emit(BRAIN_EVENTS.DECISION_MADE, record.id, { verdict: decision.verdict, confidence: decision.confidence, risk: decision.risk.level });

    const strategy = this.strategyEngine.select({
      ...context,
      opportunity: context.scores.opportunity,
      roi: decision.estimates.roi,
      closingProbability: decision.estimates.closingProbability
    });
    if (emit) this._emit(BRAIN_EVENTS.STRATEGY_SELECTED, record.id, { strategy: strategy.id, score: strategy.score });

    const route = this.planner.proceed(decision);
    const instance = this.stateMachine.create({ id: `stm-${decision.decisionId}`, entityType: 'business' });
    this.metrics.discovered();
    if (decision.verdict === 'APPROVE') this.metrics.approved();

    let planResult = null;
    if (route.ok) {
      const selection = this.planner.select(strategy, decision, policySummary);
      if (emit) this._emit(BRAIN_EVENTS.PLAN_STARTED, record.id, { planId: selection.planId, strategy: strategy.id });
      planResult = await this.planRunner.run(selection.plan, {
        stateMachine: this.stateMachine,
        instance,
        executors: this.customExecutors,
        context: selection.gateContext
      });
      if (planResult.ok) this.metrics.succeeded();
      else this.metrics.failed();
      if (emit) this._emit(BRAIN_EVENTS.PLAN_COMPLETED, record.id, { ok: planResult.ok, state: instance.current, step: planResult.currentStep });
    }

    this.metrics.trackOpportunity(context.scores.opportunity);
    this.metrics.trackRevenue(decision.estimates.salesValue);
    this.metrics.trackBuildTime(decision.estimates.buildTimeMs);

    return {
      businessId: record.id,
      record,
      context,
      policy: policySummary,
      decision,
      trace,
      strategy,
      route,
      plan: planResult,
      state: instance.current,
      snapshot: this.metrics.snapshot()
    };
  }

  summarize(result) {
    return {
      businessId: result.businessId,
      verdict: result.decision.verdict,
      confidence: result.decision.confidence,
      risk: result.decision.risk.level,
      strategy: result.strategy.id,
      strategyScore: result.strategy.score,
      planOk: result.plan ? result.plan.ok : null,
      finalState: result.state,
      estimatedRevenue: result.decision.estimates.salesValue,
      roi: result.decision.estimates.roi,
      headline: result.trace.headline
    };
  }

  async executeWorkflow(workflowId, input = {}, opts = {}) {
    if (this.executor && this.executor.workflowRunner) {
      return this.executor.workflowRunner.run(workflowId, input, opts);
    }
    return { runId: null, workflowId, status: 'unavailable', reason: 'no-workflow-runner', documents: {}, steps: [], stages: [], metrics: {} };
  }

  snapshot() {
    return this.metrics.snapshot();
  }
}

export function createBrain(opts) {
  return new Brain(opts);
}
