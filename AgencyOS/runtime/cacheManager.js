import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, readJson, writeJson, shortHash, nowIso } from './utils.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class CacheManager {
  constructor({ root = ROOT, bus = null, logger = null, defaultTtlMs = 24 * 60 * 60 * 1000, negativeTtlMs = 5 * 60 * 1000 } = {}) {
    this.root = root;
    this.bus = bus;
    this.logger = logger;
    this.defaultTtlMs = defaultTtlMs;
    this.negativeTtlMs = negativeTtlMs;
    this.dir = ensureDir(path.join(root, 'storage', 'cache'));
    this.inFlight = new Map();
    this.stats = { gets: 0, hits: 0, misses: 0, writes: 0, evictions: 0, inflightShares: 0 };
  }

  _file(key) {
    return path.join(this.dir, `${shortHash(key, 20)}.json`);
  }

  _entry(key, value, ttlMs) {
    const now = Date.now();
    return {
      key,
      value,
      createdAt: nowIso(),
      expiresAt: now + ttlMs,
      hitCount: 0
    };
  }

  get(key) {
    this.stats.gets++;
    const file = this._file(key);
    const entry = readJson(file, null);
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    if (entry.expiresAt && Date.parse(entry.expiresAt) <= Date.now()) {
      try {
        fs.rmSync(file, { force: true });
      } catch {
        /* best effort */
      }
      this.stats.evictions++;
      this.stats.misses++;
      return null;
    }
    entry.hitCount = (entry.hitCount || 0) + 1;
    writeJson(file, entry);
    this.stats.hits++;
    return entry.value;
  }

  set(key, value, { ttlMs = null } = {}) {
    this.stats.writes++;
    writeJson(this._file(key), this._entry(key, value, ttlMs || this.defaultTtlMs));
    return value;
  }

  del(key) {
    const file = this._file(key);
    try {
      fs.rmSync(file, { force: true });
    } catch {
      /* best effort */
    }
    this.stats.evictions++;
  }

  async wrap(key, loader, { ttlMs = null, negativeTtlMs = null, staleWhileRevalidate = false } = {}) {
    const cached = this.get(key);
    if (cached !== null) return cached;
    if (this.inFlight.has(key)) {
      this.stats.inflightShares++;
      return this.inFlight.get(key);
    }
    const promise = (async () => {
      try {
        const value = await loader();
        this.set(key, value, { ttlMs: ttlMs || this.defaultTtlMs });
        return value;
      } catch (err) {
        if (err && err.code && String(err.code).startsWith('E_TR_')) {
          this.set(key, { __negative: true }, { ttlMs: negativeTtlMs || this.negativeTtlMs });
        }
        throw err;
      } finally {
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, promise);
    return promise;
  }

  statsReport() {
    return { ...this.stats, entries: this._countEntries() };
  }

  _countEntries() {
    try {
      return fs.readdirSync(this.dir).length;
    } catch {
      return 0;
    }
  }
}

export function createCacheManager(opts) {
  return new CacheManager(opts);
}
