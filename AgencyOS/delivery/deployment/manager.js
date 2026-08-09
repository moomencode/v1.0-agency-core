import fs from 'node:fs';
import path from 'node:path';
import { deliveryError, DEL_CODES } from '../errors.js';
import { recordIdFor, ensureDir, assertBuildId, buildIdFrom } from '../utils.js';
import { applyTransition, DEPLOY_EVENTS, canTransition } from './state.js';
import { ApprovalGate } from './approval.js';
import { buildDryRunReport } from './dryrun.js';
import { deliveryRetry, pollUntil } from './retry.js';
import { redact, redactText } from '../security/redaction.js';

export const DEPLOY_MODES = ['dry-run', 'explicit', 'auto'];

export class DeploymentManager {
  constructor({
    root,
    store,
    builds,
    qa,
    packaging,
    registry,
    validator = null,
    schemas = {},
    logger = null,
    vault = null,
    autoAllowed = false,
    retryConfig = { maxAttempts: 3, initialDelayMs: 50 },
    events = null
  } = {}) {
    this.root = root;
    this.store = store;
    this.builds = builds;
    this.qa = qa;
    this.packaging = packaging;
    this.registry = registry;
    this.validator = validator;
    this.schemas = schemas;
    this.logger = logger;
    this.vault = vault;
    this.autoAllowed = Boolean(autoAllowed);
    this.retryConfig = retryConfig;
    this.events = events;
    this.artifacts = null;
    this.memory = null;
    this.auditDir = path.join(root, 'logs', 'delivery');
  }

  setIntegrations({ artifacts = null, memory = null } = {}) {
    this.artifacts = artifacts;
    this.memory = memory;
    return this;
  }

  setHttp(http) {
    this.http = http;
    return this;
  }

  _audit(entry) {
    try {
      const day = new Date().toISOString().slice(0, 10);
      ensureDir(this.auditDir);
      fs.appendFileSync(path.join(this.auditDir, `${day}.ndjson`), `${JSON.stringify(redact(entry, { vault: this.vault }))}\n`);
    } catch {
      /* audit is best effort */
    }
  }

  _schemaValidate(record, schemaName) {
    const schema = this.schemas[schemaName];
    if (!this.validator || !schema) return;
    const result = this.validator.validate(record, schema, { schemaPath: `delivery:${schemaName}` });
    if (!result.valid) {
      throw deliveryError(DEL_CODES.SCHEMA_INVALID, `deployment record failed ${schemaName} schema validation`, {
        errors: result.errors.slice(0, 10),
        retryable: false
      });
    }
  }

  _providerCtx() {
    return { root: this.root, secrets: this.vault, logger: this.logger, http: this.http };
  }

  _packageInfoFor(buildId) {
    const buildRecord = this.builds.loadBuild(buildId);
    const manifest = this.packaging.loadManifest(buildId);
    const bundlePath = this.packaging.bundlePath(buildId);
    const tree = this.builds.readTree(buildId);
    return { packageId: buildId, bundlePath, manifest, tree, businessId: buildRecord.businessId };
  }

  _finalizeRecord(record) {
    try {
      this.artifacts?.writeRecord?.({ kind: 'deployment', record });
      const qaReport = this.qa?.loadReport?.(record.trace.buildId);
      if (qaReport) {
        this.artifacts?.writeQaReport?.({ buildId: record.trace.buildId, qaReport });
      }
      this.memory?.record?.(record);
    } catch (err) {
      this.logger?.warn?.(`delivery finalize integration failed: ${err?.message}`);
    }
    this.events?.emit?.('delivery.deployed', { recordId: record.id, businessId: record.businessId, status: record.status });
    this._audit({ action: 'finalized', recordId: record.id, status: record.status });
  }

  _fail(record, note, code) {
    if (canTransition(record.status, DEPLOY_EVENTS.ABORT)) {
      applyTransition(record, DEPLOY_EVENTS.ABORT, { actor: 'manager', note: redactText(note, { vault: this.vault }) });
    }
    record.error = redact({ code, note }, { vault: this.vault });
    this.store.save(record);
    this.events?.emit?.('delivery.failed', { recordId: record.id, businessId: record.businessId, error: record.error });
    this._audit({ action: 'failed', recordId: record.id, status: record.status, error: record.error });
  }

