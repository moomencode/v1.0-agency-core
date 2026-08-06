import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { ensureDir, readJson, writeJson, atomicWrite, stableStringify, sanitizeName, hashString } from '../runtime/utils.js';
import { memError, MEM_CODES } from './errors.js';
import { MEMORY_TYPES, TYPE_NAMES, resolveScope } from './types.js';

const SECRET_PATTERN = /(token|password|secret|api[_-]?key|credential)/i;

function scopePath(scope) {
  return String(scope).replace(/[^a-z0-9._-]/gi, '_').slice(0, 96);
}

function fingerprintFor(type, scope, key, content) {
  return hashString(stableStringify([type, scope, key, content]));
}

function contentFingerprint(type, scope, content) {
  return hashString(stableStringify([type, scope, content]));
}

export class MemoryStore {
  constructor({ root, maxVersions = 10, uncompressedKeep = 3, sweeperMs = 60000 } = {}) {
    this.base = path.join(root, 'storage', 'memory-engine');
    this.maxVersions = maxVersions;
    this.uncompressedKeep = uncompressedKeep;
    this.closed = false;
    this.stats = {
      entries: 0,
      puts: 0,
      gets: 0,
      deduped: 0,
      newVersions: 0,
      rollbacks: 0,
      snapshots: 0,
      restores: 0,
      compressed: 0,
      expired: 0,
      forgotten: 0,
      searches: 0
    };
    ensureDir(this.base);
    this.index = this._loadIndex();
    this._sweeper = null;
    if (sweeperMs > 0) {
      this._sweeper = setInterval(() => this.sweepExpired().catch(() => {}), sweeperMs);
      this._sweeper.unref?.();
    }
  }

  _typeDir(type) {
    const dir = path.join(this.base, type);
    ensureDir(dir);
    return dir;
  }

  _entryPath(type, scope, key) {
    const dir = path.join(this._typeDir(type), scopePath(scope));
    ensureDir(dir);
    return path.join(dir, `${sanitizeName(key)}.json`);
  }

  _snapshotDir() {
    const dir = path.join(this.base, '_snapshots');
    ensureDir(dir);
    return dir;
  }

  _indexPath() {
    return path.join(this.base, '_index.json');
  }

  _loadIndex() {
    try {
      const raw = readJson(this._indexPath());
      if (raw && Array.isArray(raw.entries)) return raw;
    } catch {
      /* first run */
    }
    return { entries: [], byFingerprint: {}, byContentFingerprint: {} };
  }

  _saveIndex() {
    writeJson(this._indexPath(), this.index);
  }

  _indexEntry(entry) {
    const idx = {
      id: entry.id,
      type: entry.type,
      scope: entry.scope,
      key: entry.key,
      fingerprint: entry.fingerprint,
      contentFingerprint: entry.contentFingerprint,
      tags: entry.metadata?.tags ?? [],
      summary: entry.metadata?.summary ?? '',
      updatedAt: entry.updatedAt
    };
    const prev = this.index.entries.findIndex((e) => e.id === entry.id);
    if (prev >= 0) this.index.entries.splice(prev, 1);
    this.index.entries.push(idx);
    this.index.byFingerprint[entry.fingerprint] = entry.id;
    this.index.byContentFingerprint[entry.contentFingerprint] = entry.id;
  }

  _unindexEntry(entry) {
    this.index.entries = this.index.entries.filter((e) => e.id !== entry.id);
    delete this.index.byFingerprint[entry.fingerprint];
    delete this.index.byContentFingerprint[entry.contentFingerprint];
  }

  _validateType(type) {
    if (!TYPE_NAMES.includes(type)) throw memError(MEM_CODES.TYPE_UNKNOWN, `unknown memory type "${type}"`, { type });
  }

  _guardOpen() {
    if (this.closed) throw memError(MEM_CODES.STORE_CLOSED, 'memory store is closed', {});
  }

