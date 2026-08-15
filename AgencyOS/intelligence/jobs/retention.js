import fs from 'node:fs';
import path from 'node:path';
import { readJson, atomicWrite } from '../../runtime/utils.js';
import { intError, INT_CODES } from '../errors.js';
import { dateKey, dirSize } from '../utils.js';
import { buildInsight } from './framework.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function cutoffIso(days, nowIso) {
  return new Date(new Date(nowIso).getTime() - days * DAY_MS).toISOString();
}

function olderThanDateKey(day, cutoffIsoStr) {
  return day < dateKey(cutoffIsoStr);
}

function sweepDir(dir, { days, nowIso, dryRun }) {
  const out = { removed: 0, bytes: 0, files: [] };
  if (!dir || !fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ndjson')) continue;
    const day = entry.name.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (!olderThanDateKey(day, cutoffIso(days, nowIso))) continue;
    const full = path.join(dir, entry.name);
    if (!dryRun) {
      try {
        const size = fs.statSync(full).size;
        fs.unlinkSync(full);
        out.removed++;
        out.bytes += size;
        out.files.push(entry.name);
      } catch {
        /* already gone or in use — skip */
      }
    } else {
      out.removed++;
      try {
        out.bytes += fs.statSync(full).size;
      } catch {
        /* missing file counts zero */
      }
      out.files.push(entry.name);
    }
  }
  return out;
}

function sweepJsonDir(dir, { days, nowIso, dryRun, windowKey = null }) {
  const out = { removed: 0, bytes: 0, files: [] };
  if (!dir || !fs.existsSync(dir)) return out;
  const cutoff = cutoffIso(days, nowIso);
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) {
        let windowEnd = null;
        try {
          const record = readJson(full, null);
          if (record && record.window && record.window.end) windowEnd = record.window.end;
          else if (record && windowKey && record[windowKey]) windowEnd = record[windowKey];
        } catch {
          /* unreadable records are never deleted (guard) */
          continue;
        }
        if (!windowEnd) continue;
        if (windowEnd >= cutoff) continue;
        if (!dryRun) {
          try {
            out.bytes += fs.statSync(full).size;
            fs.unlinkSync(full);
            out.removed++;
            out.files.push(entry.name);
          } catch {
            /* skip */
          }
        } else {
          out.removed++;
          try {
            out.bytes += fs.statSync(full).size;
          } catch {
            /* missing */
          }
          out.files.push(entry.name);
        }
      }
    }
  };
  walk(dir);
  return out;
}

function sweepIncidentsCurrent(file, { days, nowIso, dryRun }) {
  const out = { removed: 0, files: [] };
  if (!file || !fs.existsSync(file)) return out;
  const data = readJson(file, null);
  if (!data || typeof data.incidents !== 'object') return out;
  const cutoff = cutoffIso(days, nowIso);
  const remaining = {};
  let removed = 0;
  for (const [key, incident] of Object.entries(data.incidents)) {
    // Live incidents (open/acknowledged) are never deleted — only resolved or
    // closed incidents past the retention window.
    const terminal = incident.status === 'resolved' || incident.status === 'closed';
    const ref = incident.lastSeen || incident.resolvedAt || incident.closedAt || incident.updatedAt || null;
    if (terminal && ref && ref < cutoff) removed++;
    else remaining[key] = incident;
  }
  if (!dryRun && removed > 0) {
    const saved = { ...data, incidents: remaining, updatedAt: data.updatedAt || cutoff };
    atomicWrite(file, JSON.stringify(saved, null, 2));
  }
  out.removed = removed;
  return out;
}

function sweepAlertsCurrent(file, { days, nowIso, dryRun }) {
  const out = { removed: 0, files: [] };
  if (!file || !fs.existsSync(file)) return out;
  const data = readJson(file, null);
  if (!data || typeof data.alerts !== 'object') return out;
  const cutoff = cutoffIso(days, nowIso);
  const remaining = {};
  let removed = 0;
  for (const [id, alert] of Object.entries(data.alerts)) {
    const terminal = alert.status === 'resolved';
    const ref = alert.resolvedAt || alert.updatedAt || alert.triggeredAt || null;
    if (terminal && ref && ref < cutoff) removed++;
    else remaining[id] = alert;
  }
  if (!dryRun && removed > 0) {
    const saved = { ...data, alerts: remaining, updatedAt: data.updatedAt || cutoff };
    atomicWrite(file, JSON.stringify(saved, null, 2));
  }
  out.removed = removed;
  return out;
}

