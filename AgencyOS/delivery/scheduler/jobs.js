import { deliveryError, DEL_CODES } from '../errors.js';

export function deploymentJobSpec({ recordId, at, name = null }) {
  return {
    id: `delivery-${recordId}`,
    name: name || `deployment-${recordId}`,
    handler: 'delivery.deploy',
    input: { recordId },
    schedule: { at },
    priority: 8,
    timeoutMs: 60000
  };
}

export class DeliveryScheduler {
  constructor({ scheduler = null, manager = null, logger = null } = {}) {
    this.scheduler = scheduler;
    this.manager = manager;
    this.logger = logger;
  }

  attach() {
    if (!this.scheduler) return this;
    this.scheduler.registerHandler('delivery.deploy', async (job, ctx) => {
      const recordId = job.input?.recordId;
      if (!recordId) {
        throw deliveryError(DEL_CODES.CONFIG_INVALID, 'delivery job missing input.recordId', { jobId: job.id, retryable: false });
      }
      return this.manager.executeDeploy(recordId);
    });
    return this;
  }

  schedule({ recordId, at }) {
    if (!this.scheduler) return null;
    return this.scheduler.registerJob(deploymentJobSpec({ recordId, at }));
  }
}
