import { round2 } from '../utils.js';
import { buildInsight } from './framework.js';

// Budget burn/utilization per campaign started in the window. Utilization is
// measured against the counter-backed limits; elapsed hours are pinned to the
// window end so recomputes are deterministic for a fixed campaign file.
const COUNTER_LIMIT_MAP = {
  maxBusinesses: 'businesses',
  maxDeployments: 'deployments',
  maxAiCalls: 'aiCalls',
  maxProviderCalls: 'providerCalls',
  maxRetries: 'retries'
};

export function budgetJob({ reader, metrics, insights, config, root }) {
  const c = config.jobs.budget;
  return {
    name: 'intelligence:budget',
    version: c.version,
    schedule: c.schedule,
    windowMs: c.windowMs,
    maxWindows: c.maxWindows,
    async run({ window, now, ctx }) {
      const inputs = { campaignsRead: 0, windowStart: window.start, windowEnd: window.end };
      const campaigns = reader
        .campaignIds()
        .map((id) => ({ id, file: reader.readCampaign(id) }))
        .filter((x) => x.file && x.file.createdAt && x.file.createdAt >= window.start && x.file.createdAt < window.end)
        .slice(0, c.maxCampaigns);
      inputs.campaignsRead = campaigns.length;
      const written = [];

      for (const { id, file } of campaigns) {
        const budget = (file && file.budget) || { limits: {}, counters: {} };
        const limits = budget.limits || {};
        const counters = budget.counters || {};
        const windowEndMs = new Date(window.end).getTime();
        const startedAtMs = budget.startedAt ? new Date(budget.startedAt).getTime() : windowEndMs;
        const elapsedHours = Math.max(1, (windowEndMs - startedAtMs) / 3600000);

        const perLimit = {};
        let utilizationPct = 0;
        let remainingPct = 100;
        let totalUnits = 0;
        for (const [limitKey, counterKey] of Object.entries(COUNTER_LIMIT_MAP)) {
          const limit = limits[limitKey];
          if (typeof limit !== 'number' || limit <= 0) continue;
          const used = counters[counterKey] ?? 0;
          const pct = round2((used / limit) * 100);
          perLimit[limitKey] = { used, limit, utilizationPct: pct, remainingPct: round2(100 - pct) };
          utilizationPct = Math.max(utilizationPct, pct);
          remainingPct = Math.min(remainingPct, perLimit[limitKey].remainingPct);
          totalUnits += used;
        }
        const burnPerHour = round2(totalUnits / elapsedHours);
        const reached = Array.isArray(budget.reached) ? budget.reached : [];

        metrics.record({
          schema: 'https://agency.os/intelligence/metric-point',
          ts: window.end,
          metric: 'budget.utilizationPct',
          value: utilizationPct,
          kind: 'gauge',
          scope: { type: 'campaign', id },
          source: { type: 'record', recordId: `budget-job:${id}:${window.start}` },
          correlation: { windowStart: window.start, windowEnd: window.end }
        });
        metrics.record({
          schema: 'https://agency.os/intelligence/metric-point',
          ts: window.end,
          metric: 'budget.burnPerHour',
          value: burnPerHour,
          kind: 'gauge',
          scope: { type: 'campaign', id },
          source: { type: 'record', recordId: `budget-job:${id}:${window.start}` },
          correlation: { windowStart: window.start, windowEnd: window.end }
        });
        metrics.record({
          schema: 'https://agency.os/intelligence/metric-point',
          ts: window.end,
          metric: 'budget.remainingPct',
          value: remainingPct,
          kind: 'ratio',
          scope: { type: 'campaign', id },
          source: { type: 'record', recordId: `budget-job:${id}:${window.start}` },
          correlation: { windowStart: window.start, windowEnd: window.end }
        });

        const data = {
          utilizationPct,
          remainingPct,
          burnPerHour,
          elapsedHours: round2(elapsedHours),
          totalUnits,
          perLimit,
          reached,
          projectedExhaustionHours: burnPerHour > 0 ? round2(remainingPct / (burnPerHour / totalUnits || 1)) : null
        };
        const insight = buildInsight({
          kind: 'budget_burn',
          scope: { type: 'campaign', id },
          window,
          job: 'intelligence:budget',
          jobVersion: c.version,
          data,
          summary: `${utilizationPct}% utilized (${burnPerHour} units/hr)`,
          inputs
        });
        insights.put(insight);
        written.push(insight);
      }
      return written;
    }
  };
}
