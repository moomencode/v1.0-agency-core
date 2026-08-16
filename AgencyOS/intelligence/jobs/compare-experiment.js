import { buildInsight } from './framework.js';
import { runAndReportExperiment } from '../tools/experiment.mjs';

// Compare-experiment (4.7.1): scheduled offline rerun of every configured
// experiment. Each experiment produces an experiment-report artifact (mirror)
// plus one compare_experiment insight. Pure rerun, advisory only — nothing is
// applied, published or committed. When no experiments are configured the job
// is a no-op.
export function compareExperimentJob({ config, insights, metrics }) {
  const c = config.jobs.compare_experiment;
  return {
    name: 'intelligence:compare_experiment',
    version: c.version,
    schedule: c.schedule,
    windowMs: c.windowMs,
    maxWindows: c.maxWindows,
    async run({ window, now, ctx }) {
      const configured = Array.isArray(config.experiments.jobs) ? config.experiments.jobs : [];
      const outputs = [];
      for (const spec of configured) {
        const { result, report, written } = runAndReportExperiment({ engine: ctx, spec, now });
        metrics.record({
          schema: 'https://agency.os/intelligence/metric-point',
          ts: window.end,
          metric: 'experiment.evaluated',
          value: result.summary.evaluated,
          kind: 'counter',
          scope: { type: 'campaign', id: result.scope.campaignId },
          source: { type: 'record', recordId: result.experimentId },
          correlation: { windowStart: window.start, windowEnd: window.end }
        });
        metrics.record({
          schema: 'https://agency.os/intelligence/metric-point',
          ts: window.end,
          metric: 'experiment.flips',
          value: result.summary.flipped,
          kind: 'counter',
          scope: { type: 'campaign', id: result.scope.campaignId },
          source: { type: 'record', recordId: result.experimentId },
          correlation: { windowStart: window.start, windowEnd: window.end }
        });
        const insight = buildInsight({
          kind: 'compare_experiment',
          scope: { type: 'campaign', id: result.scope.campaignId },
          window,
          job: 'intelligence:compare_experiment',
          jobVersion: c.version,
          data: {
            experimentId: result.experimentId,
            name: result.name,
            basePolicyVersion: result.basePolicyVersion,
            altPolicyVersion: result.altPolicyVersion,
            summary: result.summary,
            unversioned: result.unversioned,
            truncated: result.truncated,
            reportId: report.data.reportId
          },
          summary: `${result.summary.evaluated} decisions, ${result.summary.flipped} flips (${result.summary.flipRate}) under "${result.altPolicyVersion}"`,
          inputs: { windowStart: window.start, windowEnd: window.end }
        });
        insights.put(insight);
        outputs.push(insight);
      }
      if (!outputs.length) {
        return { name: 'intelligence:compare_experiment', windows: 1, experiments: 0, noop: true };
      }
      return outputs;
    }
  };
}