import { memError, MEM_CODES } from './errors.js';
import { MEMORY_TYPES } from './types.js';

export class MemoryEngine {
  constructor({ store, autoLoad = true, autoSave = true, saveDebounceMs = 250 }) {
    this.store = store;
    this.autoLoad = autoLoad;
    this.autoSave = autoSave;
    this.saveDebounceMs = saveDebounceMs;
    this.working = new Map();
    this._timers = new Map();
  }

  remember(type, scope, key, content, opts = {}) {
    if (type === 'working') {
      return this.putWorking(scope, key, content, opts);
    }
    if (!this.autoSave) {
      const result = this.store.put(type, scope, key, content, opts);
      const flushKey = `${type}:${scope}:${key}`;
      if (this._timers.has(flushKey)) clearTimeout(this._timers.get(flushKey));
      this._timers.set(
        flushKey,
        setTimeout(() => {
          this._timers.delete(flushKey);
        }, this.saveDebounceMs).unref?.()
      );
      return result;
    }
    return this.store.put(type, scope, key, content, opts);
  }

  recall(type, scope, key, opts = {}) {
    if (type === 'working') {
      const value = this.working.get(`${scope}:${key}`);
      if (value === undefined) throw memError(MEM_CODES.ENTRY_NOT_FOUND, `no working memory ${scope}:${key}`, { type, scope, key });
      return { content: value, version: 1 };
    }
    return this.store.get(type, scope, key, opts);
  }

  forget(type, scope, key) {
    if (type === 'working') {
      return this.working.delete(`${scope}:${key}`);
    }
    return this.store.forget(type, scope, key);
  }

  putWorking(runId, key, content, opts = {}) {
    const memKey = `${runId}:${key}`;
    this.working.set(memKey, content);
    const ttlMs = opts.ttlMs ?? MEMORY_TYPES.working.ttlMs;
    if (ttlMs > 0) {
      const timer = setTimeout(() => this.working.delete(memKey), ttlMs);
      timer.unref?.();
      this._timers.set(`working:${memKey}`, timer);
    }
    return { entry: { id: memKey, type: 'working', scope: runId, key, content }, deduped: false };
  }

  getWorking(runId, key) {
    const memKey = `${runId}:${key}`;
    const value = this.working.get(memKey);
    if (value === undefined) throw memError(MEM_CODES.ENTRY_NOT_FOUND, `no working memory ${runId}:${key}`, { key });
    return value;
  }

  endWorking(runId) {
    let count = 0;
    for (const key of [...this.working.keys()]) {
      if (key.startsWith(`${runId}:`)) {
        this.working.delete(key);
        count++;
      }
    }
    return count;
  }

  scope(type, scope) {
    const self = this;
    return {
      type,
      scope,
      put: (key, content, opts = {}) => self.remember(type, scope, key, content, opts),
      get: (key, opts = {}) => self.recall(type, scope, key, opts),
      remember: (key, content, opts = {}) => self.remember(type, scope, key, content, opts),
      recall: (key, opts = {}) => self.recall(type, scope, key, opts),
      forget: (key) => self.forget(type, scope, key),
      exists: (key) => self.store.exists(type, scope, key),
      versions: (key) => self.store.versions(type, scope, key),
      rollback: (key, version) => self.store.rollback(type, scope, key, version),
      list: () => self.store.list(type, scope),
      search: (query, opts = {}) => self.store.search(query, { ...opts, type, scope })
    };
  }

  project(id) {
    return this.scope('project', `project:${id}`);
  }

  business(id) {
    return this.scope('business', `business:${id}`);
  }

  brand(id = null) {
    return this.scope('brand', id ? `brand:${id}` : 'global');
  }

  customer(id) {
    return this.scope('customer', `customer:${id}`);
  }

  agent(id) {
    return this.scope('agent', `agent:${id}`);
  }

  workflow(id) {
    return this.scope('workflow', `workflow:${id}`);
  }

  execution(runId) {
    return this.scope('execution', `run:${runId}`);
  }

  snapshot(name, opts = {}) {
    return this.store.snapshot(name, opts);
  }

  async sweepExpired() {
    return this.store.sweepExpired();
  }

  stats() {
    return this.store.statsSnapshot();
  }

  async close() {
    for (const t of this._timers.values()) clearTimeout(t);
    this._timers.clear();
    this.store.close();
  }
}
