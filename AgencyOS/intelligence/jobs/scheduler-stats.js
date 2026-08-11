import { round2, pct } from '../utils.js';
import { buildInsight } from './framework.js';

// Scheduler health from the persisted dispatch history (_history.json).
// Single writer for scheduler.* metric points; when a scheduler bridge is
// wired the job still records record-derived points (distinct pointIds) so the
// aggregated series is authoritative regardless of bridge state.
export function schedulerStatsJob({ reader, metrics, insights, config, root }) {
  const c = config.jobs.scheduler_stats;
  return {
    name: 'intelligence:scheduler_stats',
    version: c.version,
    schedule: c.schedule,
    windowMs: c.windowMs,
    maxWindows: c.maxWindows,
    async run({ window, now, ctx }) {
      const history = reader.schedulerHistory();
      const inputs = { jobsSeen: Object.keys(history).length, windowStart: window.start, windowEnd: window.end };
      const perJob = {};
      let totals = { runs: 0, succeeded: 0, failed: 0, retried: 0 };

      for (const [jobId, runs] of Object.entries(history)) {
        const agg = { runs: 0, succeeded: 0, failed: 0, retried: 0 };
        for (const run of runs) {
          if (!run || !run.startedAt || run.startedAt < window.start || run.startedAt >= window.end) continue;
          agg.runs++;
          if (run.status === 'succeeded') agg.succeeded++;
          else if (run.status === 'failed') agg.failed++;
          if (run.attempt && run.attempt > 1) agg.retried++;
        }
        if (!agg.runs) continue;
        perJob[jobId] = {
          ...agg,
          successRatePct: pct(agg.succeeded, agg.runs),
          retryRatePct: pct(agg.retried, agg.runs)
        };
        totals.runs += agg.runs;
        totals.succeeded += agg.succeeded;
        totals.failed += agg.failed;
        totals.retried += agg.retried;
      }

      metrics.record({
        schema: 'https://agency.os/intelligence/metric-point',
        ts: window.end,
        metric: 'scheduler.jobsSucceeded',
        value: totals.succeeded,
        kind: 'counter',
        scope: { type: 'agency', id: 'agency' },
        source: { type: 'record', recordId: `scheduler-stats:${window.start}` },
        correlation: { windowStart: window.start, windowEnd: window.end }
      });
      metrics.record({
        schema: 'https://agency.os/intelligence/metric-point',
        ts: window.end,
        metric: 'scheduler.jobsFailed',
        value: totals.failed,
        kind: 'counter',
        scope: { type: 'agency', id: 'agency' },
        source: { type: 'record', recordId: `scheduler-stats:${window.start}` },
        correlation: { windowStart: window.start, windowEnd: window.end }
      });
      metrics.record({
        schema: 'https://agency.os/intelligence/metric-point',
        ts: window.end,
        metric: 'scheduler.jobsRetried',
        value: totals.retried,
        kind: 'counter',
        scope: { type: 'agency', id: 'agency' },
        source: { type: 'record', recordId: `scheduler-stats:${window.start}` },
        correlation: { windowStart: window.start, windowEnd: window.end }
      });

      const data = {
        totals: { ...totals, successRatePct: pct(totals.succeeded, totals.runs), retryRatePct: pct(totals.retried, totals.runs) },
        jobs: perJob
      };
      const insight = buildInsight({
        kind: 'scheduler_stats',
        scope: { type: 'agency', id: 'agency' },
        window,
        job: 'intelligence:scheduler_stats',
        jobVersion: c.version,
        data,
        summary: `${totals.succeeded}/${totals.runs} scheduler runs succeeded (${data.totals.successRatePct}%)`,
        inputs
      });
      insights.put(insight);
      return [insight];
    }
  };
}
