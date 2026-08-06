import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, readJson, writeJson, sanitizeName, nowIso } from './utils.js';
import { typedError, CODES } from './errors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SECRET_PATTERN = /\b(secret|token|password|credential|apikey|api_key)\b/i;

export class MemoryManager {
  constructor({ root = ROOT, bus = null, logger = null, shortTtlMs = 30 * 60 * 1000, longTtlMs = 30 * 24 * 60 * 60 * 1000 } = {}) {
    this.root = root;
    this.bus = bus;
    this.logger = logger;
    this.shortTtlMs = shortTtlMs;
    this.longTtlMs = longTtlMs;
    this.dir = ensureDir(path.join(root, 'storage', 'memory'));
    this.short = new Map();
    this.stats = { puts: 0, gets: 0, hits: 0, misses: 0, forgets: 0, rejected: 0 };
  }

  _checkSecret(key) {
    if (SECRET_PATTERN.test(key)) {
      this.stats.rejected++;
      throw typedError(CODES.INFRA_AUTH, `secret-bearing key refused by memory: ${key}`, { key });
    }
  }

  _shortKey(agent, key) {
    return `${sanitizeName(agent)}::${key}`;
  }

  _longPath(agent, key) {
    return path.join(this.dir, sanitizeName(agent), `${sanitizeName(key)}.json`);
  }

  put(agent, key, value, { scope = 'short', ttlMs = null } = {}) {
    this._checkSecret(key);
    this.stats.puts++;
    const now = Date.now();
    if (scope === 'long') {
      const file = this._longPath(agent, key);
      const existing = readJson(file, null);
      const entry = {
        key,
        agent: sanitizeName(agent),
        version: existing ? (existing.version || 0) + 1 : 1,
        value,
        createdAt: existing ? existing.createdAt : nowIso(),
        updatedAt: nowIso(),
        expiresAt: now + (ttlMs || this.longTtlMs)
      };
      writeJson(file, entry);
      return entry;
    }
    const sk = this._shortKey(agent, key);
    const entry = { key, agent: sanitizeName(agent), version: 1, value, createdAt: nowIso(), expiresAt: now + (ttlMs || this.shortTtlMs) };
    this.short.set(sk, entry);
    return entry;
  }

  get(agent, key, { scope = 'short' } = {}) {
    this._checkSecret(key);
    this.stats.gets++;
    const now = Date.now();
    if (scope === 'long') {
      const file = this._longPath(agent, key);
      const entry = readJson(file, null);
      if (!entry) {
        this.stats.misses++;
        return null;
      }
      if (entry.expiresAt && entry.expiresAt < nowIso()) {
        this.forget(agent, key, { scope: 'long' });
        this.stats.misses++;
        return null;
      }
      this.stats.hits++;
      return entry.value;
    }
    const sk = this._shortKey(agent, key);
    const entry = this.short.get(sk);
    if (!entry || (entry.expiresAt && entry.expiresAt <= now)) {
      if (entry) this.short.delete(sk);
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    return entry.value;
  }

  forget(agent, key, { scope = 'short' } = {}) {
    this.stats.forgets++;
    if (scope === 'long') {
      const file = this._longPath(agent, key);
      try {
        fs.rmSync(file, { force: true });
      } catch {
        /* best effort */
      }
      return;
    }
    this.short.delete(this._shortKey(agent, key));
  }

  recall(agent, prefix = '') {
    const out = [];
    for (const [sk, entry] of this.short) {
      if (sk.startsWith(agent + '::') && sk.slice(agent.length + 2).startsWith(prefix)) out.push(entry);
    }
    const dir = path.join(this.dir, sanitizeName(agent));
    if (fs.existsSync(dir)) {
      for (const file of fs.readdirSync(dir)) {
        const key = file.replace(/\.json$/, '');
        if (key.startsWith(prefix)) out.push(readJson(path.join(dir, file), null));
      }
    }
    return out;
  }

  statsReport() {
    return { ...this.stats, shortEntries: this.short.size };
  }
}

export function createMemoryManager(opts) {
  return new MemoryManager(opts);
}
