import { utcWindowFor } from '../utils.js';
import { alertIdFor } from '../ids.js';

// Derived metrics and the raw points they are computed from.
const DERIVED_BASES = {
  'agency.failureRatePct': ['execution.failed', 'execution.succeeded'],
  'agency.successRatePct': ['execution.failed', 'execution.succeeded'],
  'campaign.successRatePct': ['execution.failed', 'execution.succeeded'],
  'provider.failureRatePct': ['provider.failures', 'provider.attempts'],
  'provider.verifyAvgMs': ['provider.verifyDurationMs'],
  'scheduler.jobSuccessRatePct': ['scheduler.jobsSucceeded', 'scheduler.jobsFailed']
};

// Alert evaluation job. Metric rules compare a derived/aggregated value against
// a threshold per scope; kind rules mirror open incidents of a given kind.
// Activation is deduped by deterministic alertId and gated by cooldown;
// non-met rules resolve their active alerts for the same (rule, scope).
function scopesFor(metrics, bases, scopeType, w) {
  if (scopeType === 'agency') return ['agency'];
  const scopes = new Set();
  for (const base of bases) {
    for (const p of metrics.readPoints({ metric: base, scopeType, start: w.start, end: w.end })) scopes.add(p.scope.id);
  }
  return [...scopes].sort();
}

function aggregate(points) {
  if (!points.length) return null;
  const kind = points[0].kind;
  const sum = points.reduce((acc, p) => acc + p.value, 0);
  if (kind === 'counter') return Math.round(sum * 100) / 100;
  return Math.round((sum / points.length) * 100) / 100;
}

function met(rule, value) {
  if (value === null || value === undefined) return false;
  switch (rule.op) {
    case 'gt': return value > rule.threshold;
    case 'gte': return value >= rule.threshold;
    case 'lt': return value < rule.threshold;
    case 'lte': return value <= rule.threshold;
    case 'eq': return value === rule.threshold;
    case 'ne': return value !== rule.threshold;
    default: return false;
  }
}

export function alertsJob({ metrics, incidents, alerts, rules, config, root }) {
  const ac = config.alerts;
  return {
    name: 'intelligence:alerts',
    version: 1,
    schedule: '0 * * * *',
    windowMs: 3600000,
    maxWindows: 48,
    async run({ window, now, ctx }) {
      const activated = [];
      const resolved = [];
      const metricRules = rules.filter((r) => r.metric);
      const kindRules = rules.filter((r) => r.kind);

      for (const rule of metricRules) {
        if (rule.enabled === false) continue;
        const w = utcWindowFor(now, rule.windowMs || ac.windowMs);
        const scopeType = rule.scopeType;
        const bases = DERIVED_BASES[rule.metric] || [rule.metric];
        const scopeIds = scopesFor(metrics, bases, scopeType, w);
        for (const scopeId of scopeIds) {
          const points = [];
          for (const base of bases) {
            // Agency-scoped rules aggregate base points across every scope;
            // per-scope rules (provider/campaign/step) are scoped tightly.
            const opts = { metric: base, start: w.start, end: w.end };
            if (scopeType !== 'agency') {
              opts.scopeType = scopeType;
              opts.scopeId = scopeId;
            }
            for (const p of metrics.readPoints(opts)) points.push(p);
          }
          const samples = points.length;
          const value = DERIVED_BASES[rule.metric]
            ? metrics.derive(rule.metric, points)
            : aggregate(points);
          const isMet = met(rule, value);
          const scope = { type: scopeType, id: scopeId };
          const alertId = alertIdFor(rule.ruleId, scopeType, scopeId, w.start);
          const existing = alerts.get(alertId);
          const hasActiveForScope = alerts.list({ ruleId: rule.ruleId, status: 'active' }).some((a) => a.scope.type === scopeType && a.scope.id === scopeId);

          if (samples < (rule.minSamples || ac.minSamples)) {
            if (hasActiveForScope) resolved.push(...alerts.resolveForRuleScope(rule.ruleId, scopeType, scopeId, { by: 'job', note: 'insufficient samples to evaluate' }));
            continue;
          }
          if (isMet) {
            if (hasActiveForScope || existing && existing.status === 'active') continue;
            if (alerts.cooldownActive(rule.ruleId, scope, rule.cooldownMs || ac.cooldownMs)) continue;
            const record = {
              schema: 'https://agency.os/intelligence/alert-record',
              alertId,
              ruleId: rule.ruleId,
              severity: rule.severity,
              status: 'active',
              triggeredAt: now,
              window: { start: w.start, end: w.end },
              scope,
              triggeredBy: { metric: rule.metric, value, threshold: rule.threshold, samples, op: rule.op, comparison: `${value} ${rule.op} ${rule.threshold}`, window: { start: w.start, end: w.end } }
            };
            const result = alerts.activate(record);
            if (result.created) activated.push(result.alert);
          } else if (existing && existing.status === 'active') {
            resolved.push(alerts.resolve(alertId, { by: 'job', note: `condition cleared (${value} ${rule.op} ${rule.threshold} no longer holds)` }));
          }
        }
      }

      for (const rule of kindRules) {
        if (rule.enabled === false) continue;
        const open = incidents.list({ status: 'open' }).filter((i) => i.kind === rule.kind);
        for (const incident of open) {
          const scope = incident.scope;
          const alertId = alertIdFor(rule.ruleId, scope.type, scope.id, incident.openedAt);
          if (alerts.get(alertId)) continue;
          const record = {
            schema: 'https://agency.os/intelligence/alert-record',
            alertId,
            ruleId: rule.ruleId,
            severity: rule.severity,
            status: 'active',
            triggeredAt: now,
            window: { start: window.start, end: window.end },
            scope,
            triggeredBy: { kind: rule.kind, incidentId: incident.incidentId, incidentKey: incident.key, count: incident.count }
          };
          const result = alerts.activate(record);
          if (result.created) activated.push(result.alert);
        }
        for (const active of alerts.list({ ruleId: rule.ruleId, status: 'active' })) {
          const stillOpen = open.some((i) => i.scope.type === active.scope.type && i.scope.id === active.scope.id);
          if (!stillOpen) resolved.push(alerts.resolve(active.alertId, { by: 'job', note: 'no open incident of matching kind' }));
        }
      }

      return { activated: activated.length, resolved: resolved.length, rules: rules.length };
    }
  };
}
