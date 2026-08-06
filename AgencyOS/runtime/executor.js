import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger } from './logger.js';
import { EventBus } from './eventBus.js';
import { Validator } from './validator.js';
import { MemoryManager } from './memoryManager.js';
import { CacheManager } from './cacheManager.js';
import { ContextManager } from './contextManager.js';
import { DependencyResolver } from './dependencyResolver.js';
import { AgentRunner } from './agentRunner.js';
import { StepExecutor } from './stepExecutor.js';
import { WorkflowRunner } from './workflowRunner.js';
import { retry as retryFn } from './retry.js';
import { typedError, CODES } from './errors.js';
import { stableStringify, shortHash } from './utils.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class Executor {
  constructor({ root = ROOT, logger = null, runId = null } = {}) {
    this.root = root;
    this.logger = logger || new Logger({ runId: runId || 'executor' });
    this.bus = new EventBus(this.logger);
    this.validator = new Validator({ schemasDir: path.join(root, 'schemas'), logger: this.logger });
    this.memory = new MemoryManager({ root, bus: this.bus, logger: this.logger });
    this.cache = new CacheManager({ root, bus: this.bus, logger: this.logger });
    this.contextManager = new ContextManager({ root, bus: this.bus, logger: this.logger });
    this.resolver = new DependencyResolver({ root, validator: this.validator, logger: this.logger });
    this.agentRunner = new AgentRunner({ root, resolver: this.resolver, validator: this.validator, bus: this.bus, logger: this.logger, memory: this.memory, cache: this.cache });
    this.workflowRunner = new WorkflowRunner({ root, resolver: this.resolver, contextManager: this.contextManager, bus: this.bus, logger: this.logger });
    this.stepExecutor = new StepExecutor({ root, resolver: this.resolver, agentRunner: this.agentRunner, contextManager: this.contextManager, bus: this.bus, logger: this.logger, workflowRunner: this.workflowRunner });
    this.workflowRunner.stepExecutor = this.stepExecutor;
    this.implementations = new Map();
    this.registry = { workflows: new Map(), agents: new Map() };
    this.lastRuns = [];
    this._loadRegistry();
  }

  _loadRegistry() {
    for (const id of this.resolver.listWorkflowIds()) {
      const workflow = this.resolver.loadWorkflow(id);
      if (workflow) this.registry.workflows.set(workflow.id, workflow);
    }
    for (const id of this.resolver.listAgentIds()) {
      const agent = this.resolver.loadAgent(id);
      if (agent) this.registry.agents.set(agent.id, agent);
    }
    this.logger.info('registry_loaded', {
      workflows: [...this.registry.workflows.keys()].sort(),
      agents: [...this.registry.agents.keys()].sort()
    });
  }

  registerAgentImplementation(agentId, fn) {
    const agent = this.resolver.loadAgent(agentId);
    if (!agent) throw typedError(CODES.STATE_UNKNOWN_AGENT, `cannot register implementation for unknown agent: ${agentId}`, { agentId });
    this.implementations.set(agent.id, fn);
    return this;
  }

  async run(workflowId, input = {}, options = {}) {
    const workflow = this.registry.workflows.get(workflowId) || this.registry.workflows.get(String(workflowId).toLowerCase());
    if (!workflow) throw typedError(CODES.STATE_UNKNOWN_WORKFLOW, `workflow not registered: ${workflowId}`, { workflowId });
    const runId = options.runId || null;
    const result = await this.workflowRunner.run(workflow.id, input, {
      runId,
      seed: options.seed,
      resume: options.resume !== false,
      nested: false,
      strict: options.strict === true
    });
    this.lastRuns.push({ runId: result.runId, workflowId: result.workflowId, status: result.status });
    if (this.lastRuns.length > 200) this.lastRuns.shift();
    return result;
  }

  async resume(runId) {
    const context = this.contextManager.load(runId);
    if (!context) throw typedError(CODES.STATE_CONTEXT, `no run found for ${runId}`, { runId });
    if (context.status === 'completed' && context.summary) {
      return this.workflowRunner._existingResult(context);
    }
    return this.workflowRunner.run(context.workflowId, context.input, {
      runId: context.runId,
      seed: context.seed,
      resume: true,
      nested: Boolean(context.nested),
      parentRunId: context.parentRunId || null,
      strict: context.options?.strict === true
    });
  }

  async runAll(options = {}) {
    const ids = [...this.registry.workflows.keys()].sort();
    const results = {};
    for (const id of ids) {
      try {
        const result = await this.run(id, options.input || {}, options);
        results[id] = { status: result.status, runId: result.runId, steps: result.steps?.length || 0, stages: result.stages?.length || 0 };
      } catch (err) {
        results[id] = { status: 'error', error: { code: err.code, message: err.message } };
      }
    }
    return results;
  }

  stats() {
    return {
      registry: {
        workflows: [...this.registry.workflows.keys()].sort(),
        agents: [...this.registry.agents.keys()].sort()
      },
      implementations: [...this.implementations.keys()],
      validator: this.validator.stats,
      memory: this.memory.statsReport(),
      cache: this.cache.statsReport(),
      lastRuns: this.lastRuns.slice(-10),
      root: this.root
    };
  }

  close() {
    this.logger.close();
  }
}

export async function createExecutor(opts) {
  return new Executor(opts);
}

export { Logger, EventBus, Validator, MemoryManager, CacheManager, ContextManager, DependencyResolver, AgentRunner, StepExecutor, WorkflowRunner, retryFn, typedError, CODES, stableStringify, shortHash };