  async createDeployment({ buildId, mode = 'dry-run', provider = 'local', target = {}, trace = {}, rollbackOf = null, onProviderAttempt = null } = {}) {
    assertBuildId(buildId);
    if (!DEPLOY_MODES.includes(mode)) {
      throw deliveryError(DEL_CODES.BAD_MODE, `unknown deployment mode "${mode}"`, { known: DEPLOY_MODES, retryable: false });
    }
    if (!this.registry.has(provider)) {
      throw deliveryError(DEL_CODES.PROVIDER_UNKNOWN, `provider "${provider}" is not registered`, { retryable: false });
    }
    if (mode === 'auto' && !this.autoAllowed) {
      throw deliveryError(DEL_CODES.AUTO_DISABLED, 'auto deployment mode is disabled (set DELIVERY_AUTO_ALLOWED=true to enable)', { retryable: false });
    }
    if (typeof target !== 'object' || target === null) {
      throw deliveryError(DEL_CODES.CONFIG_INVALID, 'deployment target must be an object', { retryable: false });
    }

    const buildRecord = this.builds.loadBuild(buildId);
    // DEL-7/8: reject malformed/inconsistent build identities before any record
    // lookup. assertBuildId above covers the syntax; here the STORED build record
    // must be a consistent identity for the requested buildId — its declared
    // buildId must match the lookup key, and recomputing the deterministic
    // buildId from the persisted trace + engine checksum must reproduce it.
    // (buildId derivation excludes businessId — pipeline/delivery callers pass
    // the build trace without it, so the recompute must reproduce that identity.)
    if (buildRecord.buildId !== buildId) {
      throw deliveryError(DEL_CODES.BAD_BUILD_ID, `buildId "${buildId}" inconsistent with stored build record (record declares "${buildRecord.buildId}")`, { buildId, declared: buildRecord.buildId, retryable: false });
    }
    const recomputedBuildId = buildIdFrom(
      {
        dossierVersion: buildRecord.trace?.dossierVersion,
        pipelineRunId: buildRecord.trace?.pipelineRunId
      },
      buildRecord.engineOutputChecksum
    );
    if (recomputedBuildId !== buildId) {
      throw deliveryError(DEL_CODES.BAD_BUILD_ID, `buildId "${buildId}" inconsistent with stored build record (recomputed "${recomputedBuildId}")`, { buildId, recomputed: recomputedBuildId, retryable: false });
    }
    const qaReport = this.qa.loadReport(buildId);
    if (!qaReport) {
      throw deliveryError(DEL_CODES.QA_FAILED, `no QA report for build "${buildId}"`, { buildId, retryable: false });
    }
    if (!qaReport.passed) {
      throw deliveryError(DEL_CODES.QA_FAILED, `build "${buildId}" failed final QA — deployment blocked`, {
        buildId,
        qaSummary: qaReport.totals,
        retryable: false
      });
    }

    const recordId = recordIdFor(buildId);
    if (this.store.has(recordId)) {
      const existing = this.store.load(recordId);
      if (['recorded', 'deployed'].includes(existing.status)) {
        this._audit({ action: 'record_reused', recordId, businessId: buildRecord.businessId, mode, status: existing.status });
        this.logger?.info?.(`delivery deploy: reuse existing record ${recordId} (${existing.status})`, { businessId: buildRecord.businessId });
        return existing;
      }
      if (existing.status === 'simulated') {
        if (mode === 'dry-run') {
          this._audit({ action: 'record_reused', recordId, businessId: buildRecord.businessId, mode, status: existing.status });
          this.logger?.info?.(`delivery deploy: reuse simulated record ${recordId} for dry-run`, { businessId: buildRecord.businessId });
          return existing;
        }
        existing.mode = mode;
        // Rearm refresh: promoting a dry-run simulation into a real deployment
        // applies the caller's chosen provider/target/rollback target to the
        // existing record (the simulation may have been run against different
        // values), then re-runs the deployment-record schema validation on the
        // updated record. No new record is created — identity stays `dep_<buildId>`
        // and the deterministic record id is preserved.
        existing.provider = provider;
        existing.target = redact(target, { vault: this.vault });
        existing.rollbackOf = rollbackOf || null;
        this._schemaValidate(existing, 'deployment-record');
        this._audit({ action: 'record_promoted', recordId, businessId: buildRecord.businessId, mode, rearmed: true });
        this.logger?.info?.(`delivery deploy: promote simulated record ${recordId} to real deployment (${mode})`, { businessId: buildRecord.businessId });
        if (mode === 'explicit') {
          applyTransition(existing, DEPLOY_EVENTS.APPROVAL_NEEDED, { actor: 'manager', note: 'promoted from dry-run simulation — waiting for explicit approval', mode });
          this.store.save(existing);
          return existing;
        }
        applyTransition(existing, DEPLOY_EVENTS.APPROVED, { actor: 'manager', note: 'promoted from dry-run simulation to real deployment', mode });
        this.store.save(existing);
        return this.executeDeploy(existing.id, { onProviderAttempt });
      }
      if (existing.status === 'awaiting_approval' || existing.status === 'approved') {
        this._audit({ action: 'record_reused', recordId, businessId: buildRecord.businessId, mode, status: existing.status });
        this.logger?.info?.(`delivery deploy: reuse existing record ${recordId} (${existing.status})`, { businessId: buildRecord.businessId });
        return existing;
      }
      throw deliveryError(DEL_CODES.RECORD_CONFLICT, `record "${recordId}" already exists in state ${existing.status}; identical-build re-request refused to protect record history`, {
        recordId,
        status: existing.status,
        retryable: false
      });
    }

    const tree = this.builds.readTree(buildId);
    const { manifest } = this.packaging.packageBuild({ buildId, buildRecord, qaReport, tree });

    const record = {
      schema: 'https://agency.os/delivery/deployment-record',
      id: recordId,
      businessId: buildRecord.businessId,
      trace: {
        businessId: buildRecord.businessId,
        dossierVersion: buildRecord.trace.dossierVersion,
        pipelineRunId: buildRecord.trace.pipelineRunId,
        engineOutputChecksum: buildRecord.engineOutputChecksum,
        buildId,
        engineVersion: buildRecord.engineVersion
      },
      provider,
      target: redact(target, { vault: this.vault }),
      mode,
      status: 'created',
      qaSummary: {
        checks: qaReport.totals.checks,
        passed: qaReport.totals.passed,
        failed: qaReport.totals.failed
      },
      package: {
        packageId: buildId,
        bundleSha256: manifest.bundle.sha256,
        fileCount: manifest.bundle.fileCount
      },
      deployment: null,
      dryRun: null,
      approvals: [],
      rollbackOf: rollbackOf || null,
      timeline: [],
      createdAt: new Date().toISOString()
    };
    this._schemaValidate(record, 'deployment-record');
    applyTransition(record, DEPLOY_EVENTS.PACKAGED, { actor: 'system', note: 'build + QA passed; package immutable', mode });
    this.store.save(record);
    this._audit({ action: 'record_created', recordId: record.id, businessId: record.businessId, mode, provider, status: record.status });

    if (mode === 'dry-run') {
      const manifest = this.packaging.loadManifest(buildId);
      const actualSha = this.packaging.bundleSha256(buildId);
      if (actualSha !== manifest.bundle.sha256) {
        this._fail(record, 'package checksum mismatch before dry-run', DEL_CODES.PACKAGE_MISSING);
        throw deliveryError(DEL_CODES.PACKAGE_MISSING, `package checksum mismatch for "${buildId}" — dry-run aborted`, { buildId, retryable: false });
      }
      const providerInstance = this.registry.get(provider, { config: target, ctx: this._providerCtx() });
      const packageInfo = this._packageInfoFor(buildId);
      record.dryRun = buildDryRunReport({ record, packageInfo, provider: providerInstance, qaReport });
      applyTransition(record, DEPLOY_EVENTS.SIMULATED, { actor: 'system', note: 'dry-run simulation completed', mode });
      this.store.save(record);
      this._finalizeRecord(record);
      return record;
    }

    if (mode === 'explicit') {
      applyTransition(record, DEPLOY_EVENTS.APPROVAL_NEEDED, { actor: 'system', note: 'waiting for explicit approval' });
      this.store.save(record);
      this._audit({ action: 'approval_required', recordId: record.id, status: record.status });
      return record;
    }

    applyTransition(record, DEPLOY_EVENTS.APPROVED, { actor: 'auto', note: 'auto mode enabled by policy', mode });
    this.store.save(record);
    return this.executeDeploy(record.id, { onProviderAttempt });
  }

