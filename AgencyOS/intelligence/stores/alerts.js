import path from 'node:path';
import { readJson, atomicWrite } from '../../runtime/utils.js';
import { intError, INT_CODES } from '../errors.js';
import { appendNdjson, readNdjson, ensureDir } from '../utils.js';

const CURRENT_FILE = 'current.json';
const HISTORY_FILE = 'history.ndjson';

export class AlertStore {
  constructor({ root, clock = null }) {
    this.root = root;
    this.dir = path.join(root, 'alerts');
    this.currentFile = path.join(this.dir, CURRENT_FILE);
    this.historyFile = path.join(this.dir, HISTORY_FILE);
    this.now = clock?.now || (() => new Date());
    const data = readJson(this.currentFile, null);
    this.current = data && typeof data.alerts === 'object' ? data.alerts : {};
    this.lastFired = data && typeof data.lastFired === 'object' ? data.lastFired : {};
  }

  _save() {
    atomicWrite(this.currentFile, JSON.stringify({ updatedAt: this.now().toISOString(), alerts: this.current, lastFired: this.lastFired }, null, 2));
  }

  _appendHistory(event, alert) {
    appendNdjson(this.historyFile, {
      schema: 'https://agency.os/intelligence/alert-history',
      at: this.now().toISOString(),
      event,
      alertId: alert.alertId,
      ruleId: alert.ruleId,
      status: alert.status,
      snapshot: alert
    });
  }

  cooldownActive(ruleId, scope, cooldownMs) {
    const key = `${ruleId}::${scope.type}::${scope.id}`;
    const firedAt = this.lastFired[key];
    if (!firedAt) return false;
    return this.now().getTime() - new Date(firedAt).getTime() < cooldownMs;
  }

  activate(record) {
    const existing = this.current[record.alertId];
    if (existing && existing.status === 'active') {
      return { alert: existing, created: false };
    }
    const key = `${record.ruleId}::${record.scope.type}::${record.scope.id}`;
    this.lastFired[key] = this.now().toISOString();
    this.current[record.alertId] = record;
    this._save();
    this._appendHistory('activated', record);
    return { alert: record, created: true };
  }

  resolve(alertId, { by = 'job', note = 'condition cleared' } = {}) {
    const alert = this.current[alertId];
    if (!alert) throw intError(INT_CODES.INVALID_ALERT, `no alert "${alertId}"`, { alertId });
    if (alert.status === 'resolved') return { alert, changed: false };
    alert.status = 'resolved';
    alert.resolvedAt = this.now().toISOString();
    alert.resolvedBy = by;
    alert.resolutionNote = note;
    this._save();
    this._appendHistory('resolved', alert);
    return { alert, changed: true };
  }

  resolveForRuleScope(ruleId, scopeType, scopeId, { by = 'job', note = 'condition cleared' } = {}) {
    const resolved = [];
    for (const [alertId, alert] of Object.entries(this.current)) {
      if (alert.status === 'active' && alert.ruleId === ruleId && alert.scope.type === scopeType && alert.scope.id === scopeId) {
        this.resolve(alertId, { by, note });
        resolved.push(alert);
      }
    }
    return resolved;
  }

  get(alertId) {
    return this.current[alertId] || null;
  }

  list({ status = null, ruleId = null } = {}) {
    let out = Object.values(this.current);
    if (status) out = out.filter((a) => a.status === status);
    if (ruleId) out = out.filter((a) => a.ruleId === ruleId);
    return out.sort((a, b) => (a.triggeredAt === b.triggeredAt ? a.alertId.localeCompare(b.alertId) : a.triggeredAt < b.triggeredAt ? 1 : -1));
  }

  activeCount() {
    return this.list({ status: 'active' }).length;
  }

  history({ max = 500 } = {}) {
    const lines = readNdjson(this.historyFile);
    return lines.slice(-max);
  }
}

export { ensureDir };
