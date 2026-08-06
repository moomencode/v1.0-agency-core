import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, writeJson, readJson } from './utils.js';
import { typedError, CODES } from './errors.js';
import { EventBus, EVENTS } from './eventBus.js';
import { Logger } from './logger.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class WorkflowRunner {
  constructor({ root = ROOT, resolver = null, stepExecutor = null, contextManager = null, bus = null, logger = null } = {}) {
    this.root = root;
    this.resolver = resolver;
    this.stepExecutor = stepExecutor;
    this.contextManager = contextManager;
    this.bus = bus;
    this.logger = logger;
  }

  _runBus(context) {
    const runLogger = new Logger({ runId: context.runId, root: this.root });
    const runBus = new EventBus(runLogger);
    const originalEmit = runBus.emitEvent.bind(runBus);
    runBus.emitEvent = (event, meta = {}, detail = null) => {
      runLogger.info(event, detail, meta);
      runBus.emitter.emit(event, { event, ...meta, detail, ts: new Date().toISOString() });
      if (this.bus) this.bus.emitEvent(event, meta, detail);
    };
    void originalEmit;
    return { runBus, runLogger };
  }

  async run(workflowId, input = {}, { runId = null, seed = null, resume = true, nested = false, parentRunId = null, strict = false } = {}) {
    const workflow = this.resolver.loadWorkflow(workflowId);
    if (!workflow) {
      if (strict) throw typedError(CODES.STATE_UNKNOWN_WORKFLOW, `workflow not registered: ${workflowId}`, { workflowId });
      return {
        runId: runId || null,
        workflowId,
        status: 'unavailable',
        reason: 'workflow-not-registered',
        documents: {},
        steps: [],
        stages: [],
        metrics: {}
      };
    }

    let context = null;
    if (resume && runId) {
      context = this.contextManager.load(runId);
      if (context && context.status === 'completed' && context.summary) {
        return this._existingResult(context);
      }
    }
    if (!context) {
      context = this.contextManager.create({
        workflowId: workflow.id,
        input,
        options: { runId, seed, nested, parentRunId, strict }
      });
    }
    if (seed !== null && !resume) context.seed = seed;

    const { runBus, runLogger } = this._runBus(context);

    runBus.emitEvent(EVENTS.RUN_STARTED, { runId: context.runId, workflowId: workflow.id, nested, parentRunId }, { seed: context.seed });

    if (workflow.entryDocument) {
      const existing = this.contextManager.getDocumentValue(context, workflow.entryDocument);
      if (existing === undefined) {
        this.contextManager.setDocument(context, workflow.entryDocument, input, { stepId: 'entry', workflowId: workflow.id });
      }
    }

    const plan = this.resolver.plan(workflow);
    let status = 'running';

    try {
      for (const item of plan) {
        if (this.contextManager.isCompleted(context, item)) continue;
        const result = item.type === 'stage'
          ? await this.stepExecutor.executeStage(item, context, { bus: runBus, logger: runLogger })
          : await this.stepExecutor.executeStep(item, context, workflow, { bus: runBus, logger: runLogger });

        if (result.blocked) {
          status = 'blocked';
          break;
        }
        if (result.status === 'failed') {
          status = 'failed';
          break;
        }
      }
      if (status === 'running') status = 'completed';
    } catch (err) {
      status = 'failed';
      context.error = { code: err.code, message: err.message, meta: err.meta };
      runBus.emitEvent(EVENTS.RUN_ABORTED, { runId: context.runId, workflowId: workflow.id }, { code: err.code, message: err.message });
    }

    this.contextManager.finalize(context, status);
    const summary = this.contextManager.writeSummary(context);

    this._writeArtifacts(context);
    this._recordIndex(context);

    if (status === 'blocked') {
      runBus.emitEvent(EVENTS.RUN_PAUSED, { runId: context.runId, workflowId: workflow.id }, { gates: context.gates });
    } else if (status === 'completed') {
      runBus.emitEvent(EVENTS.RUN_COMPLETED, { runId: context.runId, workflowId: workflow.id }, { steps: context.steps.length, stages: context.stages.length });
    }

    await runLogger.close();

    return {
      runId: context.runId,
      workflowId: workflow.id,
      status,
      summary,
      documents: this._valuesMap(context),
      workflowExitDocumentName: workflow.exitDocument || null,
      steps: context.steps,
      stages: context.stages,
      metrics: context.metrics,
      error: context.error || null
    };
  }

  _existingResult(context) {
    return {
      runId: context.runId,
      workflowId: context.workflowId,
      status: context.status,
      alreadyCompleted: true,
      summary: context.summary,
      documents: this._valuesMap(context),
      workflowExitDocumentName: context.summary?.exitDocument || null,
      steps: context.steps,
      stages: context.stages,
      metrics: context.metrics,
      error: null
    };
  }

  _valuesMap(context) {
    const map = {};
    for (const [key, doc] of Object.entries(context.documents || {})) {
      map[key] = doc.value;
    }
    return map;
  }

  _writeArtifacts(context) {
    const dir = ensureDir(path.join(this.root, 'storage', 'artifacts', 'runs', context.runId));
    for (const [key, doc] of Object.entries(context.documents || {})) {
      writeJson(path.join(dir, `${key}.json`), {
        name: key,
        version: doc.version,
        checksum: doc.checksum,
        workflowId: doc.workflowId,
        stepId: doc.stepId,
        value: doc.value
      });
    }
    writeJson(path.join(dir, 'run-meta.json'), {
      runId: context.runId,
      workflowId: context.workflowId,
      status: context.status,
      startedAt: context.startedAt,
      finishedAt: context.finishedAt,
      seed: context.seed
    });
  }

  _recordIndex(context) {
    const indexFile = path.join(this.root, 'storage', 'indexes', 'runs.json');
    const index = readJson(indexFile, []);
    index.push({
      runId: context.runId,
      workflowId: context.workflowId,
      status: context.status,
      startedAt: context.startedAt,
      finishedAt: context.finishedAt,
      nested: context.nested,
      parentRunId: context.parentRunId,
      seed: context.seed
    });
    writeJson(indexFile, index);
  }
}

export function createWorkflowRunner(opts) {
  return new WorkflowRunner(opts);
}
