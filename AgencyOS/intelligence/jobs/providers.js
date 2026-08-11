import { round2 } from '../utils.js';
import { buildInsight } from './framework.js';

// Provider reliability from delivery records created in the window. Single
// writer for provider.* metric points (the sink does not map delivery events
// into provider metrics — delivery events carry no provider id).
export function providersJob({ reader, metrics, insights, config, root }) {
  const c = config.jobs.providers;
  return {
    name: 'intelligence:providers',
    version: c.version,
    schedule: c.schedule,
    windowMs: c.windowMs,
    maxWindows: c.maxWindows,
    async run({ window, now, ctx }) {
      const inputs = { recordsRead: 0, windowStart: window.start, windowEnd: window.end };
      const byProvider = {};
      const records = reader.deliveryRecords().slice(0, c.maxRecords);
      inputs.recordsRead = records.length;

      for (const rec of records) {
        if (!rec || !rec.createdAt || rec.createdAt < window.start || rec.createdAt >= window.end) continue;
        const provider = rec.provider || 'unknown';
        const agg = byProvider[provider] || (byProvider[provider] = { attempts: 0, failures: 0, dryRuns: 0, verified: 0, rollbacks: 0, verifyDurations: [] });
        agg.attempts++;
        if (rec.status === 'failed') agg.failures++;
        if (rec.mode === 'dry-run' || rec.dryRun) agg.dryRuns++;
        if (rec.status === 'verified') agg.verified++;
        if (rec.rollbackOf || rec.status === 'rolled_back' || rec.status === 'reverted') agg.rollbacks++;
        const timeline = Array.isArray(rec.timeline) ? rec.timeline : [];
        const deploy = timeline.find((t) => t.event === 'DEPLOY_OK');
        const verify = timeline.find((t) => t.event === 'VERIFY_OK');
        if (deploy && verify) {
          const ms = new Date(verify.at).getTime() - new Date(deploy.at).getTime();
          if (Number.isFinite(ms) && ms >= 0) agg.verifyDurations.push(ms);
        }
      }

      const providers = Object.keys(byProvider).sort();
      const written = [];
      const agencyTotals = { attempts: 0, failures: 0, dryRuns: 0, verified: 0, rollbacks: 0 };

      for (const provider of providers) {
        const agg = byProvider[provider];
        agencyTotals.attempts += agg.attempts;
        agencyTotals.failures += agg.failures;
        agencyTotals.dryRuns += agg.dryRuns;
        agencyTotals.verified += agg.verified;
        agencyTotals.rollbacks += agg.rollbacks;
        const avgVerifyMs = agg.verifyDurations.length ? round2(agg.verifyDurations.reduce((a, b) => a + b, 0) / agg.verifyDurations.length) : 0;

        metrics.record({
          schema: 'https://agency.os/intelligence/metric-point',
          ts: window.end,
          metric: 'provider.attempts',
          value: agg.attempts,
          kind: 'counter',
          scope: { type: 'provider', id: provider },
          source: { type: 'record', recordId: `providers-job:${provider}:${window.start}` },
          correlation: { windowStart: window.start, windowEnd: window.end }
        });
        metrics.record({
          schema: 'https://agency.os/intelligence/metric-point',
          ts: window.end,
          metric: 'provider.failures',
          value: agg.failures,
          kind: 'counter',
          scope: { type: 'provider', id: provider },
          source: { type: 'record', recordId: `providers-job:${provider}:${window.start}` },
          correlation: { windowStart: window.start, windowEnd: window.end }
        });
        metrics.record({
          schema: 'https://agency.os/intelligence/metric-point',
          ts: window.end,
          metric: 'provider.dryRuns',
          value: agg.dryRuns,
          kind: 'counter',
          scope: { type: 'provider', id: provider },
          source: { type: 'record', recordId: `providers-job:${provider}:${window.start}` },
          correlation: { windowStart: window.start, windowEnd: window.end }
        });
        if (agg.verifyDurations.length) {
          metrics.record({
            schema: 'https://agency.os/intelligence/metric-point',
            ts: window.end,
            metric: 'provider.verifyDurationMs',
            value: avgVerifyMs,
            kind: 'duration',
            scope: { type: 'provider', id: provider },
            source: { type: 'record', recordId: `providers-job:${provider}:${window.start}` },
            correlation: { windowStart: window.start, windowEnd: window.end, samples: agg.verifyDurations.length }
          });
        }

        const data = {
          attempts: agg.attempts,
          failures: agg.failures,
          dryRuns: agg.dryRuns,
          verified: agg.verified,
          rollbacks: agg.rollbacks,
          avgVerifyMs,
          failureRatePct: agg.attempts ? round2((agg.failures / agg.attempts) * 100) : 0
        };
        const insight = buildInsight({
          kind: 'provider_reliability',
          scope: { type: 'provider', id: provider },
          window,
          job: 'intelligence:providers',
          jobVersion: c.version,
          data,
          summary: `${agg.verified}/${agg.attempts} verified (${data.failureRatePct}% failures)`,
          inputs
        });
        insights.put(insight);
        written.push(insight);
      }

      const rollup = buildInsight({
        kind: 'provider_reliability',
        scope: { type: 'agency', id: 'agency' },
        window,
        job: 'intelligence:providers',
        jobVersion: c.version,
        data: {
          ...agencyTotals,
          failureRatePct: agencyTotals.attempts ? round2((agencyTotals.failures / agencyTotals.attempts) * 100) : 0,
          providers
        },
        summary: `${agencyTotals.verified}/${agencyTotals.attempts} verified across ${providers.length} provider(s)`,
        inputs
      });
      insights.put(rollup);
      written.push(rollup);
      return written;
    }
  };
}
