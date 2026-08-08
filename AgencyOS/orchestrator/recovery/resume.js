import fs from 'node:fs';
import path from 'node:path';
import { executionIdFor } from '../utils.js';
import { isTerminal } from '../state/machine.js';
import { entryStateFor } from '../workflow/steps.js';

export class RecoveryManager {
  constructor({ checkpoint = null, locks = null, audit = null, events = null, campaigns = null } = {}) {
    this.checkpoint = checkpoint;
    this.locks = locks;
    this.audit = audit;
    this.events = events;
    this.campaigns = campaigns;
  }

  async boot() {
    const summary = { campaigns: 0, executionsScanned: 0, waiting: 0, resumable: 0, terminal: 0, staleLocks: 0 };
    if (!this.checkpoint || !this.checkpoint.root) return summary;
    const stale = this.locks ? this.locks.breakStale() : 0;
    summary.staleLocks = stale;

    const campaignFiles = [];
    const campaignsDir = path.join(this.checkpoint.root, 'campaigns');
    if (fs.existsSync(campaignsDir)) {
      for (const f of fs.readdirSync(campaignsDir)) {
        if (f.endsWith('.json')) campaignFiles.push(f);
      }
    }

    for (const file of campaignFiles) {
      const campaign = this.campaigns.load(file.replace(/\.json$/, ''));
      if (!campaign) continue;
      summary.campaigns++;
      if (isTerminal(campaign.state) || campaign.state === 'DRAFT') continue;
      for (const meta of campaign.executions || []) {
        summary.executionsScanned++;
        const executionId = executionIdFor(campaign.id, meta.businessId, campaign.workflowVersion);
        const execution = this.checkpoint.load(executionId);
        if (!execution) continue;
        const resumableFailure =
          execution.status === 'FAILED' && execution.error && ['TRANSIENT', 'SYSTEM'].includes(execution.error.class);
        if (isTerminal(execution.status) && !resumableFailure) {
          summary.terminal++;
          continue;
        }
        if (['ESCALATED', 'AWAITING_APPROVAL', 'QA_FAILED'].includes(execution.status)) {
          summary.waiting++;
          continue;
        }
        if (resumableFailure) {
          execution.status = entryStateFor(execution.stepIndex) || 'CREATED';
          execution.error = { ...execution.error, resumedAt: new Date().toISOString() };
          this.checkpoint.save(execution);
          this.campaigns?.markExecutionResumed?.(campaign.id, execution);
          summary.resumable++;
          this.audit?.append({ action: 'boot_resume_marked', executionId, class: execution.error.class });
          continue;
        }
        if (execution.status === 'FAILED') {
          summary.terminal++;
          continue;
        }
        execution.status = entryStateFor(execution.stepIndex) || 'CREATED';
        this.checkpoint.save(execution);
        this.campaigns?.markExecutionResumed?.(campaign.id, execution);
        summary.resumable++;
      }
    }
    this.audit?.append({ action: 'boot_recovery', ...summary });
    return summary;
  }
}

export function createRecoveryManager(opts = {}) {
  return new RecoveryManager(opts);
}
