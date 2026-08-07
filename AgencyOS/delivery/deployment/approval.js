import { applyTransition, DEPLOY_EVENTS, canTransition } from './state.js';
import { deliveryError, DEL_CODES } from '../errors.js';
import { redact } from '../security/redaction.js';

export class ApprovalGate {
  constructor({ store, logger = null, vault = null } = {}) {
    this.store = store;
    this.logger = logger;
    this.vault = vault;
  }

  _requirePending(record) {
    if (record.status !== 'awaiting_approval') {
      throw deliveryError(DEL_CODES.APPROVAL_NOT_PENDING, `record "${record.id}" is not awaiting approval (status ${record.status})`, { recordId: record.id, status: record.status });
    }
  }

  approve(recordId, { by = 'unknown', note = null } = {}) {
    const record = this.store.load(recordId);
    this._requirePending(record);
    if (!by || typeof by !== 'string') {
      throw deliveryError(DEL_CODES.CONFIG_INVALID, 'approval requires an actor "by"', { retryable: false });
    }
    if (!canTransition(record.status, DEPLOY_EVENTS.APPROVED)) {
      throw deliveryError(DEL_CODES.BAD_STATE, `cannot approve record in state ${record.status}`);
    }
    record.approvals = record.approvals || [];
    record.approvals.push({ approved: true, by, note: note || null, at: new Date().toISOString() });
    applyTransition(record, DEPLOY_EVENTS.APPROVED, { actor: by, note: note || 'approval granted', mode: record.mode });
    this.store.save(record);
    this.logger?.info?.(`delivery approval: ${recordId} approved by ${by}`);
    return record;
  }

  reject(recordId, { by = 'unknown', note = null } = {}) {
    const record = this.store.load(recordId);
    this._requirePending(record);
    if (!canTransition(record.status, DEPLOY_EVENTS.REJECTED)) {
      throw deliveryError(DEL_CODES.BAD_STATE, `cannot reject record in state ${record.status}`);
    }
    record.approvals = record.approvals || [];
    record.approvals.push({ approved: false, by, note: note || null, at: new Date().toISOString() });
    applyTransition(record, DEPLOY_EVENTS.REJECTED, { actor: by, note: note || 'approval rejected', mode: record.mode });
    this.store.save(record);
    this.logger?.info?.(`delivery approval: ${recordId} rejected by ${by}`);
    return redact(record, { vault: this.vault });
  }
}
