import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, writeJson, slugify, nowIso, stableStringify, shortHash } from './utils.js';
import { typedError, CODES } from './errors.js';
import { EVENTS } from './eventBus.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class StepExecutor {
  constructor({ root = ROOT, resolver = null, agentRunner = null, contextManager = null, bus = null, logger = null, workflowRunner = null } = {}) {
    this.root = root;
    this.resolver = resolver;
    this.agentRunner = agentRunner;
    this.contextManager = contextManager;
    this.bus = bus;
    this.logger = logger;
    this.workflowRunner = workflowRunner;
  }

  async executeStep(item, context, workflow, { bus = null, logger = null } = {}) {
    const key = `step:${item.id}`;
    const started = Date.now();
    const runBus = bus || this.bus;
    runBus.emitEvent(EVENTS.STEP_STARTED, { runId: context.runId, workflowId: workflow.id, stepId: item.id, actor: item.actor });

    const input = this._resolveStepInput(item, context, workflow);

    const agent = this.resolver.loadAgent(item.actor);
    let result;
    let record;

    if (agent) {
      try {
        result = await this.agentRunner.run(agent.id, input, context, { stepId: item.id, bus: runBus, logger: logger || this.logger });
        this._storeDocument(context, item.output, result.output, workflow.id, item.id, runBus);
        record = { id: item.id, actor: agent.id, action: item.action, status: 'completed', strategy: result.strategy, durationMs: result.durationMs, attempts: result.attempts, checksum: result.checksum };
      } catch (err) {
        record = { id: item.id, actor: item.actor, action: item.action, status: 'failed', error: { code: err.code, message: err.message }, durationMs: Date.now() - started };
        this.contextManager.recordStep(context, record);
        runBus.emitEvent(EVENTS.REJECTED, { runId: context.runId, stepId: item.id, actor: item.actor }, { code: err.code, message: err.message });
        throw err;
      }
    } else if (this._isExternalActor(item.actor, workflow)) {
      const externalDoc = { external: true, actor: item.actor, action: item.action, emittedAt: nowIso() };
      this._storeDocument(context, item.output, externalDoc, workflow.id, item.id, runBus);
      context.addMetric('externalSteps', 'count', 1);
      runBus.emitEvent(EVENTS.EXTERNAL_STEP, { runId: context.runId, workflowId: workflow.id, stepId: item.id, actor: item.actor }, {});
      record = { id: item.id, actor: item.actor, action: item.action, status: 'external', durationMs: Date.now() - started };
    } else {
      throw typedError(CODES.STATE_UNKNOWN_ACTOR, `actor not registered and not declared external: ${item.actor}`, { actor: item.actor, workflowId: workflow.id });
    }

    const gatePassed = this._evaluateGate(item.gate, context);
    if (item.gate) {
      this.contextManager.setGateResult(context, `${key}-gate`, gatePassed);
      if (gatePassed) {
        context.addMetric('gates', 'passed', 1);
        runBus.emitEvent(EVENTS.GATE_PASSED, { runId: context.runId, stepId: item.id, gate: item.gate }, {});
      } else {
        context.addMetric('gates', 'failed', 1);
        runBus.emitEvent(EVENTS.GATE_FAILED, { runId: context.runId, stepId: item.id, gate: item.gate }, {});
      }
    }

    record.durationMs = record.durationMs ?? Date.now() - started;
    record.status = gatePassed ? record.status : 'blocked';
    record.gate = item.gate ? (gatePassed ? 'passed' : 'blocked') : 'none';
    this.contextManager.recordStep(context, record);
    this.contextManager.markStepComplete(context, { type: 'step', id: item.id });

    runBus.emitEvent(EVENTS.STEP_COMPLETED, { runId: context.runId, stepId: item.id, status: record.status }, { record });

    return {
      kind: 'step',
      stepId: item.id,
      status: record.status,
      blocked: !gatePassed,
      external: record.status === 'external',
      outputDocument: this.contextManager.getDocument(context, item.output),
      record
    };
  }

  async executeStage(stage, context, { bus = null, logger = null } = {}) {
    const key = `stage:${stage.order}`;
    const started = Date.now();
    const runBus = bus || this.bus;
    const entryName = stage.entry ? slugify(stage.entry) : null;
    const entryValue = entryName ? this.contextManager.getDocumentValue(context, entryName) : undefined;
    const input = entryValue !== undefined ? entryValue : context.input;

    runBus.emitEvent(EVENTS.STEP_STARTED, { runId: context.runId, workflowId: context.workflowId, stageOrder: stage.order, workflow: stage.workflow });

    let child;
    try {
      child = await this.workflowRunner.run(stage.workflow, input, {
        runId: null,
        seed: context.seed,
        resume: false,
        nested: true,
        parentRunId: context.runId,
        strict: context.options?.strict === true
      });
    } catch (err) {
      if (err.code === CODES.STATE_UNKNOWN_WORKFLOW && context.options?.strict !== true) {
        child = { status: 'unavailable', workflowId: stage.workflow, reason: 'workflow-not-registered' };
      } else {
        throw err;
      }
    }

    if (child.status === 'unavailable') {
      context.addMetric('unavailableStages', 'count', 1);
      const record = { order: stage.order, workflow: stage.workflow, status: 'unavailable', reason: child.reason, durationMs: Date.now() - started };
      this.contextManager.recordStage(context, record);
      this.contextManager.markStepComplete(context, { type: 'stage', order: stage.order });
      runBus.emitEvent(EVENTS.STAGE_UNAVAILABLE, { runId: context.runId, stageOrder: stage.order, workflow: stage.workflow }, { reason: child.reason });
      return { kind: 'stage', order: stage.order, status: 'unavailable', unavailable: true, record };
    }

    const exitName = stage.exit ? slugify(stage.exit) : null;
    if (exitName && child.documents) {
      const childExit = child.workflowExitDocumentName
        ? child.documents[child.workflowExitDocumentName]
        : null;
      const exitValue = childExit !== undefined ? childExit : child.input;
      if (exitValue !== undefined) this._storeDocument(context, exitName, exitValue, stage.workflow, `stage:${stage.order}`, runBus);
    }

    const gatePassed = this._evaluateGate(stage.gate, context);
    if (stage.gate) {
      this.contextManager.setGateResult(context, `${key}-gate`, gatePassed);
      if (gatePassed) {
        context.addMetric('gates', 'passed', 1);
        runBus.emitEvent(EVENTS.GATE_PASSED, { runId: context.runId, stageOrder: stage.order, gate: stage.gate }, {});
      } else {
        context.addMetric('gates', 'failed', 1);
        runBus.emitEvent(EVENTS.GATE_FAILED, { runId: context.runId, stageOrder: stage.order, gate: stage.gate }, {});
      }
    }

    const record = {
      order: stage.order,
      workflow: stage.workflow,
      status: child.status,
      gate: stage.gate ? (gatePassed ? 'passed' : 'blocked') : 'none',
      blocked: !gatePassed,
      childRunId: child.runId || null,
      durationMs: Date.now() - started
    };
    this.contextManager.recordStage(context, record);
    this.contextManager.markStepComplete(context, { type: 'stage', order: stage.order });

    runBus.emitEvent(EVENTS.STEP_COMPLETED, { runId: context.runId, stageOrder: stage.order, status: record.status }, { record });

    return { kind: 'stage', order: stage.order, status: record.status, blocked: !gatePassed, childRunId: child.runId, record };
  }

  _resolveStepInput(item, context, workflow) {
    if (item.index === 0 && workflow.entryDocument) {
      const entry = this.contextManager.getDocumentValue(context, workflow.entryDocument);
      if (entry !== undefined) return entry;
    }
    if (item.index === 0) return context.input;
    const prev = workflow.steps[item.index - 1];
    if (prev) {
      const value = this.contextManager.getDocumentValue(context, slugify(prev.output));
      if (value !== undefined) return value;
    }
    return context.input;
  }

  _storeDocument(context, outputLabel, value, workflowId, stepId, runBus = this.bus) {
    const doc = this.contextManager.setDocument(context, slugify(outputLabel), value, { stepId, workflowId });
    context.addMetric('documentsEmitted', 'count', 1);
    runBus.emitEvent(EVENTS.DOCUMENT_EMITTED, { runId: context.runId, workflowId, stepId }, { document: doc.name, version: doc.version, checksum: doc.checksum });
    return doc;
  }

  _isExternalActor(actor, workflow) {
    const normalized = slugify(actor);
    return workflow.actors.includes(normalized);
  }

  _evaluateGate(gate, context) {
    if (!gate) return true;
    const condition = typeof gate === 'string' ? gate : gate.condition;
    if (!condition || String(condition).trim() === '' || String(condition).trim() === 'none') return true;
    return evaluateExpression(String(condition), context);
  }
}

