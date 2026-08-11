import { percentile, round2 } from '../utils.js';
import { buildInsight } from './framework.js';

// Execution/step duration analysis from persisted traces. Executions whose
// trace starts within the window are aggregated into per-step duration
// distributions and an end-to-end summary; step averages are recorded as
// duration points (single writer for step.durationMs).
export function durationsJob({ reader, events, metrics, insights, config, root }) {
  const c = config.jobs.durations;
  return {
    name: 'intelligence:durations',
    version: c.version,
    schedule: c.schedule,
    windowMs: c.windowMs,
    maxWindows: c.maxWindows,
    async run({ window, now, ctx }) {
      const inputs = { executionsRead: 0, windowStart: window.start, windowEnd: window.end };
      const e2e = [];
      const byStep = {};
      let executionsRead = 0;

      for (const campaignId of reader.campaignIds()) {
        if (executionsRead >= c.maxExecutions) break;
        const file = reader.readCampaign(campaignId);
        if (!file || !Array.isArray(file.executions)) continue;
        for (const ex of file.executions) {
          if (executionsRead >= c.maxExecutions) break;
          const trace = reader.readTrace(ex.executionId);
          if (!trace.length) continue;
          const firstAt = Math.min(...trace.map((t) => new Date(t.at).getTime()));
          const lastAt = Math.max(...trace.map((t) => new Date(t.at).getTime()));
          if (Number.isNaN(firstAt) || Number.isNaN(lastAt) || firstAt < new Date(window.start).getTime() || firstAt >= new Date(window.end).getTime()) continue;
          executionsRead++;
          e2e.push(lastAt - firstAt);
          for (const entry of trace) {
            const step = entry.step;
            if (!step) continue;
            const bucket = byStep[step] || (byStep[step] = { n: 0, totalMs: 0, durations: [] });
            bucket.n++;
            if (entry.durationMs != null && Number.isFinite(entry.durationMs)) {
              bucket.totalMs += entry.durationMs;
              bucket.durations.push(entry.durationMs);
            }
          }
        }
      }
      inputs.executionsRead = executionsRead;

      const stepSummary = {};
      const stepCounts = Object.entries(byStep).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 20);
      for (const [step, bucket] of stepCounts) {
        bucket.durations.sort((a, b) => a - b);
        const avgMs = bucket.n ? round2(bucket.totalMs / bucket.n) : 0;
        stepSummary[step] = { n: bucket.n, avgMs, p50Ms: percentile(bucket.durations, 50), p95Ms: percentile(bucket.durations, 95) };
        metrics.record({
          schema: 'https://agency.os/intelligence/metric-point',
          ts: window.end,
          metric: 'step.durationMs',
          value: avgMs,
          kind: 'duration',
          scope: { type: 'step', id: step },
          source: { type: 'job', jobId: 'intelligence:durations' },
          correlation: { windowStart: window.start, windowEnd: window.end, samples: bucket.n }
        });
      }

      e2e.sort((a, b) => a - b);
      const e2eData = {
        n: e2e.length,
        avgMs: e2e.length ? round2(e2e.reduce((a, b) => a + b, 0) / e2e.length) : 0,
        p50Ms: percentile(e2e, 50),
        p95Ms: percentile(e2e, 95)
      };

      const insight = buildInsight({
        kind: 'durations',
        scope: { type: 'agency', id: 'agency' },
        window,
        job: 'intelligence:durations',
        jobVersion: c.version,
        data: { executions: e2eData, steps: stepSummary },
        summary: e2e.length ? `end-to-end p50 ${e2eData.p50Ms}ms across ${e2e.length} executions` : 'no executions started in window',
        inputs
      });
      insights.put(insight);
      return [insight];
    }
  };
}
