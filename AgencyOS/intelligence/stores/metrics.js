import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, readJson, atomicWrite, stableStringify } from '../../runtime/utils.js';
import { intError, INT_CODES } from '../errors.js';
import { pointIdFor, windowKeyFor, sanitizeScopeId } from '../ids.js';
import { dateKey, appendNdjson, readNdjson, round2, pct } from '../utils.js';

// Typo-proof metric registry. Raw keys are recorded from events by the sink;
// derived keys are computed by jobs/alert evaluation from raw points.
export const SCOPES = ['agency', 'campaign', 'execution', 'business', 'provider', 'step', 'job'];
export const KINDS = ['counter', 'gauge', 'ratio', 'duration'];

export class MetricStore {
  constructor({ root, registry = [], derived = [], lruCap = 50000, clock = null } = {}) {
    this.root = root;
    this.dir = path.join(root, 'metrics');
    this.aggDir = path.join(this.dir, 'aggregates');
    this.registry = new Set(registry);
    this.derived = new Set(derived);
    this.lruCap = Math.max(100, lruCap);
    this.lru = new Map();
    this.stats = { points: 0, duplicates: 0, rejected: 0, aggregates: 0 };
    this.now = clock?.now || (() => new Date());
    ensureDir(this.dir);
    ensureDir(this.aggDir);
  }

  isRegistered(metric) {
    return this.registry.has(metric) || this.derived.has(metric);
  }

  assertRegistered(metric) {
    if (!this.isRegistered(metric)) {
      throw intError(INT_CODES.UNKNOWN_METRIC, `unknown metric "${metric}" (registry: ${[...this.registry].join(', ')})`, { metric });
    }
  }

  seriesFile(iso) {
    return path.join(this.dir, `${dateKey(iso)}.ndjson`);
  }

  record(point) {
    if (!point || typeof point !== 'object') throw intError(INT_CODES.INVALID_POINT, 'metric point must be an object', {});
    if (typeof point.metric !== 'string') throw intError(INT_CODES.INVALID_POINT, 'metric point requires "metric"', {});
    this.assertRegistered(point.metric);
    if (!KINDS.includes(point.kind)) throw intError(INT_CODES.INVALID_POINT, `unknown point kind "${point.kind}"`, { kind: point.kind });
    if (!SCOPES.includes(point.scope?.type)) throw intError(INT_CODES.INVALID_POINT, `unknown scope type "${point.scope?.type}"`, {});
    if (typeof point.value !== 'number' || !Number.isFinite(point.value)) throw intError(INT_CODES.INVALID_POINT, 'metric point value must be a finite number', {});

    const pid = pointIdFor(point.source?.eventId || point.source?.jobId || point.source?.recordId || 'manual', point.metric, point.scope.type, point.scope.id);
    if (this.lru.has(pid)) {
      this.stats.duplicates++;
      return false;
    }
    this.lru.set(pid, true);
    if (this.lru.size > this.lruCap) this.lru.delete(this.lru.keys().next().value);

    const stored = {
      schema: 'https://agency.os/intelligence/metric-point',
      ts: point.ts,
      metric: point.metric,
      value: point.value,
      kind: point.kind,
      scope: { type: point.scope.type, id: point.scope.id },
      source: point.source,
      correlation: point.correlation || {}
    };
    appendNdjson(this.seriesFile(stored.ts), stored);
    this.stats.points++;
    return true;
  }

  // Idempotent recompute-over-write for window aggregates.
  putAggregate(aggregate) {
    const key = windowKeyFor(aggregate.kind, aggregate.scope.type, aggregate.scope.id, aggregate.window.start, aggregate.window.end);
    const file = path.join(this.aggDir, `${key}.json`);
    atomicWrite(file, JSON.stringify(aggregate, null, 2));
    this.stats.aggregates++;
    return { key, file };
  }

  aggregateKey(aggregate) {
    return windowKeyFor(aggregate.kind, aggregate.scope.type, aggregate.scope.id, aggregate.window.start, aggregate.window.end);
  }

  getAggregate(key) {
    const file = path.join(this.aggDir, `${key}.json`);
    if (!fs.existsSync(file)) return null;
    return readJson(file, null);
  }

  listAggregates() {
    try {
      return fs.readdirSync(this.aggDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
    } catch {
      return [];
    }
  }

  // Read raw points. Optionally filtered by metric / scope / time range; date
  // range bounded by [start, end] when provided.
  readPoints({ metric = null, scopeType = null, scopeId = null, start = null, end = null } = {}) {
    const files = [];
    const startDay = start ? dateKey(start) : null;
    const endDay = end ? dateKey(end) : null;
    let all = fs.readdirSync(this.dir).filter((f) => f.endsWith('.ndjson')).sort();
    for (const f of all) {
      const day = f.slice(0, 10);
      if (startDay && day < startDay) continue;
      if (endDay && day > endDay) continue;
      files.push(path.join(this.dir, f));
    }
    const out = [];
    for (const file of files) {
      for (const p of readNdjson(file)) {
        if (metric && p.metric !== metric) continue;
        if (scopeType && p.scope?.type !== scopeType) continue;
        if (scopeId && p.scope?.id !== scopeId) continue;
        if (start && p.ts < start) continue;
        if (end && p.ts >= end) continue;
        out.push(p);
      }
    }
    out.sort((a, b) => (a.ts === b.ts ? String(a.metric).localeCompare(String(b.metric)) : a.ts < b.ts ? -1 : 1));
    return out;
  }

  // Aggregation helpers (deterministic; used by jobs and alert evaluation).
  sum(points) {
    return round2(points.reduce((acc, p) => acc + p.value, 0));
  }

  avg(points) {
    if (!points.length) return null;
    return round2(points.reduce((acc, p) => acc + p.value, 0) / points.length);
  }

  // Derived metric values computed from raw points within a window.
  derive(metric, points) {
    switch (metric) {
      case 'agency.failureRatePct':
        return this._rate(points, 'execution.failed', 'execution.succeeded');
      case 'agency.successRatePct':
        return this._rate(points, 'execution.succeeded', 'execution.failed');
      case 'campaign.successRatePct':
        return this._rate(points, 'execution.succeeded', 'execution.failed');
      case 'provider.failureRatePct':
        return this._rate(points, 'provider.failures', 'provider.attempts');
      case 'provider.verifyAvgMs':
        return this.avg(points.filter((p) => p.metric === 'provider.verifyDurationMs'));
      case 'scheduler.jobSuccessRatePct':
        return this._rate(points, 'scheduler.jobsSucceeded', 'scheduler.jobsFailed');
      default:
        return null;
    }
  }

  _rate(points, numeratorMetric, denominatorMetric) {
    const num = this.sum(points.filter((p) => p.metric === numeratorMetric));
    const den = this.sum(points.filter((p) => p.metric === denominatorMetric));
    return pct(num, num + den);
  }

  snapshot() {
    return {
      stats: { ...this.stats },
      rawFiles: (fs.existsSync(this.dir) ? fs.readdirSync(this.dir).filter((f) => f.endsWith('.ndjson')) : []).length,
      aggregates: this.listAggregates().length,
      registrySize: this.registry.size
    };
  }
}

export function stablePointsKey(points) {
  return stableStringify(points.map((p) => ({ ts: p.ts, metric: p.metric, value: p.value, scope: p.scope, source: p.source })));
}