const ATOM_RE = /^([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)\s*(>=|<=|==|!=|>|<|contains|in)\s*(.+)$/;

export function evaluateExpression(expression, context) {
  const orGroups = splitTopLevel(expression, '||');
  for (const orGroup of orGroups) {
    const andTerms = splitTopLevel(orGroup, '&&');
    if (andTerms.every((term) => evaluateAtom(term.trim(), context))) return true;
  }
  return false;
}

function splitTopLevel(input, sep) {
  const out = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(') {
      depth++;
      continue;
    }
    if (ch === ')') {
      depth--;
      continue;
    }
    if (depth === 0 && input.startsWith(sep, i)) {
      out.push(input.slice(start, i));
      i += sep.length - 1;
      start = i + 1;
    }
  }
  out.push(input.slice(start));
  return out;
}

function evaluateAtom(atom, context) {
  if (atom === 'true') return true;
  if (atom === 'false') return false;
  const match = ATOM_RE.exec(atom);
  if (!match) return false;
  const [, path, op, rawValue] = match;
  const value = resolvePath(context, path);
  const expected = parseLiteral(rawValue);
  if (value === undefined || value === null) return false;
  switch (op) {
    case '>=': return value >= expected;
    case '<=': return value <= expected;
    case '>': return value > expected;
    case '<': return value < expected;
    case '==': return value === expected;
    case '!=': return value !== expected;
    case 'contains':
      if (Array.isArray(value)) return value.includes(expected);
      return String(value).includes(String(expected));
    case 'in':
      if (Array.isArray(expected)) return expected.includes(value);
      return String(expected).split(',').map((s) => s.trim()).includes(value);
    default:
      return false;
  }
}

function resolvePath(context, path) {
  const segments = path.split('.');
  const docName = segments.shift();
  const doc = context.documents[slugify(docName)];
  if (!doc) return undefined;
  let value = doc.value;
  for (const seg of segments) {
    if (value === null || value === undefined) return undefined;
    value = value[seg];
  }
  return value;
}

function parseLiteral(raw) {
  const trimmed = String(raw).trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function createStepExecutor(opts) {
  return new StepExecutor(opts);
}
