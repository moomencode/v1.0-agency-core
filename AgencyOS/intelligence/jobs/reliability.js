import { pct, round2 } from '../utils.js';
import { buildInsight } from './framework.js';

// Reliability aggregation over the event log for the window: execution /
// delivery / step counters, failure and retry rates, plus a top-N breakdown of
// the noisiest steps. One agency rollup + one per-campaign insight.
export function reliabilityJob({ reader, events, metrics, insights, config, root }) {
  const c = config.jobs.reliability;
  return {
    name: 'intelligence:reliability',
    version: c.version,
    schedule: c.schedule,
    windowMs: c.windowMs,
    maxWindows: c.maxWindows,
    async run({ window, now, ctx }) {
      const rows = events.read({ start: window.start, end: window.end, max: c.maxRows });
      const inputs = { eventsRead: rows.length, windowStart: window.start, windowEnd: window.end };

      const counts = {
        executions: { started: 0, succeeded: 0, failed: 0, retried: 0 },
        delivery: { deployed: 0, failed: 0 },
        steps: { completed: 0, failed: 0, retried: 0 },
        campaigns: { started: 0, completed: 0, stopped: 0, limitsReached: 0 }
      };
      const stepFailures = {};
      const perCampaign = {};

      for (const line of rows) {
        const ev = line.ev;
        const corr = line.correlation || {};
        const campaignId = corr.campaignId;
        switch (ev) {
          case 'orchestrator.execution_started': counts.executions.started++; break;
          case 'orchestrator.deployed': counts.executions.succeeded++; counts.delivery.deployed++; break;
          case 'orchestrator.failed': counts.executions.failed++; break;
          case 'orchestrator.step_retrying': counts.executions.retried++; counts.steps.retried++; break;
          case 'orchestrator.step_completed': counts.steps.completed++; break;
          case 'orchestrator.step_failed': counts.steps.failed++; break;
          case 'delivery.deployed': counts.delivery.deployed++; break;
          case 'delivery.failed': counts.delivery.failed++; break;
          case 'orchestrator.campaign_started': counts.campaigns.started++; break;
          case 'orchestrator.campaign_completed': counts.campaigns.completed++; break;
          case 'orchestrator.campaign_stopped': counts.campaigns.stopped++; break;
          case 'orchestrator.limits_reached': counts.campaigns.limitsReached++; break;
          default: break;
        }
        if (ev === 'orchestrator.step_failed' && corr.step) {
          stepFailures[corr.step] = (stepFailures[corr.step] || 0) + 1;
        }
        if (campaignId) {
          const cid = perCampaign[campaignId] || (perCampaign[campaignId] = { started: 0, succeeded: 0, failed: 0, retried: 0, stepsCompleted: 0, stepsFailed: 0 });
          if (ev === 'orchestrator.execution_started') cid.started++;
          else if (ev === 'orchestrator.deployed') cid.succeeded++;
          else if (ev === 'orchestrator.failed') cid.failed++;
          else if (ev === 'orchestrator.step_retrying') cid.retried++;
          else if (ev === 'orchestrator.step_completed') cid.stepsCompleted++;
          else if (ev === 'orchestrator.step_failed') cid.stepsFailed++;
        }
      }

      const totalExecutions = counts.executions.started;
      const failureRatePct = pct(counts.executions.failed, totalExecutions);
      const successRatePct = pct(counts.executions.succeeded, totalExecutions);
      const providerFailurePct = pct(counts.delivery.failed, counts.delivery.deployed + counts.delivery.failed);
      const retryRatePct = pct(counts.steps.retried, counts.steps.completed + counts.steps.failed + counts.steps.retried);

      const topSteps = Object.entries(stepFailures)
        .sort((a, b) => (b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] - a[1]))
        .slice(0, 10)
        .map(([step, failures]) => ({ step, failures }));

      const rollupData = {
        counts,
        totals: {
          executions: totalExecutions,
          steps: counts.steps.completed + counts.steps.failed + counts.steps.retried
        },
        rates: { failureRatePct, successRatePct, providerFailurePct, retryRatePct },
        topSteps
      };

      metrics.putAggregate({
        schema: 'https://agency.os/intelligence/aggregate',
        kind: 'reliability',
        metric: 'agency.failureRatePct',
        value: failureRatePct,
        samples: totalExecutions,
        scope: { type: 'agency', id: 'agency' },
        window: { start: window.start, end: window.end },
        computedAt: window.end,
        data: rollupData
      });

      const rollup = buildInsight({
        kind: 'reliability',
        scope: { type: 'agency', id: 'agency' },
        window,
        job: 'intelligence:reliability',
        jobVersion: c.version,
        data: rollupData,
        summary: `${counts.executions.succeeded}/${totalExecutions} executions succeeded (${successRatePct}%)`,
        inputs
      });
      insights.put(rollup);

      const written = [rollup];
      for (const [campaignId, d] of Object.entries(perCampaign).sort((a, b) => a[0].localeCompare(b[0]))) {
        const dData = {
          ...d,
          rates: {
            failureRatePct: pct(d.failed, d.started),
            successRatePct: pct(d.succeeded, d.started),
            stepFailurePct: pct(d.stepsFailed, d.stepsCompleted + d.stepsFailed + d.stepsRetried || 1)
          }
        };
        const insight = buildInsight({
          kind: 'reliability',
          scope: { type: 'campaign', id: campaignId },
          window,
          job: 'intelligence:reliability',
          jobVersion: c.version,
          data: dData,
          summary: `${d.succeeded}/${d.started} executions succeeded for campaign ${campaignId}`,
          inputs
        });
        insights.put(insight);
        written.push(insight);
      }
      return written;
    }
  };
}
