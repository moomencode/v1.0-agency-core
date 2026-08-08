import { shortHash } from '../utils.js';

export class PipelineAdapter {
  constructor({ pipeline = null } = {}) {
    this.pipeline = pipeline;
  }

  runIdFor(businessId) {
    return `run-${shortHash(businessId, 10)}-website-production`;
  }

  async run({ dossier, businessId }) {
    if (!this.pipeline) throw new Error('pipeline adapter requires a PipelineRunner');
    const runId = this.runIdFor(businessId);
    const ctx = await this.pipeline.run(dossier, {
      runId,
      resume: true,
      businessId,
      pipelineId: 'website-production'
    });
    if (ctx.status !== 'ready') {
      throw new Error(`pipeline failed for "${businessId}": ${(ctx.error && ctx.error.message) || ctx.failedStage || 'unknown'}`);
    }
    return ctx;
  }
}
