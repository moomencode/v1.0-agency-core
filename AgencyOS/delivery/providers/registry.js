import { deliveryError, DEL_CODES } from '../errors.js';
import { assertProvider } from './interface.js';

export class ProviderRegistry {
  constructor() {
    this.factories = new Map();
    this.instances = new Map();
  }

  register(id, factoryOrInstance) {
    if (typeof factoryOrInstance === 'function') {
      this.factories.set(id, factoryOrInstance);
    } else if (factoryOrInstance && typeof factoryOrInstance === 'object') {
      this.instances.set(id, assertProvider(factoryOrInstance));
    } else {
      throw deliveryError(DEL_CODES.PROVIDER_UNKNOWN, `provider "${id}" must be a factory or instance`);
    }
    return this;
  }

  get(id, { config = null, ctx = {} } = {}) {
    const instance = this.instances.get(id);
    if (instance) return instance;
    const factory = this.factories.get(id);
    if (!factory) {
      throw deliveryError(DEL_CODES.PROVIDER_UNKNOWN, `provider "${id}" is not registered`, { known: [...this.factories.keys(), ...this.instances.keys()] });
    }
    const provider = new factory(config || {}, ctx);
    return assertProvider(provider);
  }

  has(id) {
    return this.factories.has(id) || this.instances.has(id);
  }

  list() {
    return [...this.factories.keys(), ...this.instances.keys()].sort();
  }
}
