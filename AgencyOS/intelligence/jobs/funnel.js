import { pct } from '../utils.js';
import { buildInsight } from './framework.js';

// Per-campaign discovery-to-delivery funnel plus an agency rollup for the
// window. Read-only over campaign records; no campaign storage is touched.
export function funnelJob({ reader, insights, config, root }) {
  const c = config.jobs.funnel;
  return {
    name: 'intelligence:funnel',
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

      const deliveredByBusiness = new Set();
      for (const rec of reader.deliveryRecords()) {
        if (rec && rec.status === 'verified' && rec.businessId) deliveredByBusiness.add(rec.businessId);
      }

      const agency = { discovered: 0, qualified: 0, approved: 0, rejected: 0, escalated: 0, generated: 0, deployed: 0, failed: 0, delivered: 0 };
      const written = [];

      for (const { id, file } of campaigns) {
        const m = file.metrics || {};
        const executions = Array.isArray(file.executions) ? file.executions : [];
        const discovered = m.discovered ?? executions.length;
        const approved = m.approved ?? 0;
        const deployed = m.deployed ?? 0;
        const delivered = executions.filter((e) => e.status === 'DEPLOYED' && deliveredByBusiness.has(e.businessId)).length;

        const escalationReasons = {};
        const deniedReasons = {};
        for (const e of executions) {
          const verdict = e.outcome && e.outcome.verdict;
          const reason = (e.outcome && e.outcome.reason) || 'unknown';
          if (verdict === 'ESCALATED' || verdict === 'REJECTED') {
            const bucket = verdict === 'ESCALATED' ? escalationReasons : deniedReasons;
            bucket[reason] = (bucket[reason] || 0) + 1;
          }
        }

        const data = {
          discovered,
          qualified: m.qualified ?? 0,
          approved,
          rejected: m.rejected ?? 0,
          escalated: m.escalated ?? 0,
          generated: m.generated ?? 0,
          deployed,
          failed: m.failed ?? 0,
          delivered,
          rates: {
            qualifiedPct: pct(m.qualified ?? 0, discovered),
            approvedPct: pct(approved, discovered),
            deployedPct: pct(deployed, approved),
            deliveredPct: pct(delivered, deployed)
          },
          escalationReasons,
          deniedReasons
        };

        agency.discovered += discovered;
        agency.qualified += data.qualified;
        agency.approved += approved;
        agency.rejected += data.rejected;
        agency.escalated += data.escalated;
        agency.generated += data.generated;
        agency.deployed += deployed;
        agency.failed += data.failed;
        agency.delivered += delivered;

        const insight = buildInsight({
          kind: 'funnel',
          scope: { type: 'campaign', id },
          window,
          job: 'intelligence:funnel',
          jobVersion: c.version,
          data,
          summary: `${deployed}/${approved} deployed (${data.rates.deployedPct}% of approved)`,
          inputs
        });
        insights.put(insight);
        written.push(insight);
      }

      const agencyData = {
        ...agency,
        rates: {
          approvedPct: pct(agency.approved, agency.discovered),
          deployedPct: pct(agency.deployed, agency.approved),
          deliveredPct: pct(agency.delivered, agency.deployed)
        }
      };
      const rollup = buildInsight({
        kind: 'funnel',
        scope: { type: 'agency', id: 'agency' },
        window,
        job: 'intelligence:funnel',
        jobVersion: c.version,
        data: agencyData,
        summary: `${agency.delivered}/${agency.deployed} delivered agency-wide (${agencyData.rates.deliveredPct}%)`,
        inputs
      });
      insights.put(rollup);
      written.push(rollup);
      return written;
    }
  };
}
