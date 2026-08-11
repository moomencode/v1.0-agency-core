import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, readJson, writeJson, slugify, nowIso, stableStringify, shortHash, sanitizeRunId } from './utils.js';
import { typedError, CODES } from './errors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class ContextManager {
  constructor({ root = ROOT, bus = null, logger = null } = {}) {
    this.root = root;
    this.bus = bus;
    this.logger = logger;
    this.runsDir = ensureDir(path.join(root, 'storage', 'documents', 'runs'));
  }

  // SEC-01: runIds are caller-controlled; every on-disk path derived from a
  // runId must go through _runDir, which sanitizes the id into a single safe
  // segment before joining. Hostile ids can never escape storage/documents/runs.
  _runDir(runId) {
    return ensureDir(path.join(this.runsDir, sanitizeRunId(runId)));
  }

  _contextFile(runId) {
    return path.join(this._runDir(runId), 'context.json');
  }

  create({ workflowId, input = {}, options = {} }) {
    // SEC-01 boundary: a caller-supplied runId that does not survive
    // sanitization unchanged (traversal, separators, dots, oversized) is
    // discarded in favor of a fresh generated id. All on-disk uses still pass
    // through _runDir (sanitizeRunId) as a second line of defense.
    const requested = options.runId != null ? String(options.runId) : null;
    const runId = requested != null && sanitizeRunId(requested) === requested
      ? requested
      : this._newRunId(workflowId);
    const seed = options.seed ?? 'agency-os';
    const context = {
      runId,
      workflowId,
      seed,
      status: 'running',
      startedAt: nowIso(),
      finishedAt: null,
      parentRunId: options.parentRunId || null,
      nested: Boolean(options.nested),
      input,
      options,
      documents: {},
      checkpoint: { completedStepIds: [], currentIndex: 0 },
      gates: {},
      metrics: this._freshMetrics(),
      steps: [],
      stages: [],
      summary: null
    };
    this._attachHelpers(context);
    this.persist(context);
    return context;
  }

  load(runId) {
    const context = readJson(this._contextFile(runId), null);
    if (!context) return null;
    context.metrics = context.metrics || this._freshMetrics();
    context.checkpoint = context.checkpoint || { completedStepIds: [], currentIndex: 0 };
    context.documents = context.documents || {};
    this._attachHelpers(context);
    return context;
  }

  _attachHelpers(context) {
    context.addMetric = (bucket, key, value) => {
      if (!context.metrics[bucket]) context.metrics[bucket] = {};
      if (context.metrics[bucket][key] === undefined) context.metrics[bucket][key] = 0;
      context.metrics[bucket][key] += value;
    };
  }

  persist(context) {
    writeJson(this._contextFile(context.runId), context);
  }

  setDocument(context, name, value, { stepId = null, workflowId = context.workflowId } = {}) {
    const key = slugify(name);
    const existing = context.documents[key];
    const version = existing ? existing.version + 1 : 1;
    context.documents[key] = {
      name: key,
      workflowId,
      stepId,
      version,
      emittedAt: nowIso(),
      checksum: shortHash(stableStringify(value), 16),
      value
    };
    this.persist(context);
    return context.documents[key];
  }

  getDocument(context, name) {
    return context.documents[slugify(name)] || null;
  }

  getDocumentValue(context, name) {
    const doc = this.getDocument(context, name);
    return doc ? doc.value : undefined;
  }

  markStepComplete(context, item) {
    const key = this.itemKey(item);
    if (!context.checkpoint.completedStepIds.includes(key)) {
      context.checkpoint.completedStepIds.push(key);
    }
    context.checkpoint.currentIndex = context.checkpoint.completedStepIds.length;
    this.persist(context);
  }

  itemKey(item) {
    return item.type === 'stage' ? `stage:${item.order}` : `step:${item.id}`;
  }

  isCompleted(context, item) {
    return context.checkpoint.completedStepIds.includes(this.itemKey(item));
  }

  recordStep(context, record) {
    context.steps.push(record);
    this.persist(context);
  }

  recordStage(context, record) {
    context.stages.push(record);
    this.persist(context);
  }

  setGateResult(context, gateLabel, passed) {
    context.gates[gateLabel] = { passed, at: nowIso() };
    this.persist(context);
  }

  addMetric(context, bucket, key, value) {
    if (!context.metrics[bucket]) context.metrics[bucket] = {};
    if (context.metrics[bucket][key] === undefined) context.metrics[bucket][key] = 0;
    context.metrics[bucket][key] += value;
  }

  finalize(context, status) {
    context.status = status;
    context.finishedAt = nowIso();
    this.persist(context);
  }

  writeSummary(context) {
    const summary = {
      runId: context.runId,
      workflowId: context.workflowId,
      parentRunId: context.parentRunId,
      status: context.status,
      startedAt: context.startedAt,
      finishedAt: context.finishedAt,
      seed: context.seed,
      input: context.input,
      documents: Object.fromEntries(
        Object.entries(context.documents).map(([k, d]) => [k, { version: d.version, checksum: d.checksum, workflowId: d.workflowId, stepId: d.stepId }])
      ),
      steps: context.steps,
      stages: context.stages,
      gates: context.gates,
      metrics: context.metrics
    };
    context.summary = summary;
    writeJson(path.join(this._runDir(context.runId), 'summary.json'), summary);
    writeJson(path.join(this._runDir(context.runId), 'metrics.json'), context.metrics);
    this.persist(context);
    return summary;
  }

  _newRunId(workflowId) {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${slugify(workflowId)}-${ts}-${rand}`;
  }

  _freshMetrics() {
    return {
      agentRuns: {},
      stepDurationsMs: {},
      stageDurationsMs: {},
      retries: {},
      validations: { inputs: 0, outputs: 0, failures: 0 },
      cache: { hits: 0, misses: 0 },
      memoryOps: 0,
      gates: { passed: 0, failed: 0 },
      documentsEmitted: 0,
      externalSteps: 0,
      unavailableStages: 0
    };
  }
}

export function createContextManager(opts) {
  return new ContextManager(opts);
}