  async approve(recordId, opts = {}) {
    const gate = new ApprovalGate({ store: this.store, logger: this.logger, vault: this.vault });
    gate.approve(recordId, opts);
    this._audit({ action: 'approved', recordId, by: opts.by });
    return this.executeDeploy(recordId, { onProviderAttempt: opts.onProviderAttempt || null });
  }

  async reject(recordId, opts = {}) {
    const gate = new ApprovalGate({ store: this.store, logger: this.logger, vault: this.vault });
    const record = gate.reject(recordId, opts);
    this._audit({ action: 'rejected', recordId, by: opts.by });
    return record;
  }

  async deploy(recordId) {
    const record = this.store.load(recordId);
    if (record.status === 'awaiting_approval') {
      throw deliveryError(DEL_CODES.APPROVAL_REQUIRED, `record "${recordId}" requires explicit approval`, { recordId, retryable: false });
    }
    if (record.status !== 'approved') {
      throw deliveryError(DEL_CODES.BAD_STATE, `record "${recordId}" cannot be deployed from state ${record.status}`, { recordId, status: record.status, retryable: false });
    }
    return this.executeDeploy(recordId);
  }

  async executeDeploy(recordId, { onProviderAttempt = null } = {}) {
    const record = this.store.load(recordId);
    if (!/^[0-9a-f]{16}$/.test(record.trace?.buildId || '')) {
      throw deliveryError(DEL_CODES.RECORD_CONFLICT, `record "${recordId}" carries an invalid build identity`, { recordId, retryable: false });
    }
    if (recordIdFor(record.trace.buildId) !== record.id) {
      throw deliveryError(DEL_CODES.RECORD_CONFLICT, `record "${recordId}" build identity does not match its deterministic id`, { recordId, buildId: record.trace.buildId, retryable: false });
    }
    if (!canTransition(record.status, DEPLOY_EVENTS.DEPLOY_START)) {
      throw deliveryError(DEL_CODES.BAD_STATE, `record "${recordId}" cannot start deployment from state ${record.status}`, { recordId, status: record.status, retryable: false });
    }
    const buildId = record.trace.buildId;
    const qaReport = this.qa.loadReport(buildId);
    if (!qaReport || !qaReport.passed) {
      this._fail(record, 'qa gate re-check failed before deployment', DEL_CODES.QA_FAILED);
      throw deliveryError(DEL_CODES.QA_FAILED, `QA gate re-check failed for build "${buildId}" — deployment aborted`, { buildId, retryable: false });
    }
    const manifest = this.packaging.loadManifest(buildId);
    const actualSha = this.packaging.bundleSha256(buildId);
    if (actualSha !== manifest.bundle.sha256) {
      this._fail(record, 'package checksum mismatch before deployment', DEL_CODES.PACKAGE_MISSING);
      throw deliveryError(DEL_CODES.PACKAGE_MISSING, `package checksum mismatch for "${buildId}" — deployment aborted`, { buildId, retryable: false });
    }

    const provider = this.registry.get(record.provider, { config: record.target, ctx: this._providerCtx() });
    applyTransition(record, DEPLOY_EVENTS.DEPLOY_START, { actor: 'manager', mode: record.mode });
    record.deployment = { id: null, url: null, state: 'DEPLOYING' };
    this.store.save(record);

    const beforeAttempt = () => {
      if (onProviderAttempt && onProviderAttempt() === false) {
        throw deliveryError(DEL_CODES.PROVIDER_BUDGET, `provider attempt refused before deployment for "${buildId}"`, { buildId, retryable: false });
      }
    };

    try {
      const preflight = await provider.validateConfig();
      if (!preflight || preflight.ok !== true) {
        throw deliveryError(DEL_CODES.CONFIG_INVALID, `provider config validation failed for ${record.provider}`, { retryable: false });
      }

      const packageInfo = this._packageInfoFor(buildId);
      const deliveryResult = await deliveryRetry(
        () => {
          beforeAttempt();
          return provider.deploy(packageInfo);
        },
        {
          ...this.retryConfig,
          onAttempt: ({ attempt }) => {
            applyTransition(record, DEPLOY_EVENTS.RETRY, { actor: 'manager', note: `deploy attempt ${attempt + 1}` });
          }
        }
      );
      const deployed = deliveryResult.result;
      applyTransition(record, DEPLOY_EVENTS.DEPLOY_OK, { actor: 'manager', note: `deployment ${deployed.deploymentId}` });
      record.deployment = { id: deployed.deploymentId, url: deployed.url || null, state: deployed.state || 'READY' };
      this.store.save(record);

      const verified = await pollUntil(
        () => provider.verify(deployed.deploymentId),
        {
          maxAttempts: 10,
          initialDelayMs: 25,
          predicate: (v) => v && v.status === 'READY'
        }
      );
      if (!verified || verified.status !== 'READY') {
        const err = deliveryError(DEL_CODES.PROVIDER_ERROR, `deployment verification did not reach READY (last: ${verified?.status})`, { retryable: false });
        this._fail(record, 'deployment verification failed', DEL_CODES.PROVIDER_ERROR);
        throw err;
      }
      applyTransition(record, DEPLOY_EVENTS.VERIFY_OK, { actor: 'manager', note: `verified at ${verified.url || record.deployment.url}` });
      record.deployment.url = record.deployment.url || verified.url;
      this.store.save(record);

      applyTransition(record, DEPLOY_EVENTS.RECORDED, { actor: 'manager', note: 'deployment recorded' });
      this.store.save(record);
      this._finalizeRecord(record);
      return record;
    } catch (err) {
      const code = err.code || DEL_CODES.PROVIDER_ERROR;
      this._fail(record, `deployment failed: ${err.message}`, code);
      throw err;
    }
  }

