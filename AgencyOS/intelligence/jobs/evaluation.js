import { buildInsight } from './framework.js';
import { buildCampaignEvaluationForEngine, writeCampaignEvaluation } from '../tools/evaluation.mjs';

// Campaign evaluation (4.7.1): scheduled read-only aggregation of every known
// campaign into evaluation-reports (artifacts + mirrors) plus one
// campaign_evaluation insight and evaluation.* metric points per window.
// Deterministic: reports are byte-stable for identical input windows, so a
// rerun over the same window rewrites identical artifacts (dedupe-safe).
export function campaignEvaluationJob({ reader, metrics, insights, config, root, observations, artifacts, storageRoot }) {
  const c = config.jobs.campaign_evaluation;
  return {
    name: 'intelligence:campaign_evaluation',
    version: c.version,
    schedule: c.schedule,
    windowMs: c.windowMs,
    maxWindows: c.maxWindows,
    async run({ window, now, ctx }) {
      const deps = {
        reader: reader || (ctx && ctx.reader),
        observations: observations || (ctx && ctx.observations),
        artifacts: artifacts || (ctx && ctx.artifacts) || null,
        config,
        storageRoot: storageRoot || root
      };
      const campaigns = {};
      let totals = { campaigns: 0, reviewed: 0, delivered: 0, artifacts: 0 };
      for (const campaignId of reader.campaignIds()) {
        const { data, markdown } = buildCampaignEvaluationForEngine({ engine: deps, now, campaignId, start: window.start, end: window.end });
        campaigns[campaignId] = data.stats;
        totals.campaigns++;
        totals.reviewed += data.stats.reviewed;
        totals.delivered += data.stats.delivered;
        if (deps.artifacts) {
          const { written } = writeCampaignEvaluation({ deps, now, campaignId, start: window.start, end: window.end, runId: `campaign-evaluation:${window.start}` });
          totals.artifacts += 2;
        }
      }

      metrics.record({
        schema: 'https://agency.os/intelligence/metric-point',
        ts: window.end,
        metric: 'evaluation.decisionsReviewed',
        value: totals.reviewed,
        kind: 'counter',
        scope: { type: 'agency', id: 'agency' },
        source: { type: 'record', recordId: `campaign-evaluation:${window.start}` },
        correlation: { windowStart: window.start, windowEnd: window.end }
      });
      metrics.record({
        schema: 'https://agency.os/intelligence/metric-point',
        ts: window.end,
        metric: 'evaluation.delivered',
        value: totals.delivered,
        kind: 'counter',
        scope: { type: 'agency', id: 'agency' },
        source: { type: 'record', recordId: `campaign-evaluation:${window.start}` },
        correlation: { windowStart: window.start, windowEnd: window.end }
      });

      const data = { campaigns, totals };
      const insight = buildInsight({
        kind: 'campaign_evaluation',
        scope: { type: 'agency', id: 'agency' },
        window,
        job: 'intelligence:campaign_evaluation',
        jobVersion: c.version,
        data,
        summary: `${totals.campaigns} campaigns evaluated, ${totals.reviewed} decisions reviewed, ${totals.delivered} delivered`,
        inputs: { windowStart: window.start, windowEnd: window.end }
      });
      insights.put(insight);
      return [insight];
    }
  };
}