import { xplError, XPL_CODES } from './errors.js';

function seeded(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export const DEFAULT_GATES = {
  policiesPass: (ctx) => ctx.policyVerdict === 'pass',
  decisionApprove: (ctx) => ctx.decisionVerdict === 'APPROVE'
};

function findPath(graph, from, to) {
  if (from === to) return [];
  const queue = [[from, []]];
  const seen = new Set([from]);
  while (queue.length) {
    const [node, path] = queue.shift();
    for (const next of graph[node] || []) {
      if (seen.has(next)) continue;
      const newPath = [...path, next];
      if (next === to) return newPath;
      seen.add(next);
      queue.push([next, newPath]);
    }
  }
  return null;
}

export class ExecutionPlanRunner {
  constructor({ gates = null, clock = null } = {}) {
    this.gates = { ...DEFAULT_GATES, ...(gates || {}) };
    this.clock = clock || (() => new Date().toISOString());
  }

  loadPlan(plan) {
    if (typeof plan === 'string') {
      try {
        plan = JSON.parse(plan);
      } catch (e) {
        throw xplError(XPL_CODES.INVALID_PLAN, 'plan JSON is not parseable');
      }
    }
    if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      throw xplError(XPL_CODES.INVALID_PLAN, 'plan must define a non-empty steps array');
    }
    const ids = new Set();
    for (const step of plan.steps) {
      if (!step.id || !step.action || !step.state) throw xplError(XPL_CODES.INVALID_PLAN, `step needs id, action and state (got ${JSON.stringify(step)})`);
      if (ids.has(step.id)) throw xplError(XPL_CODES.INVALID_PLAN, `duplicate step id "${step.id}"`);
      ids.add(step.id);
    }
    return plan;
  }

  graphFor(stateMachine) {
    const graph = {};
    for (const s of stateMachine.states()) graph[s] = stateMachine.transitions(s);
    return graph;
  }

  pathTo(instance, target, stateMachine) {
    const graph = this.graphFor(stateMachine);
    const path = findPath(graph, instance.current, target);
    if (!path) throw xplError(XPL_CODES.UNREACHABLE, `${instance.current} -> ${target} is unreachable`);
    return path;
  }

  async run(plan, { stateMachine, instance, executors = {}, context = {} }) {
    const loaded = this.loadPlan(plan);
    const states = stateMachine.states();
    const results = [];
    let currentStep = null;
    try {
      for (const step of loaded.steps) {
        currentStep = step;
        const result = await this._runStep(step, { stateMachine, instance, executors, context, states });
        results.push(result);
        if (result.ok === false) {
          return { planId: loaded.id, ok: false, currentStep: step.id, state: instance.current, results, failure: result.error || null };
        }
      }
      return { planId: loaded.id, ok: true, currentStep: null, state: instance.current, results };
    } catch (e) {
      const result = {
        stepId: currentStep ? currentStep.id : null,
        action: currentStep ? currentStep.action : null,
        ok: false,
        error: e.message
      };
      results.push(result);
      return { planId: loaded.id, ok: false, currentStep: currentStep ? currentStep.id : null, state: instance.current, results, failure: e.message };
    }
  }

  async _runStep(step, { stateMachine, instance, executors, context, states }) {
    const started = Date.now();
    const maxRetries = (step.retry && step.retry.max) || 0;
    let attempts = 0;
    let lastError = null;
    while (true) {
      attempts++;
      const path = this.pathTo(instance, step.state, stateMachine);
      const working = path.length > 1 ? path[0] : instance.current;
      const rest = path.length > 1 ? path.slice(1) : path;
      if (working !== instance.current) {
        stateMachine.transition(instance, working, { by: 'plan', reason: `${step.id} begin` });
      }
      try {
        if (step.gate) {
          const gateFn = this.gates[step.gate];
          if (!gateFn) throw xplError(XPL_CODES.UNKNOWN_GATE, `unknown gate "${step.gate}"`);
          if (!gateFn(context)) {
            return { stepId: step.id, action: step.action, state: step.state, ok: false, attempts, error: `gate "${step.gate}" blocked step` };
          }
        }
        const executor = executors[step.action] || DEFAULT_EXECUTORS[step.action] || DEFAULT_EXECUTORS.generic;
        const output = await executor(step, context);
        for (const hop of rest) {
          stateMachine.transition(instance, hop, { by: 'plan', reason: `${step.id} -> ${hop}` });
        }
        const durationMs = Date.now() - started;
        stateMachine.applyTimeout(instance, durationMs, { by: 'plan' });
        return { stepId: step.id, action: step.action, state: instance.current, ok: true, attempts, durationMs, output };
      } catch (e) {
        lastError = e;
        const canRetry = attempts <= maxRetries && (working === 'GENERATING' || working === 'QA');
        const failRes = stateMachine.fail(instance, { by: 'plan', reason: `${step.id} failed (attempt ${attempts})`, retryable: canRetry });
        if (failRes.current === 'RETRY' && canRetry) {
          stateMachine.retryTo(instance, working, { by: 'plan', reason: `retry ${step.id}` });
          continue;
        }
        return { stepId: step.id, action: step.action, state: instance.current, ok: false, attempts, durationMs: Date.now() - started, error: lastError.message };
      }
    }
  }
}

export const DEFAULT_EXECUTORS = {
  generic: async (step) => ({ artifact: `${step.action}-artifact`, ok: true }),
  discovery: async (step) => ({ artifact: `lead-${step.id}`, ok: true }),
  validation: async (step) => ({ valid: true }),
  analysis: async (step) => ({ dossier: true }),
  dossier: async (step) => ({ dossier: true }),
  approval: async (step) => ({ approved: true }),
  'website-generation': async (step, context) => {
    const rng = seeded(`${context.businessId || 'biz'}|${step.id}`);
    return { website: `website-${step.id}`, pages: 6 + Math.floor(rng() * 4), buildMs: 3000 + Math.floor(rng() * 2000) };
  },
  qa: async (step) => ({ pass: true, issues: 0 }),
  proposal: async (step) => ({ proposal: true }),
  crm: async (step) => ({ contact: true }),
  close: async (step) => ({ closed: true }),
  archive: async (step) => ({ archived: true })
};

export function createExecutionPlanRunner(opts) {
  return new ExecutionPlanRunner(opts);
}
