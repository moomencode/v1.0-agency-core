import { redact } from '../security/redaction.js';

export class DeliveryArtifacts {
  constructor({ artifacts = null, vault = null, logger = null } = {}) {
    this.artifacts = artifacts;
    this.vault = vault;
    this.logger = logger;
  }

  writeRecord({ kind = 'deployment', record, previousBuildId = null } = {}) {
    if (!this.artifacts) return null;
    const safe = redact(record, { vault: this.vault });
    const title =
      kind === 'rollback'
        ? `Rollback deployment ${record.id} -> ${previousBuildId}`
        : `Deployment record ${record.id}`;
    const summary =
      kind === 'rollback'
        ? `Deployment ${record.id} rolled back to previous package ${previousBuildId} (${record.mode})`
        : `Deployment ${record.id} for ${record.businessId} finished ${record.status} (${record.mode}, ${record.provider})`;
    try {
      return this.artifacts.create({
        name: `${kind}-${record.id}`,
        type: 'deployment-report',
        format: 'json',
        content: safe,
        projectId: record.businessId,
        workflowId: 'delivery',
        runId: record.trace?.pipelineRunId || null,
        stepId: kind === 'rollback' ? 'rollback' : 'deploy',
        title,
        summary,
        tags: ['delivery', 'deployment', kind, record.mode],
        generatedBy: 'delivery'
      });
    } catch (err) {
      this.logger?.warn?.(`delivery artifact write failed: ${err.message}`);
      return null;
    }
  }

  writeQaReport({ buildId, qaReport }) {
    if (!this.artifacts) return null;
    try {
      return this.artifacts.create({
        name: `qa-${buildId}`,
        type: 'qa-report',
        format: 'json',
        content: qaReport,
        projectId: qaReport.businessId,
        workflowId: 'delivery',
        runId: null,
        stepId: 'qa',
        title: `Final QA report ${buildId}`,
        summary: `${qaReport.totals.checks} checks, ${qaReport.totals.failed} failed — ${qaReport.passed ? 'PASS' : 'FAIL'}`,
        tags: ['delivery', 'qa', qaReport.passed ? 'pass' : 'fail'],
        generatedBy: 'delivery'
      });
    } catch (err) {
      this.logger?.warn?.(`delivery qa artifact write failed: ${err.message}`);
      return null;
    }
  }
}
