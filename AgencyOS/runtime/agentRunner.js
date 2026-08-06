import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stableStringify, shortHash, seededRng, nowIso, slugify, writeJson, ensureDir } from './utils.js';
import { typedError, CODES } from './errors.js';
import { retry as retryWithPolicy } from './retry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class AgentRunner {
  constructor({ root = ROOT, resolver = null, validator = null, bus = null, logger = null, retry = retryWithPolicy, memory = null, cache = null } = {}) {
    this.root = root;
    this.resolver = resolver;
    this.validator = validator;
    this.bus = bus;
    this.logger = logger;
    this.retryFn = retry;
    this.memory = memory;
    this.cache = cache;
  }

  async run(agentId, input, context, { stepId = null, bus = null, logger = null } = {}) {
    const agent = this.resolver.loadAgent(agentId);
    if (!agent) throw typedError(CODES.STATE_UNKNOWN_AGENT, `agent not registered: ${agentId}`, { agentId });
    const started = Date.now();
    const runBus = bus || this.bus;
    const runLogger = logger || this.logger;
    runBus.emitEvent('agent_started', { agent: agent.id, runId: context.runId, workflowId: context.workflowId, stepId }, { agentId: agent.id });

    const inputValidation = this._validateInput(agent, input, context, runBus);

    const cacheKey = this._cacheKey(agent, input, context, stepId);
    const cached = this.cache ? this.cache.get(cacheKey) : null;
    if (cached && cached.__cached) {
      const outputValidation = this._validateOutput(agent, cached.output, context, runBus);
      const durationMs = Date.now() - started;
      context.addMetric('cache', 'hits', 1);
      runBus.emitEvent('agent_completed', { agent: agent.id, runId: context.runId, workflowId: context.workflowId, stepId, durationMs }, {
        strategy: 'cache',
        attempts: 0,
        outputValidation: outputValidation.valid,
        checksum: cached.checksum
      });
      return {
        agent: agent.id,
        strategy: 'cache',
        fromCache: true,
        attempts: 0,
        durationMs,
        inputValidation,
        outputValidation,
        output: cached.output,
        checksum: cached.checksum
      };
    }

    const strategy = this._pickStrategy(agent);
    const policy = {
      maxAttempts: agent.config.retry?.maxAttempts ?? 3,
      initialDelayMs: agent.config.retry?.initialDelayMs ?? 500,
      backoff: agent.config.retry?.backoff ?? 'exponential'
    };
    let retryCount = 0;

    const attempt = async () => {
      try {
        return await this._execute(agent, strategy, input, context, { stepId, bus: runBus, logger: runLogger });
      } catch (err) {
        if (this._isRetryable(err, agent)) {
          retryCount++;
          runBus.emitEvent('retry', { agent: agent.id, stepId, attempt: retryCount }, { code: err.code, message: err.message });
          context.addMetric('retries', agent.id, 1);
        }
        throw err;
      }
    };

    let output;
    let attempts = 0;
    try {
      const result = await this.retryFn(attempt, { ...policy, onAttempt: () => { retryCount++; } });
      output = result.result;
      attempts = result.attemptCount;
    } catch (err) {
      context.addMetric('agentRuns', agent.id, 1);
      runBus.emitEvent('agent_failed', { agent: agent.id, runId: context.runId, stepId }, { code: err.code, message: err.message });
      throw err;
    }

    const outputValidation = this._validateOutput(agent, output, context, runBus);

    const durationMs = Date.now() - started;
    context.addMetric('agentRuns', agent.id, 1);
    context.addMetric('stepDurationsMs', `${agent.id}::${stepId || '?'}`, durationMs);
    context.addMetric('cache', 'misses', 1);

    if (this.cache) {
      this.cache.set(cacheKey, { __cached: true, output, strategy, checksum: shortHash(stableStringify(output), 16), agent: agent.id });
    }

    if (this.memory) {
      try {
        this.memory.put(agent.id, `${context.runId}::${stepId || 'output'}::output`, output, { scope: 'short' });
        context.addMetric('memoryOps', 'puts', 1);
      } catch {
        /* memory best effort */
      }
    }

    runBus.emitEvent('agent_completed', { agent: agent.id, runId: context.runId, workflowId: context.workflowId, stepId, durationMs }, {
      strategy,
      attempts: attempts + 1,
      outputValidation: outputValidation.valid,
      checksum: shortHash(stableStringify(output), 16)
    });

    return {
      agent: agent.id,
      strategy,
      attempts: attempts + 1,
      durationMs,
      inputValidation,
      outputValidation,
      output,
      checksum: shortHash(stableStringify(output), 16)
    };
  }

  _validateInput(agent, input, context, runBus = this.bus) {
    if (!this.validator || !agent.inputSchema) return { valid: true, errors: [] };
    const result = this.validator.validate(input, agent.inputSchema, { schemaPath: agent.inputSchemaPath });
    context.addMetric('validations', 'inputs', 1);
    if (!result.valid) context.addMetric('validations', 'inputWarnings', 1);
    runBus.emitEvent('validated', { agent: agent.id, kind: 'input', valid: result.valid }, { schemaPath: agent.inputSchemaPath, errors: result.errors.slice(0, 5) });
    return result;
  }

  _validateOutput(agent, output, context, runBus = this.bus) {
    if (!this.validator || !agent.outputSchema) return { valid: true, errors: [] };
    const result = this.validator.validate(output, agent.outputSchema, { schemaPath: agent.outputSchemaPath });
    context.addMetric('validations', 'outputs', 1);
    let canonical = null;
    let canonicalResult = null;
    if (result.valid) {
      canonical = this.validator.canonicalFor(agent.outputSchema.title);
      if (canonical) {
        canonicalResult = this.validator.validate(output, canonical, { schemaPath: `canonical:${canonical.title || '?'}` });
        context.addMetric('validations', 'canonical', 1);
        runBus.emitEvent('validated', { agent: agent.id, kind: 'canonical', valid: canonicalResult.valid }, { errors: canonicalResult.errors.slice(0, 5) });
        if (!canonicalResult.valid) {
          context.addMetric('validations', 'canonicalWarnings', 1);
          runLoggerWarn(runBus, agent, context, canonicalResult);
          if (context.options?.strict === true) {
            context.addMetric('validations', 'failures', 1);
            throw typedError(CODES.VALIDATION_SCHEMA, `agent "${agent.id}" output failed canonical schema validation (strict mode)`, {
              agentId: agent.id,
              schemaPath: `canonical:${canonical.title}`,
              errors: canonicalResult.errors.slice(0, 10)
            });
          }
        }
      }
      runBus.emitEvent('validated', { agent: agent.id, kind: 'output', valid: true }, { schemaPath: agent.outputSchemaPath });
      return { ...result, canonical: canonical ? canonicalResult : null };
    }
    context.addMetric('validations', 'failures', 1);
    runBus.emitEvent('validated', { agent: agent.id, kind: 'output', valid: false }, { schemaPath: agent.outputSchemaPath, errors: result.errors.slice(0, 5) });
    throw typedError(CODES.VALIDATION_SCHEMA, `agent "${agent.id}" output failed schema validation`, {
      agentId: agent.id,
      schemaPath: agent.outputSchemaPath,
      errors: result.errors.slice(0, 10)
    });
  }

  _cacheKey(agent, input, context, stepId) {
    return `agent-output:${agent.id}:${stepId || '?'}:${context.seed}:${shortHash(stableStringify(input), 10)}`;
  }

  _pickStrategy(agent) {
    if (agent.implFile) return 'impl';
    if (agent.config.command) return 'command';
    return 'simulator';
  }

  _isRetryable(err, agent) {
    const retryableCodes = ['E_TR_TIMEOUT', 'E_TR_NETWORK', 'E_TR_RATE_LIMITED', 'E_TR_UNKNOWN'];
    if (err.code && retryableCodes.includes(err.code)) return true;
    if (agent.config.retry?.retryOn && err.code && agent.config.retry.retryOn.some((c) => c.includes(err.code.toLowerCase()))) return true;
    return false;
  }

  async _execute(agent, strategy, input, context, { stepId, bus, logger }) {
    if (strategy === 'impl') return this._runImpl(agent, input, context, stepId);
    if (strategy === 'command') return this._runCommand(agent, input, context, stepId);
    return this._simulate(agent, input, context, stepId);
  }

  async _runImpl(agent, input, context, stepId) {
    const module = await import(pathToFileURL(agent.implFile).href);
    const fn = module.default || module.run || module.execute;
    if (typeof fn !== 'function') throw typedError(CODES.INFRA_UNKNOWN, `agent impl ${agent.id} has no callable export`, { agentId: agent.id });
    const api = {
      context: { runId: context.runId, workflowId: context.workflowId, stepId, seed: context.seed },
      logger: this.logger,
      bus: this.bus,
      memory: this.memory,
      cache: this.cache
    };
    return await fn(input, api);
  }

  _runCommand(agent, input, context, stepId) {
    const command = agent.config.command;
    const args = Array.isArray(command) ? command : [command];
    const inputFile = path.join(this.root, 'storage', 'tmp', `${slugify(agent.id)}-${context.runId}-${stepId || 'input'}.json`);
    ensureDir(path.dirname(inputFile));
    writeJson(inputFile, input);
    const result = spawnSync(args[0], [...args.slice(1), inputFile], { encoding: 'utf8', timeout: (agent.config.timeoutSeconds || 120) * 1000 });
    if (result.error) throw typedError(CODES.INFRA_UNKNOWN, `agent command failed to start: ${result.error.message}`, { agentId: agent.id });
    if (result.status !== 0) throw typedError(CODES.INFRA_UNKNOWN, `agent command exited ${result.status}: ${result.stderr || result.stdout}`, { agentId: agent.id });
    try {
      return JSON.parse(result.stdout.trim());
    } catch {
      throw typedError(CODES.VALIDATION_SCHEMA, `agent command output is not JSON`, { agentId: agent.id });
    }
  }

  _simulate(agent, input, context, stepId) {
    const seedStr = `${context.seed}:${context.workflowId}:${stepId || '?'}:${agent.id}:${shortHash(stableStringify(input), 10)}`;
    const rng = seededRng(seedStr);
    const generator = new Simulator(this.validator, rng, context, stepId);
    const output = generator.generate(agent.outputSchema, `${slugify(agent.id)}-${shortHash(seedStr, 4)}`);
    if (this.validator) {
      const result = this.validator.validate(output, agent.outputSchema, { schemaPath: agent.outputSchemaPath });
      if (!result.valid) {
        const fixed = generator.repair(output, agent.outputSchema, agent.outputSchemaPath);
        const second = this.validator.validate(fixed, agent.outputSchema, { schemaPath: agent.outputSchemaPath });
        if (!second.valid) {
          throw typedError(CODES.DATA_SIMULATION, `simulator could not satisfy agent output schema "${agent.id}"`, {
            agentId: agent.id,
            errors: second.errors.slice(0, 10)
          });
        }
        return fixed;
      }
    }
    return output;
  }
}

