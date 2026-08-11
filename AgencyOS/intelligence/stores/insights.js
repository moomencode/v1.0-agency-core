import fs from 'node:fs';
import path from 'node:path';
import { readJson, atomicWrite } from '../../runtime/utils.js';
import { intError, INT_CODES } from '../errors.js';
import { windowKeyFor, sanitizeScopeId } from '../ids.js';
import { ensureDir } from '../utils.js';

// Recompute-over-write insight store: each deterministic (kind, scope, window)
// combination maps to exactly one file; re-running a job overwrites the same
// window's record with an identical value (idempotent by construction).
export class InsightStore {
  constructor({ root }) {
    this.root = root;
    this.dir = path.join(root, 'insights');
    ensureDir(this.dir);
  }

  pathFor(insight) {
    const kind = String(insight.kind).replace(/[^a-z0-9_\\-]/g, '');
    const scopeType = String(insight.scope.type).replace(/[^a-z0-9_\\-]/g, '');
    const scopeId = sanitizeScopeId(insight.scope.id);
    const key = windowKeyFor(insight.kind, insight.scope.type, insight.scope.id, insight.window.start, insight.window.end);
    return path.join(this.dir, kind, scopeType, scopeId, `${key}.json`);
  }

  put(insight) {
    if (!insight || !insight.insightId || !insight.kind || !insight.scope?.type || !insight.scope.id || !insight.window?.start || !insight.window?.end) {
      throw intError(INT_CODES.INVALID_INSIGHT, 'insight requires insightId/kind/scope/window', {});
    }
    const file = this.pathFor(insight);
    atomicWrite(file, JSON.stringify(insight, null, 2));
    return insight;
  }

  get(kind, scopeType, scopeId, window) {
    const probe = { kind, scope: { type: scopeType, id: scopeId }, window };
    const file = this.pathFor(probe);
    if (!fs.existsSync(file)) return null;
    return readJson(file, null);
  }

  list(kind, { scopeType = null, scopeId = null } = {}) {
    const base = kind ? path.join(this.dir, String(kind).replace(/[^a-z0-9_\\-]/g, '')) : this.dir;
    if (!fs.existsSync(base)) return [];
    const out = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.json')) {
          const insight = readJson(full, null);
          if (insight) out.push(insight);
        }
      }
    };
    walk(base);
    return out
      .filter((i) => (!scopeType || i.scope.type === scopeType) && (!scopeId || i.scope.id === scopeId))
      .sort((a, b) => (a.window?.start === b.window?.start ? a.insightId.localeCompare(b.insightId) : a.window?.start < b.window?.start ? 1 : -1));
  }
}
