import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Validator } from '../runtime/validator.js';
import { ProductionBuildManager } from './build/index.js';
import { FinalQA } from './qa/index.js';
import { PackagingManager } from './packaging/index.js';
import { RecordStore } from './deployment/records.js';
import { DeploymentManager } from './deployment/manager.js';
import { RollbackManager } from './rollback/index.js';
import { ProviderRegistry } from './providers/registry.js';
import { MockProvider } from './providers/mock.js';
import { LocalProvider } from './providers/local.js';
import { VercelProvider } from './providers/vercel/index.js';
import { DeliveryArtifacts } from './artifacts/builders.js';
import { DeliveryMemory } from './memory/bridge.js';
import { DeliveryScheduler } from './scheduler/jobs.js';
import { DeliveryCapability } from './brain/capability.js';
import { DELIVERY_EVENTS } from './brain/events.js';

export const DELIVERY_API_VERSION = '1.0';
export const PROVIDER_IDS = { MOCK: 'mock', LOCAL: 'local', VERCEL: 'vercel' };
export { DEPLOY_MODES } from './deployment/manager.js';
export { DELIVERY_EVENTS };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const SCHEMAS_DIR = path.join(MODULE_ROOT, 'schemas');

export class DeliverySystem {
  constructor({
    root = ROOT,
    logger = null,
    vault = null,
    autoAllowed = false,
    validator = null,
    http = null,
    engine = null,
    artifacts = null,
    memory = null,
    scheduler = null,
    brain = null,
    registry = null,
    retryConfig = { maxAttempts: 3, initialDelayMs: 50 },
    verifyConfig = null
  } = {}) {
    this.root = path.resolve(root);
    this.logger = logger;
    this.autoAllowed = Boolean(autoAllowed);
    this.listeners = new Map();
    this.events = { emit: (event, payload) => this.emit(event, payload) };
    this.retryConfig = retryConfig;
    this.verifyConfig = verifyConfig || null;

    this.schemas = this._loadSchemas();
    this.validator = validator || new Validator({ schemasDir: SCHEMAS_DIR });

    this.builds = new ProductionBuildManager({ root: this.root, engine, logger });
    this.qa = new FinalQA({ root: this.root, logger });
    this.packaging = new PackagingManager({ root: this.root, logger });
    this.store = new RecordStore({ root: this.root });

    this.registry = registry || new ProviderRegistry();
    this.registry.register(PROVIDER_IDS.MOCK, MockProvider);
    this.registry.register(PROVIDER_IDS.LOCAL, LocalProvider);
    this.registry.register(PROVIDER_IDS.VERCEL, VercelProvider);

    this.manager = new DeploymentManager({
      root: this.root,
      store: this.store,
      builds: this.builds,
      qa: this.qa,
      packaging: this.packaging,
      registry: this.registry,
      validator: this.validator,
      schemas: this.schemas,
      logger,
      vault,
      autoAllowed,
      retryConfig: this.retryConfig,
      verifyConfig: this.verifyConfig,
      events: this.events
    });

    this.artifactsBridge = new DeliveryArtifacts({ artifacts, vault, logger });
    this.memoryBridge = new DeliveryMemory({ memory, vault, logger });
    this.manager.setIntegrations({ artifacts: this.artifactsBridge, memory: this.memoryBridge });
    if (http) this.manager.setHttp(http);

    this.rollbackManager = new RollbackManager({
      root: this.root,
      store: this.store,
      manager: this.manager,
      packaging: this.packaging,
      qa: this.qa,
      logger,
      vault,
      artifacts: this.artifactsBridge,
      memory: this.memoryBridge
    });

    this.schedulerBridge = new DeliveryScheduler({ scheduler, manager: this.manager, logger });
    this.capability = new DeliveryCapability({ delivery: this, logger });
  }

  _loadSchemas() {
    const out = {};
    if (!fs.existsSync(SCHEMAS_DIR)) return out;
    for (const file of fs.readdirSync(SCHEMAS_DIR)) {
      if (!file.endsWith('.schema.json')) continue;
      out[file.replace(/\.schema\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, file), 'utf8'));
    }
    return out;
  }

  setIntegrations({ artifacts = null, memory = null } = {}) {
    if (artifacts) this.artifactsBridge.artifacts = artifacts;
    if (memory) this.memoryBridge.memory = memory;
    return this;
  }

  setHttp(http) {
    this.manager.setHttp(http);
    return this;
  }

  registerProvider(id, provider) {
    this.registry.register(id, provider);
    return this;
  }

  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(cb);
    return this;
  }

  off(event, cb) {
    const list = this.listeners.get(event) || [];
    this.listeners.set(event, list.filter((fn) => fn !== cb));
    return this;
  }

  emit(event, payload) {
    for (const cb of this.listeners.get(event) || []) {
      try {
        cb(payload);
      } catch {
        /* listeners never break delivery */
      }
    }
    return this;
  }

  deliver({ buildId, mode = 'dry-run', provider = PROVIDER_IDS.LOCAL, target = {}, trace = {}, rollbackOf = null, onProviderAttempt = null }) {
    return this.manager.createDeployment({ buildId, mode, provider, target, trace, rollbackOf, onProviderAttempt });
  }

  deploy(recordId) {
    return this.manager.deploy(recordId);
  }

  approve(recordId, opts = {}) {
    return this.manager.approve(recordId, opts);
  }

  reject(recordId, opts = {}) {
    return this.manager.reject(recordId, opts);
  }

  rollback(opts) {
    return this.rollbackManager.rollback(opts);
  }

  revert(opts) {
    return this.rollbackManager.revert(opts);
  }

  approveRollback(recordId, opts = {}) {
    return this.rollbackManager.approveRollback(recordId, opts);
  }

  history(businessId = null) {
    return this.manager.history(businessId);
  }

  getRecord(recordId) {
    return this.manager.getRecord(recordId);
  }

  recover(recordId, opts = {}) {
    return this.manager.recover(recordId, opts);
  }

  attachScheduler() {
    this.schedulerBridge.attach();
    return this;
  }

  attachBrain(brain) {
    this.capability.register(brain);
    return this;
  }

  close() {
    this.listeners.clear();
  }
}

export function createDeliverySystem(opts) {
  return new DeliverySystem(opts);
}