function runLoggerWarn(runBus, agent, context, canonicalResult) {
  runBus.emitEvent('validated', { agent: agent.id, kind: 'canonical-warning', valid: false }, {
    schemaPath: `canonical:${canonicalResult.schemaPath || '?'}`,
    errors: canonicalResult.errors.slice(0, 5)
  });
}

class Simulator {  constructor(validator, rng, context, stepId) {
    this.validator = validator;
    this.rng = rng;
    this.context = context;
    this.stepId = stepId;
    this.tail = shortHash(`${context.seed}:${stepId || '?'}`, 6);
  }

  generate(schema, prefix) {
    const value = this._generateNode(schema, schema, '$', prefix);
    return value;
  }

  _resolve(schema, root) {
    if (schema.$ref) {
      const ref = schema.$ref;
      if (ref === '#') return root;
      if (ref.startsWith('#/')) {
        let node = root;
        for (const seg of ref.slice(2).split('/')) {
          if (node == null) return undefined;
          node = node[seg.replace(/~1/g, '/').replace(/~0/g, '~')];
        }
        return node;
      }
      return undefined;
    }
    return schema;
  }

  _generateNode(schema, root, path, prefix) {
    schema = this._resolve(schema, root);
    if (!schema) return null;

    if (schema.const !== undefined) return schema.const;
    if (schema.enum) return schema.enum[0];

    if (schema.allOf) {
      let merged = {};
      for (const sub of schema.allOf) {
        const subResolved = this._resolve(sub, root);
        merged = { ...merged, ...subResolved };
      }
      return this._generateNode({ ...merged, properties: merged.properties }, root, path, prefix);
    }
    if (schema.anyOf || schema.oneOf) {
      const subs = schema.anyOf || schema.oneOf;
      return this._generateNode(subs[0], root, path, prefix);
    }

    if (schema.type === 'array') {
      const count = schema.minItems ?? 0;
      const items = [];
      for (let i = 0; i < count; i++) {
        const itemSchema = Array.isArray(schema.items) ? schema.items[0] || {} : schema.items || {};
        items.push(this._generateNode(itemSchema, root, `${path}[${i}]`, prefix));
      }
      return items;
    }

    if (schema.type === 'object') {
      const out = {};
      const props = schema.properties || {};
      const keys = new Set([...Object.keys(props).sort(), ...(schema.required || [])]);
      for (const key of keys) {
        const sub = props[key];
        out[key] = sub ? this._generateNode(sub, root, `${path}.${key}`, prefix) : {};
      }
      return out;
    }

    if (schema.type === 'string') return this._string(schema, path, prefix);
    if (schema.type === 'number' || schema.type === 'integer') {
      const max = schema.maximum ?? schema.exclusiveMaximum;
      const value = typeof max === 'number' ? max : 100;
      return schema.type === 'integer' ? Math.round(value) : value;
    }
    if (schema.type === 'boolean') return true;
    if (schema.type === 'null') return null;
    return null;
  }