  put(type, scope, key, content, opts = {}) {
    this._guardOpen();
    this._validateType(type);
    const resolvedScope = resolveScope(type, scope);
    if (SECRET_PATTERN.test(key)) {
      throw memError(MEM_CODES.SECRET_REJECTED, `refusing to store possible secret under key "${key}"`, { key });
    }
    const now = new Date().toISOString();
    const ttlMs = opts.ttlMs ?? MEMORY_TYPES[type].ttlMs ?? 0;
    const tags = opts.tags ?? [];
    const summary = opts.summary ?? '';

    const existingPath = this._entryPath(type, resolvedScope, key);
    const existing = fs.existsSync(existingPath) ? readJson(existingPath) : null;

    if (existing && existing.contentFingerprint && existing.contentFingerprint === contentFingerprint(type, resolvedScope, content)) {
      existing.accessedAt = now;
      if (ttlMs > 0) {
        existing.ttlMs = ttlMs;
        existing.expiresAt = new Date(Date.now() + ttlMs).toISOString();
      }
      writeJson(existingPath, existing);
      this._indexEntry(existing);
      this._saveIndex();
      this.stats.deduped++;
      return { entry: existing, deduped: true, newVersion: false };
    }

    if (existing) {
      const history = existing.versions ?? [];
      history.unshift({
        version: existing.version,
        ts: existing.updatedAt,
        content: existing.content,
        fingerprint: existing.fingerprint,
        rollbackOf: null
      });
      const trimmed = [];
      for (const v of history) {
        if (trimmed.length >= this.maxVersions - 1) break;
        trimmed.push(v);
      }
      existing.versions = this._compressOldVersions(trimmed, existing.version + 1);
      existing.content = content;
      existing.version = existing.version + 1;
      existing.fingerprint = fingerprintFor(type, resolvedScope, key, content);
      existing.contentFingerprint = contentFingerprint(type, resolvedScope, content);
      existing.updatedAt = now;
      existing.accessedAt = now;
      if (ttlMs > 0) {
        existing.ttlMs = ttlMs;
        existing.expiresAt = new Date(Date.now() + ttlMs).toISOString();
      } else {
        delete existing.ttlMs;
        delete existing.expiresAt;
      }
      existing.metadata = {
        ...(existing.metadata ?? {}),
        tags: [...new Set([...(existing.metadata?.tags ?? []), ...tags])],
        source: opts.source ?? existing.metadata?.source,
        workflowId: opts.workflowId ?? existing.metadata?.workflowId,
        runId: opts.runId ?? existing.metadata?.runId,
        agentId: opts.agentId ?? existing.metadata?.agentId,
        summary: summary || existing.metadata?.summary
      };
      writeJson(existingPath, existing);
      this._indexEntry(existing);
      this._saveIndex();
      this.stats.newVersions++;
      return { entry: existing, deduped: false, newVersion: true };
    }

    const dedupeTargetId = this.index.byContentFingerprint[contentFingerprint(type, resolvedScope, content)];
    if (dedupeTargetId) {
      const target = this.index.entries.find((e) => e.id === dedupeTargetId);
      if (target) {
        const existingDup = this.get(type, target.scope, target.key, { touch: false });
        this.stats.deduped++;
        return { entry: existingDup, deduped: true, duplicateOf: existingDup.id, newVersion: false };
      }
    }

    const entry = {
      schema: 'https://agency.os/memory/entry',
      id: `mem-${randomUUID()}`,
      type,
      scope: resolvedScope,
      key,
      content,
      fingerprint: fingerprintFor(type, resolvedScope, key, content),
      contentFingerprint: contentFingerprint(type, resolvedScope, content),
      version: 1,
      versions: [],
      createdAt: now,
      updatedAt: now,
      accessedAt: now,
      metadata: {
        tags,
        source: opts.source ?? null,
        workflowId: opts.workflowId ?? null,
        runId: opts.runId ?? null,
        agentId: opts.agentId ?? null,
        summary
      }
    };
    if (ttlMs > 0) {
      entry.ttlMs = ttlMs;
      entry.expiresAt = new Date(Date.now() + ttlMs).toISOString();
    }
    writeJson(existingPath, entry);
    this._indexEntry(entry);
    this._saveIndex();
    this.stats.puts++;
    return { entry, deduped: false, newVersion: false };
  }

