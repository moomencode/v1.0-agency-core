import fs from 'node:fs';
import path from 'node:path';
import { nowIso, ensureDir, writeJson, readJson, atomicWrite } from '../runtime/utils.js';
import { metError, MET_CODES } from './errors.js';

const KNOWN_EVENTS = [
  'businessDiscovered',
  'businessSkipped',
  'businessApproved',
  'websiteGenerated',
  'executionSucceeded',
  'executionFailed',
  'retry',
  'escalation'
];

export class MetricsCollector {
  constructor({ root = null, events = null } = {}) {
    this.root = root ? path.resolve(root) : null;
    this.file = this.root ? path.join(this.root, 'metrics.json') : null;
    this.events = { ...(events || {}) };
    this.counters = {};
    this.sums = {};
    this.startedAt = nowIso();
    if (this.root) this._load();
  }

  _load() {
    const data = readJson(this.file, null);
    if (data) {
      this.counters = data.counters || {};
      this.sums = data.sums || {};
      this.startedAt = data.startedAt || this.startedAt;
    }
  }

  record(event, { value = 1, amount = null, sumKey = null } = {}) {
    if (!KNOWN_EVENTS.includes(event) && !this.events[event]) {
      throw metError(MET_CODES.INVALID_EVENT, `unknown metric event "${event}"`, { event });
    }
    this.counters[event] = (this.counters[event] || 0) + value;
    if (amount != null) {
      const key = sumKey || event;
      this.sums[key] = this.sums[key] || { total: 0, count: 0 };
      this.sums[key].total += amount;
      this.sums[key].count += 1;
    }
    this.persist();
    return this;
  }

  discovered(n = 1) { return this.record('businessDiscovered', { value: n }); }
  skipped(n = 1) { return this.record('businessSkipped', { value: n }); }
  approved(n = 1) { return this.record('businessApproved', { value: n }); }
  websiteGenerated(n = 1) { return this.record('websiteGenerated', { value: n }); }
  succeeded(n = 1) { return this.record('executionSucceeded', { value: n }); }
  failed(n = 1) { return this.record('executionFailed', { value: n }); }
  retried(n = 1) { return this.record('retry', { value: n }); }
  escalated(n = 1) { return this.record('escalation', { value: n }); }

  trackOpportunity(score) { return this.record('businessApproved', { value: 0, amount: score, sumKey: 'opportunity' }); }
  trackBuildTime(ms) { return this.record('websiteGenerated', { value: 0, amount: ms, sumKey: 'buildTime' }); }
  trackRevenue(amount) { return this.record('businessApproved', { value: 0, amount, sumKey: 'revenue' }); }

  avg(sumKey) {
    const s = this.sums[sumKey];
    return s && s.count ? Math.round(s.total / s.count * 100) / 100 : 0;
  }

  snapshot() {
    const succeeded = this.counters.executionSucceeded || 0;
    const failed = this.counters.executionFailed || 0;
    const total = succeeded + failed;
    const successRate = total ? Math.round((succeeded / total) * 10000) / 100 : 0;
    return {
      startedAt: this.startedAt,
      updatedAt: nowIso(),
      businesses: {
        discovered: this.counters.businessDiscovered || 0,
        skipped: this.counters.businessSkipped || 0,
        approved: this.counters.businessApproved || 0,
        websitesGenerated: this.counters.websiteGenerated || 0
      },
      performance: {
        avgOpportunityScore: this.avg('opportunity'),
        estimatedRevenue: this.sums.revenue ? this.sums.revenue.total : 0,
        avgBuildTimeMs: this.avg('buildTime')
      },
      reliability: {
        successRate,
        failureRate: total ? Math.round((failed / total) * 10000) / 100 : 0,
        retryCount: this.counters.retry || 0,
        escalations: this.counters.escalation || 0
      },
      counters: { ...this.counters },
      sums: JSON.parse(JSON.stringify(this.sums))
    };
  }

  persist() {
    if (!this.file) return;
    try {
      ensureDir(path.dirname(this.file));
      atomicWrite(this.file, JSON.stringify({ startedAt: this.startedAt, counters: this.counters, sums: this.sums }, null, 2));
    } catch (e) {
      throw metError(MET_CODES.STORE_ERROR, `metrics persist failed: ${e.message}`);
    }
  }

  reset() {
    this.counters = {};
    this.sums = {};
    this.persist();
    return this;
  }
}

export function createMetricsCollector(opts) {
  return new MetricsCollector(opts);
}