  _string(schema, path, prefix) {
    if (schema.format === 'date-time' || schema.format === 'date') return nowIso();
    if (schema.format === 'uri') return `https://sim.example/${this.tail}`;
    if (schema.format === 'email') return `sim@example.test`;
    if (schema.pattern) {
      const mapped = {
        '^[A-Z]{3}$': 'USD',
        '^[+0-9 ]+$': '+10000000000',
        '^[0-9]+$': '10000000000',
        '^\\d+ \\d+ \\d+$': '0 0 0',
        '^[A-Za-z0-9]{3,10}$': 'sim-000000'
      }[schema.pattern];
      if (mapped) return mapped;
    }
    const base = `sim-${slugify(path).replace(/[^a-z0-9-]/g, '').slice(-16) || 'value'}-${this.tail}`;
    const candidates = [base, base.replace(/[^a-z0-9-]/g, ''), 'value', 'x'];
    for (const candidate of candidates) {
      let ok = true;
      if (schema.minLength !== undefined && [...candidate].length < schema.minLength) ok = false;
      if (schema.maxLength !== undefined && [...candidate].length > schema.maxLength) ok = false;
      if (ok && schema.pattern) {
        try {
          ok = new RegExp(schema.pattern).test(candidate);
        } catch {
          ok = false;
        }
      }
      if (ok) return candidate;
    }
    return 'x';
  }

