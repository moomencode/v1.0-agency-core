import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { orcError, ORC_CODES } from '../errors.js';
import { ensureDir, atomicWrite, readJson, nowIso } from '../utils.js';

const SAFE_ID_CHARS = /[^a-z0-9._-]/gi;

function lockIdFor(businessId) {
  const cleaned = String(businessId ?? 'unknown').replace(SAFE_ID_CHARS, '_').slice(0, 96);
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'unknown';
  return cleaned;
}

export class LockManager {
  constructor({ root = null, ttlMs = 300000 } = {}) {
    this.dir = root ? path.join(root, 'locks') : null;
    this.ttlMs = ttlMs;
    this.held = new Map();
  }

  _file(businessId) {
    return path.join(this.dir, `${lockIdFor(businessId)}.lock`);
  }

  _fresh(lock, now) {
    return now - Date.parse(lock.acquiredAt) < this.ttlMs;
  }

  acquire(businessId, executionId) {
    if (!this.dir) {
      this.held.set(businessId, executionId);
      return executionId;
    }
    ensureDir(this.dir);
    const file = this._file(businessId);
    const now = Date.now();
    const existing = readJson(file, null);
    if (existing && existing.executionId === executionId) {
      existing.acquiredAt = nowIso();
      existing.token = existing.token || randomUUID();
      atomicWrite(file, JSON.stringify(existing, null, 2));
      this.held.set(businessId, executionId);
      return existing.token;
    }
    if (existing && this._fresh(existing, now)) {
      throw orcError(ORC_CODES.LOCK_CONFLICT, `business "${businessId}" is locked by execution "${existing.executionId}"`, {
        businessId,
        holder: existing.executionId,
        retryable: true
      });
    }
    const token = randomUUID();
    atomicWrite(file, JSON.stringify({ businessId, executionId, token, acquiredAt: nowIso() }, null, 2));
    this.held.set(businessId, executionId);
    return token;
  }

  release(businessId, executionId) {
    if (!this.dir) {
      if (this.held.get(businessId) === executionId) this.held.delete(businessId);
      return;
    }
    const file = this._file(businessId);
    const existing = readJson(file, null);
    if (existing && (executionId == null || existing.executionId === executionId)) {
      try {
        fs.unlinkSync(file);
      } catch {
        /* already gone */
      }
    }
    this.held.delete(businessId);
  }

  breakStale(now = Date.now()) {
    if (!this.dir || !fs.existsSync(this.dir)) return 0;
    let broken = 0;
    for (const file of fs.readdirSync(this.dir)) {
      if (!file.endsWith('.lock')) continue;
      const lock = readJson(path.join(this.dir, file), null);
      if (lock && !this._fresh(lock, now)) {
        try {
          fs.unlinkSync(path.join(this.dir, file));
          broken++;
        } catch {
          /* best effort */
        }
      }
    }
    return broken;
  }

  snapshot() {
    return {
      held: [...this.held.entries()].map(([b, e]) => ({ businessId: b, executionId: e }))
    };
  }
}
