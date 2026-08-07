import { DELIVERY_EVENTS } from './events.js';
import { deliveryError, DEL_CODES } from '../errors.js';

export const DELIVERY_ACTIONS = {
  DEPLOY: 'delivery.deploy',
  ROLLBACK: 'delivery.rollback'
};

export class DeliveryCapability {
  constructor({ delivery = null, logger = null } = {}) {
    this.delivery = delivery;
    this.logger = logger;
  }

  register(brain) {
    if (!brain) return this;
    brain.registerExecutor(DELIVERY_ACTIONS.DEPLOY, async ({ recordId, buildId, mode = 'dry-run', provider = 'local', target = {} } = {}) => {
      if (!this.delivery) {
        throw deliveryError(DEL_CODES.CONFIG_INVALID, 'delivery facade not wired into capability', { retryable: false });
      }
      let record = null;
      if (recordId) {
        record = this.delivery.getRecord(recordId);
        if (!record) {
          throw deliveryError(DEL_CODES.UNKNOWN_RECORD, `unknown deployment record ${recordId}`, { retryable: false });
        }
        this.delivery.emit?.(DELIVERY_EVENTS.DEPLOY_REQUESTED, { recordId });
        if (mode === 'dry-run') return record;
        return this.delivery.deploy(recordId);
      }
      record = await this.delivery.deliver({ buildId, mode, provider, target });
      this.delivery.emit?.(DELIVERY_EVENTS.DEPLOY_REQUESTED, { recordId: record.id, mode });
      return record;
    });
    brain.registerExecutor(DELIVERY_ACTIONS.ROLLBACK, async ({ recordId, mode = 'dry-run', by = 'brain' } = {}) => {
      if (!this.delivery) {
        throw deliveryError(DEL_CODES.CONFIG_INVALID, 'delivery facade not wired into capability', { retryable: false });
      }
      const result = await this.delivery.rollback({ recordId, mode, by });
      this.delivery.emit?.(DELIVERY_EVENTS.ROLLED_BACK, { recordId, rollbackRecordId: result.original.id });
      return result;
    });
    return this;
  }
}
