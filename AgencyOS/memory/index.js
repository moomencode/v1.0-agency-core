import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Validator } from '../runtime/validator.js';
import { MemoryStore } from './store.js';
import { MemoryEngine } from './engine.js';
import { MEMORY_TYPES, TYPE_NAMES, resolveScope } from './types.js';
import { memError, MEM_CODES } from './errors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class MemorySystem {
  constructor({ root = ROOT, autoLoad = true, autoSave = true, maxVersions = 10, uncompressedKeep = 3, sweeperMs = 60000, validate = true } = {}) {
    this.root = root;
    this.validate = validate;
    this.entrySchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'memory', 'schemas', 'entry.schema.json'), 'utf8'));
    this.validator = new Validator({ schemasDir: path.join(root, 'schemas') });
    this.store = new MemoryStore({ root, maxVersions, uncompressedKeep, sweeperMs });
    this.engine = new MemoryEngine({ store: this.store, autoLoad, autoSave });
    this.types = MEMORY_TYPES;
  }

  put(type, scope, key, content, opts = {}) {
    resolveScope(type, scope);
    if (this.validate && type !== 'working') {
      const probe = {
        schema: 'https://agency.os/memory/entry',
        id: 'mem-probe',
        type,
        scope,
        key,
        content,
        fingerprint: 'f'.repeat(16),
        version: 1,
        createdAt: new Date().toISOString(),
        metadata: {}
      };
      const result = this.validator.validate(probe, this.entrySchema, { schemaPath: 'memory:entry' });
      if (!result.valid) {
        throw memError(MEM_CODES.INDEX_CORRUPT, 'memory entry failed entry schema validation', {
          errors: result.errors.slice(0, 10)
        });
      }
    }
    return this.engine.remember(type, scope, key, content, opts);
  }

  get(type, scope, key, opts = {}) {
    return this.engine.recall(type, scope, key, opts);
  }

  exists(type, scope, key) {
    return this.store.exists(type, scope, key);
  }

  search(query, opts = {}) {
    return this.store.search(query, opts);
  }

  snapshot(name, opts = {}) {
    return this.store.snapshot(name, opts);
  }

  stats() {
    return {
      types: TYPE_NAMES,
      labels: Object.fromEntries(TYPE_NAMES.map((t) => [t, MEMORY_TYPES[t].label])),
      store: this.store.statsSnapshot(),
      snapshots: this.store.listSnapshots(),
      working: this.engine.working.size
    };
  }

  close() {
    this.engine.close();
  }
}

export function createMemorySystem(opts = {}) {
  return new MemorySystem(opts);
}
