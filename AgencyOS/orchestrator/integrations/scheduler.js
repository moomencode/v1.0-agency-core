export const CAMPAIGN_JOB_ID = (campaignId) => `campaign-${campaignId}`;
export const CAMPAIGN_HANDLER = 'orchestrator.campaign';

export class SchedulerAdapter {
  constructor({ scheduler = null } = {}) {
    this.scheduler = scheduler;
  }

  registerHandler(name, fn) {
    if (!this.scheduler) return;
    this.scheduler.registerHandler(name, fn);
  }

  scheduleCampaign({ campaignId, action = 'start', schedule = null }) {
    if (!this.scheduler) return null;
    const spec = {
      id: CAMPAIGN_JOB_ID(campaignId),
      name: `campaign:${campaignId}`,
      handler: CAMPAIGN_HANDLER,
      input: { campaignId, action },
      schedule: schedule || { intervalMs: 0 },
      priority: 5,
      maxAttempts: 3,
      retryDelayMs: 200,
      backoff: 'exponential',
      timeoutMs: 60000,
      enabled: schedule ? true : false
    };
    return this.scheduler.registerJob(spec);
  }

  trigger(campaignId, action = 'start') {
    if (!this.scheduler) return null;
    return this.scheduler.trigger(CAMPAIGN_JOB_ID(campaignId), { campaignId, action });
  }

  pause(campaignId) {
    if (!this.scheduler) return;
    try {
      this.scheduler.pause(CAMPAIGN_JOB_ID(campaignId));
    } catch {
      /* job may not exist */
    }
  }

  resume(campaignId) {
    if (!this.scheduler) return;
    try {
      this.scheduler.resume(CAMPAIGN_JOB_ID(campaignId));
    } catch {
      /* job may not exist */
    }
  }

  remove(campaignId) {
    if (!this.scheduler) return;
    try {
      this.scheduler.removeJob(CAMPAIGN_JOB_ID(campaignId));
    } catch {
      /* job may not exist */
    }
  }

  update(campaignId, patch) {
    if (!this.scheduler) return;
    return this.scheduler.updateJob(CAMPAIGN_JOB_ID(campaignId), patch);
  }
}