  async recover(recordId, { onProviderAttempt = null } = {}) {
    const record = this.store.load(recordId);
    if (!['deploying', 'deployed', 'verified'].includes(record.status)) {
      throw deliveryError(DEL_CODES.BAD_STATE, `record "${recordId}" is not in an interrupted deployment state (got ${record.status})`, {
        recordId,
        status: record.status,
        retryable: false
      });
    }
    const deploymentId = record.deployment && record.deployment.id;
    if (!deploymentId) {
      this._fail(record, 'deployment interrupted before a provider deployment id existed — refusing to re-deploy, evidence preserved', DEL_CODES.PROVIDER_ERROR);
      throw deliveryError(DEL_CODES.PROVIDER_ERROR, `deployment of "${recordId}" interrupted mid-flight; provider state unknown — refusing to re-deploy`, {
        recordId,
        retryable: false
      });
    }

    const provider = this.registry.get(record.provider, { config: record.target, ctx: this._providerCtx() });
    let verified = null;
    try {
      verified = await pollUntil(
        () => provider.verify(deploymentId),
        { maxAttempts: 10, initialDelayMs: 25, predicate: (v) => v && v.status === 'READY' }
      );
    } catch {
      verified = null;
    }
    if (!verified || verified.status !== 'READY') {
      this._fail(record, `deployment "${deploymentId}" could not be confirmed READY after interruption — no re-deploy (last: ${verified ? verified.status : 'unknown'})`, DEL_CODES.PROVIDER_ERROR);
      throw deliveryError(DEL_CODES.PROVIDER_ERROR, `deployment "${deploymentId}" state ambiguous after interruption; refusing to re-deploy`, {
        recordId,
        deploymentId,
        retryable: false
      });
    }

    if (canTransition(record.status, DEPLOY_EVENTS.DEPLOY_OK)) {
      applyTransition(record, DEPLOY_EVENTS.DEPLOY_OK, { actor: 'manager', note: `recovered after interruption — deployment ${deploymentId} confirmed` });
    }
    if (canTransition(record.status, DEPLOY_EVENTS.VERIFY_OK)) {
      applyTransition(record, DEPLOY_EVENTS.VERIFY_OK, { actor: 'manager', note: `recovered after interruption — provider confirmed READY (${verified.url || record.deployment.url || ''})` });
    }
    record.deployment.url = record.deployment.url || verified.url || null;
    this.store.save(record);
    if (canTransition(record.status, DEPLOY_EVENTS.RECORDED)) {
      applyTransition(record, DEPLOY_EVENTS.RECORDED, { actor: 'manager', note: 'deployment recovered and recorded after interruption' });
      this.store.save(record);
    }
    this._audit({ action: 'recovered', recordId: record.id, deploymentId, status: record.status });
    this._finalizeRecord(record);
    return record;
  }

  history(businessId = null) {
    return this.store.list(businessId);
  }

  getRecord(recordId) {
    return this.store.load(recordId);
  }
}