// 4.7.0 retention sweep. Operates ONLY inside the intelligence storageRoot
// (events/metrics/observations/insights/aggregates/incidents/alerts) plus a
// read-only size report for the scheduler history. Never touches logs/ or
// orchestrator/delivery storage. Open incidents and active alerts are never
// deleted; today's files are never deleted (strictly-older cutoffs).
export async function runRetentionSweep({ ctx, nowIso, dryRun = false } = {}) {
  if (!ctx || !ctx.root) throw intError(INT_CODES.STORE_ERROR, 'retention sweep requires the intelligence ctx', {});
  const cfg = ctx.config?.retention || {};
  const jobsCfg = ctx.config?.jobs?.retention || {};
  const storage = ctx.root;
  const result = {
    dryRun,
    enabled: cfg.enableSweeps !== false,
    events: sweepDir(path.join(storage, 'events'), { days: cfg.rawEventsDays ?? 90, nowIso, dryRun }),
    metrics: sweepDir(path.join(storage, 'metrics'), { days: cfg.rawMetricsDays ?? 90, nowIso, dryRun }),
    observations: sweepDir(path.join(storage, 'observations'), { days: cfg.observationsDays ?? 90, nowIso, dryRun }),
    insights: sweepJsonDir(path.join(storage, 'insights'), { days: cfg.aggregatesDays ?? 730, nowIso, dryRun }),
    aggregates: sweepJsonDir(path.join(storage, 'metrics', 'aggregates'), { days: cfg.aggregatesDays ?? 730, nowIso, dryRun }),
    incidents: sweepIncidentsCurrent(path.join(storage, 'incidents', 'current.json'), { days: cfg.incidentsDays ?? 730, nowIso, dryRun }),
    alerts: sweepAlertsCurrent(path.join(storage, 'alerts', 'current.json'), { days: cfg.alertsDays ?? 730, nowIso, dryRun }),
    schedulerHistoryBytes: 0,
    artifactsExpired: 0
  };

  // Scheduler history is scheduler-owned; this job only reports its size.
  const reader = ctx.reader;
  if (reader && reader.schedulerBaseDir) {
    try {
      result.schedulerHistoryBytes = dirSize(reader.schedulerBaseDir);
    } catch {
      result.schedulerHistoryBytes = 0;
    }
  }

  // Artifact expiry is delegated to the ArtifactManager's own sweep (expiresAt
  // only — never referenced/alive artifacts).
  if (ctx.artifacts && typeof ctx.artifacts.cleanup === 'function') {
    try {
      const probe = ctx.artifacts.cleanup({ expire: true, dryRun: true });
      result.artifactsExpired = probe ? probe.removed : 0;
      if (!dryRun && probe && probe.removed > 0 && typeof ctx.artifacts.sweepExpired === 'function') {
        result.artifactsExpired = await ctx.artifacts.sweepExpired();
      }
    } catch {
      /* artifact expiry is best-effort */
    }
  }

  const filesRemoved =
    result.events.removed + result.metrics.removed + result.observations.removed + result.insights.removed + result.aggregates.removed + result.incidents.removed + result.alerts.removed;
  const bytesFreed =
    result.events.bytes + result.metrics.bytes + result.observations.bytes + result.insights.bytes + result.aggregates.bytes;
  result.filesRemoved = filesRemoved;
  result.bytesFreed = bytesFreed;
  result.sweptAt = nowIso;
  result.retentionConfig = { rawEventsDays: cfg.rawEventsDays ?? 90, rawMetricsDays: cfg.rawMetricsDays ?? 90, observationsDays: cfg.observationsDays ?? 90, incidentsDays: cfg.incidentsDays ?? 730, alertsDays: cfg.alertsDays ?? 730, aggregatesDays: cfg.aggregatesDays ?? 730 };
  result.job = { version: jobsCfg.version || 1, schedule: jobsCfg.schedule || null };
  return result;
}

// Scheduled job (registered in buildJobSet). Windowed + marked via JobFramework
// — idempotent by construction (deleting a missing file is a no-op). The ctx is
// closure-bound at build time (the framework passes a possibly-null ctx param).
export function retentionJob({ reader, metrics, insights, config, root, artifacts }) {
  const c = config.jobs.retention || { version: 1, schedule: '0 5 * * *', windowMs: 86400000, maxWindows: 7 };
  return {
    name: 'intelligence:retention',
    version: c.version,
    schedule: c.schedule,
    windowMs: c.windowMs,
    maxWindows: c.maxWindows,
    async run({ window, now }) {
      const sweepCtx = { config, root, reader, artifacts };
      const retentionCfg = config?.retention || {};
      if (retentionCfg.enableSweeps === false) {
        const disabled = buildInsight({
          kind: 'retention',
          scope: { type: 'agency', id: 'agency' },
          window,
          job: 'intelligence:retention',
          jobVersion: c.version,
          data: { disabled: true },
          summary: 'retention sweeps disabled by config',
          inputs: { windowStart: window.start, windowEnd: window.end }
        });
        insights.put(disabled);
        return [disabled];
      }
      const result = await runRetentionSweep({ ctx: sweepCtx, nowIso: now, dryRun: false });
      const data = {
        filesRemoved: result.filesRemoved,
        bytesFreed: result.bytesFreed,
        byArea: {
          events: result.events.removed,
          metrics: result.metrics.removed,
          observations: result.observations.removed,
          insights: result.insights.removed,
          aggregates: result.aggregates.removed,
          incidents: result.incidents.removed,
          alerts: result.alerts.removed
        },
        schedulerHistoryBytes: result.schedulerHistoryBytes,
        artifactsExpired: result.artifactsExpired
      };
      metrics.record({
        schema: 'https://agency.os/intelligence/metric-point',
        ts: window.end,
        metric: 'retention.filesRemoved',
        value: result.filesRemoved,
        kind: 'counter',
        scope: { type: 'agency', id: 'agency' },
        source: { type: 'record', recordId: `retention:${window.start}` },
        correlation: { windowStart: window.start, windowEnd: window.end }
      });
      metrics.record({
        schema: 'https://agency.os/intelligence/metric-point',
        ts: window.end,
        metric: 'retention.bytesFreed',
        value: result.bytesFreed,
        kind: 'counter',
        scope: { type: 'agency', id: 'agency' },
        source: { type: 'record', recordId: `retention:${window.start}` },
        correlation: { windowStart: window.start, windowEnd: window.end }
      });
      const insight = buildInsight({
        kind: 'retention',
        scope: { type: 'agency', id: 'agency' },
        window,
        job: 'intelligence:retention',
        jobVersion: c.version,
        data,
        summary: `retention swept ${result.filesRemoved} files (${result.bytesFreed} bytes)`,
        inputs: { windowStart: window.start, windowEnd: window.end }
      });
      insights.put(insight);
      return [insight];
    }
  };
}