  repair(value, schema, schemaPath) {
    const result = this.validator.validate(value, schema, { schemaPath });
    if (result.valid) return value;
    let current = JSON.parse(JSON.stringify(value));
    let guard = 0;
    while (guard < 6) {
      let progressed = false;
      for (const error of result.errors) {
        const { node, key } = this._locate(current, error.path);
        if (!node) continue;
        const prev = node[key];
        if (typeof prev === 'string') node[key] = prev.length > 1 ? 'x' : 'a';
        else if (typeof prev === 'number') node[key] = 0;
        else if (Array.isArray(prev)) node[key] = [];
        else if (prev && typeof prev === 'object') node[key] = {};
        else node[key] = 'x';
        progressed = true;
      }
      const check = this.validator.validate(current, schema, { schemaPath });
      if (check.valid) return current;
      if (!progressed) break;
      result.errors = check.errors;
      guard++;
    }
    return current;
  }

  _locate(value, pathStr) {
    const segments = pathStr.replace(/^\$/, '').split('.');
    let node = value;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i].replace(/\[\d+\]/g, '');
      if (seg === '') continue;
      if (node == null || typeof node !== 'object') return { node: null, key: null };
      node = node[seg];
    }
    if (node == null || typeof node !== 'object') return { node: null, key: null };
    const last = segments[segments.length - 1];
    const key = last.replace(/\[\d+\]/g, '');
    return { node, key };
  }
}

export function createAgentRunner(opts) {
  return new AgentRunner(opts);
}