  _compressOldVersions(history, nextVersion) {
    const result = [];
    for (let i = 0; i < history.length; i++) {
      const v = history[i];
      if (i >= this.uncompressedKeep && v.content !== undefined && !v.__compressed) {
        result.push(this._compressVersion(v));
        this.stats.compressed++;
      } else {
        result.push(v);
      }
    }
    return result;
  }

  _compressVersion(v) {
    try {
      const gz = zlib.gzipSync(Buffer.from(JSON.stringify(v.content))).toString('base64');
      const { content, ...rest } = v;
      void content;
      return { ...rest, __compressed: true, gz };
    } catch (err) {
      throw memError(MEM_CODES.COMPRESSION_FAILED, `failed to compress memory version ${v.version}`, { version: v.version, cause: err.message });
    }
  }

  _decompressVersion(v) {
    if (!v.__compressed) return v;
    try {
      return { ...v, content: JSON.parse(zlib.gunzipSync(Buffer.from(v.gz, 'base64')).toString('utf8')), __compressed: false, gz: undefined };
    } catch (err) {
      throw memError(MEM_CODES.COMPRESSION_FAILED, `failed to decompress memory version ${v.version}`, { version: v.version, cause: err.message });
    }
  }

  _entryFromDisk(type, scope, key) {
    const existingPath = this._entryPath(type, scope, key);
    if (!fs.existsSync(existingPath)) return null;
    return readJson(existingPath);
  }

  get(type, scope, key, { touch = true } = {}) {
    this._guardOpen();
    this._validateType(type);
    const resolvedScope = resolveScope(type, scope);
    const entry = this._entryFromDisk(type, resolvedScope, key);
    if (!entry) throw memError(MEM_CODES.ENTRY_NOT_FOUND, `no memory entry ${type}:${resolvedScope}:${key}`, { type, scope: resolvedScope, key });
    if (this._isExpired(entry)) {
      void this.forget(type, resolvedScope, key);
      throw memError(MEM_CODES.ENTRY_NOT_FOUND, `memory entry ${type}:${resolvedScope}:${key} expired`, { type, scope: resolvedScope, key, expired: true });
    }
    if (touch) {
      entry.accessedAt = new Date().toISOString();
      writeJson(this._entryPath(type, resolvedScope, key), entry);
    }
    this.stats.gets++;
    return entry;
  }

  _isExpired(entry) {
    if (!entry.expiresAt) return false;
    return Date.parse(entry.expiresAt) <= Date.now();
  }

  exists(type, scope, key) {
    this._validateType(type);
    const resolvedScope = resolveScope(type, scope);
    const entry = this._entryFromDisk(type, resolvedScope, key);
    if (!entry) return false;
    if (this._isExpired(entry)) {
      void this.forget(type, resolvedScope, key);
      return false;
    }
    return true;
  }

  forget(type, scope, key) {
    this._guardOpen();
    this._validateType(type);
    const resolvedScope = resolveScope(type, scope);
    const existingPath = this._entryPath(type, resolvedScope, key);
    if (!fs.existsSync(existingPath)) return false;
    const entry = readJson(existingPath);
    fs.unlinkSync(existingPath);
    this._unindexEntry(entry);
    this._saveIndex();
    this.stats.forgotten++;
    return true;
  }

