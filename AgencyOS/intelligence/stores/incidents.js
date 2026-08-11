import path from 'node:path';
import { readJson, atomicWrite } from '../../runtime/utils.js';
import { intError, INT_CODES } from '../errors.js';
import { incidentKeyFor, incidentIdFor } from '../ids.js';
import { appendNdjson, readNdjson, ensureDir, atomicWrite as atomicWriteLocal } from '../utils.js';

const CURRENT_FILE = 'current.json';
const HISTORY_FILE = 'history.ndjson';

export class IncidentStore {
  constructor({ root, evidenceCap = 50, clock = null }) {
    this.root = root;
    this.dir = path.join(root, 'incidents');
    this.currentFile = path.join(this.dir, CURRENT_FILE);
    this.historyFile = path.join(this.dir, HISTORY_FILE);
    this.evidenceCap = Math.max(1, evidenceCap);
    this.now = clock?.now || (() => new Date());
    this.current = this._load();
  }

  _load() {
    const data = readJson(this.currentFile, null);
    return data && typeof data.incidents === 'object' ? data.incidents : {};
  }

  _save() {
    atomicWrite(this.currentFile, JSON.stringify({ updatedAt: this.now().toISOString(), incidents: this.current }, null, 2));
  }

  _appendHistory(event, incident) {
    appendNdjson(this.historyFile, {
      schema: 'https://agency.os/intelligence/incident-history',
      at: this.now().toISOString(),
      event,
      incidentId: incident.incidentId,
      key: incident.key,
      status: incident.status,
      count: incident.count,
      snapshot: incident
    });
  }

  // Deterministic trigger entry. Signals with the same (scope, kind, subject)
  // collapse onto one incident record (dedupe + evidence cap).
  upsert({ scope, kind, severity, subject = '', detail = '', evidence = [] }) {
    const now = this.now().toISOString();
    const key = incidentKeyFor(scope.type, scope.id, kind, subject);
    const existing = this.current[key];
    if (existing) {
      existing.count += 1;
      existing.lastSeen = now;
      if (detail) existing.detail = detail;
      for (const ev of evidence || []) {
        if (!existing.evidence.includes(ev)) {
          existing.evidence.push(ev);
        }
      }
      if (existing.evidence.length > this.evidenceCap) existing.evidence = existing.evidence.slice(-this.evidenceCap);
      if (existing.status === 'resolved' || existing.status === 'closed') {
        existing.status = 'open';
        existing.openedAt = now;
      }
      this._save();
      this._appendHistory('updated', existing);
      return { incident: existing, created: false };
    }
    const incident = {
      schema: 'https://agency.os/intelligence/incident',
      incidentId: incidentIdFor(key),
      key,
      kind,
      severity,
      status: 'open',
      scope: { type: scope.type, id: scope.id },
      firstSeen: now,
      lastSeen: now,
      openedAt: now,
      acknowledgedAt: null,
      resolvedAt: null,
      count: 1,
      evidence: (evidence || []).slice(0, this.evidenceCap),
      detail: detail || ''
    };
    this.current[key] = incident;
    this._save();
    this._appendHistory('opened', incident);
    return { incident, created: true };
  }

  resolve({ key, by = 'job', note = 'condition cleared' }) {
    const incident = this.current[key];
    if (!incident) throw intError(INT_CODES.INVALID_INCIDENT, `no incident "${key}"`, { key });
    if (incident.status === 'resolved' || incident.status === 'closed') return { incident, changed: false };
    const now = this.now().toISOString();
    incident.status = 'resolved';
    incident.resolvedAt = now;
    incident.resolvedBy = by;
    incident.resolutionNote = note;
    this._save();
    this._appendHistory('resolved', incident);
    return { incident, changed: true };
  }

  ack({ key, by = 'operator' }) {
    const incident = this.current[key];
    if (!incident) throw intError(INT_CODES.INVALID_INCIDENT, `no incident "${key}"`, { key });
    if (incident.status === 'open') {
      incident.status = 'acknowledged';
      incident.acknowledgedAt = this.now().toISOString();
      this._save();
      this._appendHistory('acknowledged', incident);
    }
    return { incident, changed: true };
  }

  close({ key, by = 'operator', note = '' }) {
    const incident = this.current[key];
    if (!incident) throw intError(INT_CODES.INVALID_INCIDENT, `no incident "${key}"`, { key });
    const now = this.now().toISOString();
    if (incident.status === 'open') incident.acknowledgedAt = now;
    if (!incident.resolvedAt) {
      incident.resolvedAt = now;
      incident.resolvedBy = by;
    }
    incident.status = 'closed';
    incident.resolutionNote = note || incident.resolutionNote || '';
    this._save();
    this._appendHistory('closed', incident);
    return { incident, changed: true };
  }

  get(key) {
    return this.current[key] || null;
  }

  list({ status = null, kind = null } = {}) {
    let out = Object.values(this.current);
    if (status) out = out.filter((i) => i.status === status);
    if (kind) out = out.filter((i) => i.kind === kind);
    return out.sort((a, b) => (a.openedAt === b.openedAt ? a.key.localeCompare(b.key) : a.openedAt < b.openedAt ? 1 : -1));
  }

  openCount() {
    return this.list({ status: 'open' }).length;
  }

  history({ max = 500 } = {}) {
    const lines = readNdjson(this.historyFile);
    return lines.slice(-max);
  }
}

export { ensureDir, atomicWriteLocal };
