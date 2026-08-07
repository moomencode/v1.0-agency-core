import { deliveryError, DEL_CODES } from '../errors.js';
import { applyTransition, DEPLOY_EVENTS } from '../deployment/state.js';
import { deliveryRetry, pollUntil } from '../deployment/retry.js';
import { DEPLOY_MODES } from '../deployment/manager.js';
import { redact } from '../security/redaction.js';

export class RollbackManager {
  constructor({ root, store, manager, packaging, qa, logger = null, vault = null, artifacts = null, memory = null }) {
    this.root = root;
    this.store = store;
    this.manager = manager;
    this.packaging = packaging;
    this.qa = qa;
    this.logger = logger;
    this.vault = vault;
    this.artifacts = artifacts;
    this.memory = memory;
  }

  _providerFor(record) {
    return this.manager.registry.get(record.provider, { config: record.target, ctx: this.manager._providerCtx() });
  }

  _previousRecord(record, explicitBuildId) {
    if (explicitBuildId) {
      return this.store.load(explicitBuildId.startsWith('dep_') ? explicitBuildId : `dep_${explicitBuildId}`);
    }
    const candidates = this.store
      .list(record.businessId)
      .filter((r) => r.id !== record.id)
      .filter((r) => r.status === 'recorded' || r.status === 'verified' || r.status === 'deployed')
      .filter((r) => r.deployment && r.deployment.id)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1));
    if (candidates.length === 0) {
      throw deliveryError(DEL_CODES.ROLLBACK_INVALID, `no previous recorded deployment for business "${record.businessId}"`, {
        businessId: record.businessId,
        retryable: false
      });
    }
    return candidates[0];
  }

  _verifyPrevious(buildId) {
    const manifest = this.packaging.loadManifest(buildId);
    const qaReport = this.qa.loadReport(buildId);
    if (!qaReport || !qaReport.passed) {
      throw deliveryError(DEL_CODES.QA_FAILED, `previous package "${buildId}" fails QA gate — rollback blocked`, { buildId, retryable: false });
    }
    const actualSha = this.packaging.bundleSha256(buildId);
    if (actualSha !== manifest.bundle.sha256) {
      throw deliveryError(DEL_CODES.PACKAGE_MISSING, `previous package "${buildId}" checksum mismatch — rollback blocked`, { buildId, retryable: false });
    }
  }

  approveRollback(recordId, { by = 'operator', note = null } = {}) {
    const record = this.store.load(recordId);
    const approval = { approved: true, by, note: note || null, at: new Date().toISOString() };
    record.rollbackApproval = approval;
    record.revertApproval = approval;
    this.store.save(record);
    return record;
  }

  async rollback({ recordId, by = 'operator', note = null, previousBuildId = null, mode = 'dry-run' } = {}) {
    const record = this.store.load(recordId);
    if (!['deployed', 'verified', 'recorded'].includes(record.status)) {
      throw deliveryError(DEL_CODES.ROLLBACK_INVALID, `record "${record.id}" cannot be rolled back from state ${record.status}`, {
        recordId: record.id,
        status: record.status,
        retryable: false
      });
    }
    if (!DEPLOY_MODES.includes(mode)) {
      throw deliveryError(DEL_CODES.BAD_MODE, `unknown rollback mode "${mode}"`, { known: DEPLOY_MODES, retryable: false });
    }
    if (mode === 'auto' && !this.manager.autoAllowed) {
      throw deliveryError(DEL_CODES.AUTO_DISABLED, 'auto mode is disabled (set DELIVERY_AUTO_ALLOWED=true to enable)', { retryable: false });
    }
    if (mode === 'explicit' && (!record.rollbackApproval || record.rollbackApproval.approved !== true)) {
      throw deliveryError(DEL_CODES.APPROVAL_REQUIRED, `rollback of "${record.id}" requires explicit approval via approveRollback`, {
        recordId: record.id,
        retryable: false
      });
    }

    const previous = this._previousRecord(record, previousBuildId);
    const prevBuildId = previous.trace.buildId;
    this._verifyPrevious(prevBuildId);
    const provider = this._providerFor(record);

    applyTransition(record, DEPLOY_EVENTS.ROLLBACK_START, {
      actor: by,
      note: note || `rollback to previous deployment ${previous.deployment.id} (${prevBuildId})`,
      mode
    });
    this.store.save(record);

    try {
      if (mode === 'dry-run') {
        record.dryRun = await provider.dryRun({ packageId: prevBuildId });
      } else {
        const promoted = (await deliveryRetry(() => provider.promote(previous.deployment.id), {
          ...this.manager.retryConfig,
          onAttempt: ({ attempt }) => {
            applyTransition(record, DEPLOY_EVENTS.RETRY, { actor: 'manager', note: `promote attempt ${attempt + 1}` });
          }
        })).result;
        const verified = await pollUntil(
          () => provider.verify(previous.deployment.id),
          { maxAttempts: 10, initialDelayMs: 25, predicate: (v) => v && v.status === 'READY' }
        );
        if (!verified || verified.status !== 'READY') {
          throw deliveryError(DEL_CODES.PROVIDER_ERROR, `rollback verification did not reach READY (last: ${verified?.status})`, { retryable: false });
        }
        record.rollback = {
          recordId: previous.id,
          deploymentId: previous.deployment.id,
          buildId: prevBuildId,
          url: previous.deployment.url,
          mode,
          promoted: promoted.deploymentId || previous.deployment.id,
          completedAt: new Date().toISOString()
        };
      }
      applyTransition(record, DEPLOY_EVENTS.ROLLBACK_OK, { actor: by, note: `rolled back to ${prevBuildId}`, mode });
      this.store.save(record);
      this.memory?.record?.({ action: 'rollback', record });
      this.artifacts?.writeRecord?.({ kind: 'rollback', record, previousBuildId: prevBuildId });
      this.logger?.info?.(`delivery rollback: ${record.id} -> ${prevBuildId} (${mode})`);
      return { original: record, previous };
    } catch (err) {
      applyTransition(record, DEPLOY_EVENTS.ABORT, { actor: by, note: `rollback failed: ${err.message}` });
      record.rollback = { recordId: previous.id, buildId: prevBuildId, mode, error: redact(err.message, { vault: this.vault }) };
      this.store.save(record);
      throw err;
    }
  }

  async revert({ recordId, by = 'operator', note = null, mode = 'dry-run' } = {}) {
    const record = this.store.load(recordId);
    if (record.status !== 'rolled_back') {
      throw deliveryError(DEL_CODES.ROLLBACK_INVALID, `record "${recordId}" is not rolled_back (got ${record.status})`, { recordId, status: record.status, retryable: false });
    }
    if (!DEPLOY_MODES.includes(mode)) {
      throw deliveryError(DEL_CODES.BAD_MODE, `unknown revert mode "${mode}"`, { known: DEPLOY_MODES, retryable: false });
    }
    if (mode === 'auto' && !this.manager.autoAllowed) {
      throw deliveryError(DEL_CODES.AUTO_DISABLED, 'auto mode is disabled (set DELIVERY_AUTO_ALLOWED=true to enable)', { retryable: false });
    }
    if (mode === 'explicit' && (!record.revertApproval || record.revertApproval.approved !== true)) {
      throw deliveryError(DEL_CODES.APPROVAL_REQUIRED, `revert of "${recordId}" requires explicit approval`, { recordId, retryable: false });
    }

    const provider = this._providerFor(record);
    applyTransition(record, DEPLOY_EVENTS.REVERT_START, { actor: by, note: note || `re-promote deployment ${record.deployment?.id}`, mode });
    this.store.save(record);

    try {
      if (mode === 'dry-run') {
        record.dryRun = await provider.dryRun({ packageId: record.trace.buildId });
      } else {
        await deliveryRetry(() => provider.promote(record.deployment.id), {
          ...this.manager.retryConfig,
          onAttempt: ({ attempt }) => {
            applyTransition(record, DEPLOY_EVENTS.RETRY, { actor: 'manager', note: `revert attempt ${attempt + 1}` });
          }
        });
        const verified = await pollUntil(
          () => provider.verify(record.deployment.id),
          { maxAttempts: 10, initialDelayMs: 25, predicate: (v) => v && v.status === 'READY' }
        );
        if (!verified || verified.status !== 'READY') {
          throw deliveryError(DEL_CODES.PROVIDER_ERROR, `revert verification did not reach READY (last: ${verified?.status})`, { retryable: false });
        }
        record.revertedTo = record.deployment.id;
      }
      applyTransition(record, DEPLOY_EVENTS.REVERT_OK, { actor: by, note: `reverted to ${record.deployment?.id}`, mode });
      this.store.save(record);
      this.memory?.record?.({ action: 'revert', record });
      this.logger?.info?.(`delivery revert: ${recordId} (${mode})`);
      return record;
    } catch (err) {
      applyTransition(record, DEPLOY_EVENTS.ABORT, { actor: by, note: `revert failed: ${err.message}` });
      this.store.save(record);
      throw err;
    }
  }
}