  list(type, scope = null) {
    this._guardOpen();
    this._validateType(type);
    const dir = this._typeDir(type);
    const out = [];
    const scopes = scope ? [resolveScope(type, scope)] : null;
    const walk = (current, rel) => {
      for (const item of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, item.name);
        if (item.isDirectory()) {
          if (rel === '' && !item.name.startsWith('_')) walk(full, item.name);
        } else if (item.name.endsWith('.json')) {
          const scopeKey = rel === '' ? sanitizeName(scope) : rel;
          if (scopes && !scopes.includes(scopeKey)) continue;
          try {
            const entry = readJson(full);
            out.push({
              id: entry.id,
              type: entry.type,
              scope: entry.scope,
              key: entry.key,
              version: entry.version,
              updatedAt: entry.updatedAt,
              tags: entry.metadata?.tags ?? []
            });
          } catch {
            /* corrupt entry skipped */
          }
        }
      }
    };
    walk(dir, '');
    return out;
  }

  versions(type, scope, key) {
    this._guardOpen();
    this._validateType(type);
    const resolvedScope = resolveScope(type, scope);
    const entry = this._entryFromDisk(type, resolvedScope, key);
    if (!entry) throw memError(MEM_CODES.ENTRY_NOT_FOUND, `no memory entry ${type}:${resolvedScope}:${key}`, { type, scope: resolvedScope, key });
    const history = [...(entry.versions ?? [])];
    const latest = {
      version: entry.version,
      ts: entry.updatedAt,
      content: entry.content,
      fingerprint: entry.fingerprint,
      compressed: false
    };
    return [latest, ...history.map((v) => ({ ...this._decompressVersion(v), compressed: !!v.__compressed }))];
  }

  rollback(type, scope, key, version) {
    this._guardOpen();
    this._validateType(type);
    const resolvedScope = resolveScope(type, scope);
    const entry = this._entryFromDisk(type, resolvedScope, key);
    if (!entry) throw memError(MEM_CODES.ENTRY_NOT_FOUND, `no memory entry ${type}:${resolvedScope}:${key}`, { type, scope: resolvedScope, key });
    const target = (entry.versions ?? []).find((v) => v.version === version);
    if (!target) throw memError(MEM_CODES.VERSION_NOT_FOUND, `memory entry ${key} has no version ${version}`, { type, scope: resolvedScope, key, version });
    const restored = this._decompressVersion(target);
    const now = new Date().toISOString();
    const history = entry.versions ?? [];
    history.unshift({
      version: entry.version,
      ts: entry.updatedAt,
      content: entry.content,
      fingerprint: entry.fingerprint,
      rollbackOf: null
    });
    entry.versions = history.slice(0, this.maxVersions - 1);
    entry.content = restored.content;
    entry.version = entry.version + 1;
    entry.fingerprint = fingerprintFor(type, resolvedScope, key, restored.content);
    entry.contentFingerprint = contentFingerprint(type, resolvedScope, entry.content);
    entry.updatedAt = now;
    entry.accessedAt = now;
    entry.metadata = { ...(entry.metadata ?? {}), rollbackTo: version };
    writeJson(this._entryPath(type, resolvedScope, key), entry);
    this._indexEntry(entry);
    this._saveIndex();
    this.stats.rollbacks++;
    return entry;
  }

  snapshot(name, { type = null } = {}) {
    this._guardOpen();
    const now = new Date();
    const id = `snap-${name ?? 'auto'}-${now.toISOString().replace(/[:.]/g, '-')}`;
    const entries = [];
    const types = type ? [type] : TYPE_NAMES;
    for (const t of types) {
      for (const meta of this.list(t)) {
        const entry = this._entryFromDisk(t, meta.scope, meta.key);
        if (entry) entries.push(entry);
      }
    }
    const payload = {
      schema: 'https://agency.os/memory/snapshot',
      id,
      name: name ?? null,
      type: type ?? null,
      createdAt: now.toISOString(),
      count: entries.length,
      entries
    };
    atomicWrite(path.join(this._snapshotDir(), `${id}.json`), JSON.stringify(payload, null, 2));
    this.stats.snapshots++;
    return id;
  }

  listSnapshots() {
    const dir = this._snapshotDir();
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const snap = readJson(path.join(dir, f));
          return { id: snap.id, name: snap.name, type: snap.type, createdAt: snap.createdAt, count: snap.count };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  restoreSnapshot(id) {
    this._guardOpen();
    const snap = this.listSnapshots().find((s) => s.id === id);
    if (!snap) throw memError(MEM_CODES.SNAPSHOT_NOT_FOUND, `no snapshot "${id}"`, { id });
    const payload = readJson(path.join(this._snapshotDir(), `${id}.json`));
    for (const entry of payload.entries) {
      writeJson(this._entryPath(entry.type, entry.scope, entry.key), entry);
      this._indexEntry(entry);
    }
    this._saveIndex();
    this.stats.restores++;
    return payload.count;
  }

  search(query, { type = null, scope = null, limit = 10 } = {}) {
    this._guardOpen();
    this.stats.searches++;
    const tokens = String(query).toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const scored = [];
    for (const idx of this.index.entries) {
      if (type && idx.type !== type) continue;
      if (scope && idx.scope !== scope) continue;
      const content = this._entryFromDisk(idx.type, idx.scope, idx.key);
      if (!content) continue;
      const haystack = `${idx.key} ${idx.tags.join(' ')} ${idx.summary} ${JSON.stringify(content.content ?? {}).toLowerCase().slice(0, 6000)}`;
      let score = 0;
      let snippet = null;
      for (const token of tokens) {
        const pos = haystack.toLowerCase().indexOf(token);
        if (pos >= 0) {
          if (idx.key.toLowerCase().includes(token)) score += 5;
          else if ((idx.tags.join(' ').toLowerCase()).includes(token)) score += 4;
          else if ((idx.summary.toLowerCase()).includes(token)) score += 3;
          else score += 1;
          if (snippet === null) snippet = haystack.slice(Math.max(0, pos - 50), pos + 80).replace(/\s+/g, ' ').trim();
        }
      }
      if (score > 0) scored.push({ score, id: idx.id, type: idx.type, scope: idx.scope, key: idx.key, version: content.version, updatedAt: idx.updatedAt, snippet });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  compress(type, scope, key) {
    this._guardOpen();
    this._validateType(type);
    const resolvedScope = resolveScope(type, scope);
    const entry = this._entryFromDisk(type, resolvedScope, key);
    if (!entry) throw memError(MEM_CODES.ENTRY_NOT_FOUND, `no memory entry ${type}:${resolvedScope}:${key}`, { type, scope: resolvedScope, key });
    const history = entry.versions ?? [];
    entry.versions = this._compressOldVersions(history, entry.version);
    writeJson(this._entryPath(type, resolvedScope, key), entry);
    return entry.versions.filter((v) => v.__compressed).length;
  }

  async sweepExpired() {
    if (this.closed) return 0;
    let removed = 0;
    for (const type of TYPE_NAMES) {
      for (const meta of this.list(type)) {
        const entry = this._entryFromDisk(type, meta.scope, meta.key);
        if (entry && this._isExpired(entry)) {
          fs.unlinkSync(this._entryPath(type, meta.scope, meta.key));
          this._unindexEntry(entry);
          removed++;
        }
      }
    }
    if (removed > 0) {
      this._saveIndex();
      this.stats.expired += removed;
    }
    return removed;
  }

  rebuildIndex() {
    const entries = [];
    for (const type of TYPE_NAMES) {
      for (const meta of this.list(type)) {
        const entry = this._entryFromDisk(type, meta.scope, meta.key);
        if (entry) entries.push(entry);
      }
    }
    this.index = { entries: [], byFingerprint: {}, byContentFingerprint: {} };
    for (const entry of entries) this._indexEntry(entry);
    this._saveIndex();
    return this.index.entries.length;
  }

  statsSnapshot() {
    return { ...this.stats, indexEntries: this.index.entries.length };
  }

  close() {
    if (this._sweeper) clearInterval(this._sweeper);
    this.closed = true;
  }
}
