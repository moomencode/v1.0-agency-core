import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Validator } from '../runtime/validator.js';
import { ArtifactManager, docToMarkdown } from './manager.js';
import { buildRunReport, buildSeoReport, buildWebsiteConfig, buildProposal, buildUxAudit, buildBrandDocument, buildContract, WORKFLOW_BUILDERS } from './builders.js';
import { ARTIFACT_TYPES, TYPE_LABELS } from './formats.js';
import { artError, ART_CODES } from './errors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class ArtifactSystem {
  constructor({ root = ROOT, sweeperMs = 60000, validate = true } = {}) {
    this.root = root;
    this.validate = validate;
    this.artifactSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts', 'schemas', 'artifact.schema.json'), 'utf8'));
    this.validator = new Validator({ schemasDir: path.join(root, 'schemas') });
    this.manager = new ArtifactManager({ root, sweeperMs });
    this.builders = { buildRunReport, buildSeoReport, buildWebsiteConfig, buildProposal, buildUxAudit, buildBrandDocument, buildContract };
    this.types = ARTIFACT_TYPES;
    this.typeLabels = TYPE_LABELS;
  }

  create(opts = {}) {
    const record = this.manager.create(opts);
    if (this.validate) {
      const check = this.validator.validate(record, this.artifactSchema, { schemaPath: 'artifacts:record' });
      if (!check.valid) {
        try {
          this.manager.remove(record.id);
        } catch {
          /* best effort rollback */
        }
        throw artError(ART_CODES.SCHEMA_INVALID, 'artifact record failed schema validation', { errors: check.errors.slice(0, 10) });
      }
    }
    return record;
  }

  fromDocument(document, opts = {}) {
    return this.manager.fromDocument(document, opts);
  }

  async captureRun(runResult, { projectId = 'unassigned', documents = null, markdown = true, runReport = true, builders = WORKFLOW_BUILDERS } = {}) {
    const docMap = documents ?? runResult.documents ?? {};
    const created = [];
    for (const [name, value] of Object.entries(docMap)) {
      const workflowId = runResult.workflowId ?? 'manual';
      const builderDef = builders[workflowId];
      const source = {
        name,
        value: typeof value === 'object' && value !== null && 'value' in value ? value.value : value,
        workflowId,
        runId: runResult.runId ?? null,
        stepId: typeof value === 'object' && value !== null ? value.stepId ?? null : null,
        checksum: typeof value === 'object' && value !== null ? value.checksum ?? null : null,
        title: name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      };
      const type = builderDef?.type ?? 'document';
      const record = this.manager.fromDocument(source, { format: 'json', type, projectId });
      created.push(record);
      if (markdown && builderDef?.builder) {
        const md = String(builderDef.builder(source, source.value));
        created.push(
          this.manager.create({
            name: `${name}-report`,
            type,
            format: 'markdown',
            content: md,
            workflowId,
            runId: runResult.runId ?? null,
            sourceDocument: name,
            title: `${source.title} (Report)`,
            generatedBy: 'artifact-engine',
            projectId
          })
        );
      } else if (markdown) {
        created.push(
          this.manager.create({
            name,
            type,
            format: 'markdown',
            content: docToMarkdown(source, source.value),
            workflowId,
            runId: runResult.runId ?? null,
            sourceDocument: name,
            title: source.title,
            generatedBy: 'artifact-engine',
            projectId
          })
        );
      }
    }
    if (runReport) {
      const md = buildRunReport(runResult);
      created.push(
        this.manager.create({
          name: `${runResult.workflowId ?? 'run'}-run-report`,
          type: 'report',
          format: 'markdown',
          content: md,
          workflowId: runResult.workflowId ?? 'manual',
          runId: runResult.runId ?? null,
          title: 'Run Report',
          generatedBy: 'artifact-engine',
          projectId
        })
      );
    }
    return { runId: runResult.runId, workflowId: runResult.workflowId, created };
  }

  attachRuntime(runtime, opts = {}) {
    const sys = this;
    const origRun = runtime.run.bind(runtime);
    runtime.run = async (workflowId, input, runOpts = {}) => {
      const result = await origRun(workflowId, input, runOpts);
      await sys.captureRun(result, opts).catch(() => {});
      return result;
    };
    return runtime;
  }

  cleanup(opts = {}) {
    return this.manager.cleanup(opts);
  }

  stats() {
    return {
      types: this.types,
      labels: this.typeLabels,
      manager: this.manager.statsSnapshot()
    };
  }

  close() {
    this.manager.close();
  }
}

export function createArtifactSystem(opts = {}) {
  return new ArtifactSystem(opts);
}
