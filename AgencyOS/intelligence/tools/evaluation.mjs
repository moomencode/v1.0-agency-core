import { evaluationIdFor } from '../ids.js';
import { writeReportArtifacts, baseReport, mdTable, mdSection } from './report.mjs';
import { normalizeVerdict } from '../experiments/experiment.js';

// Campaign evaluation (4.7.1): read-only aggregation of a campaign's records —
// stored decision.json / record.json files plus stored observations — into a
// deterministic evaluation-report artifact. Nothing is written outside the
// intelligence storage root; `now` is pinned so identical input windows yield
// byte-identical reports.

function depsError(deps, message, meta) {
  const err = new Error(message);
  err.code = 'INT_UNKNOWN_REPORT';
  err.meta = meta;
  return err;
}

export function buildCampaignEvaluation({ reader, observations, now, campaignId, start, end }) {
  if (!campaignId || typeof campaignId !== 'string') throw depsError({}, 'campaignId required for evaluation', {});
  const campaign = reader.readCampaign(campaignId);
  if (!campaign) throw depsError({}, `no campaign "${campaignId}"`, { campaignId });
  const startIso = start || (campaign.createdAt || null);
  const endIso = end || now;

  const rows = [];
  const businessIds = new Set();
  for (const meta of campaign.executions || []) {
    const stored = reader.readDecision(meta.executionId);
    if (!stored) continue;
    const decision = stored.decision || stored;
    if (!decision.verdict) continue;
    businessIds.add(meta.businessId);
    rows.push({
      executionId: meta.executionId,
      businessId: meta.businessId,
      verdict: normalizeVerdict(decision.verdict),
      riskLevel: decision.risk ? decision.risk.level : null,
      policyVersion: decision.policyVersion ? decision.policyVersion.id : null,
      strategyVersion: decision.strategyVersion ? decision.strategyVersion.id : null,
      delivered: meta.status === 'DEPLOYED' || (meta.outcome && meta.outcome.verdict === 'DEPLOYED')
    });
  }
  rows.sort((a, b) => (a.executionId === b.executionId ? 0 : a.executionId < b.executionId ? -1 : 1));

  const observationsOut = [];
  if (observations && typeof observations.read === 'function') {
    for (const businessId of businessIds) {
      observationsOut.push(...observations.read({ start: startIso, end: endIso, businessId }));
    }
  }
  const observedByKind = {};
  for (const o of observationsOut) {
    observedByKind[o.kind] = (observedByKind[o.kind] || 0) + 1;
  }

  const reviewed = rows.length;
  const approved = rows.filter((r) => r.verdict === 'APPROVE').length;
  const rejected = rows.filter((r) => r.verdict === 'REJECT').length;
  const escalated = rows.filter((r) => r.verdict === 'ESCALATE').length;
  const parked = rows.filter((r) => r.verdict === 'PARK').length;
  const delivered = rows.filter((r) => r.delivered).length;

  const stats = {
    reviewed,
    approved,
    rejected,
    escalated,
    parked,
    delivered,
    deliveredShareOfApproved: approved ? Math.round((delivered / approved) * 100) / 100 : 0,
    policyVersion: campaign.policyVersionRef && campaign.policyVersionRef.policyVersion ? campaign.policyVersionRef.policyVersion.id : (rows[0] ? rows[0].policyVersion : null),
    strategyVersion: campaign.policyVersionRef && campaign.policyVersionRef.strategyVersion ? campaign.policyVersionRef.strategyVersion.id : (rows[0] ? rows[0].strategyVersion : null)
  };

  const data = {
    ...baseReport('evaluation', now, `Campaign Evaluation — ${campaignId}`, `Campaign ${campaignId}: ${stats.reviewed} decisions reviewed, ${stats.delivered} delivered.`),
    evaluationId: evaluationIdFor(campaignId, startIso, endIso),
    campaign: {
      id: campaign.id,
      name: campaign.name,
      state: campaign.state,
      autonomyLevel: campaign.autonomyLevel,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt
    },
    window: { start: startIso, end: endIso },
    stats,
    rows,
    observations: {
      rows: observationsOut.length,
      byKind: observedByKind
    }
  };

  const markdown = [
    `# ${data.title}`,
    '',
    `> ${data.summary}`,
    '',
    `- Generated at: \`${now}\``,
    `- Report id: \`${data.reportId}\``,
    `- Evaluation id: \`${data.evaluationId}\``,
    `- Window: \`${startIso}\` → \`${endIso}\``,
    '',
    mdSection('Summary', mdTable(['Metric', 'Value'], Object.entries(data.stats))),
    mdSection('Decisions', mdTable(['Execution', 'Business', 'Verdict', 'Risk', 'Policy Version', 'Delivered'], data.rows.map((r) => [r.executionId, r.businessId, r.verdict, r.riskLevel, r.policyVersion, r.delivered]))),
    mdSection('Observations', mdTable(['Kind', 'Count'], Object.entries(data.observations.byKind).length ? Object.entries(data.observations.byKind) : [['none', 0]]))
  ].join('\n');
  return { data, markdown };
}

export function writeCampaignEvaluation({ deps, now, campaignId, start = null, end = null, runId = null }) {
  const report = buildCampaignEvaluation({ reader: deps.reader, observations: deps.observations, now, campaignId, start, end });
  if (!deps.artifacts) {
    throw depsError(deps, 'writeCampaignEvaluation requires an artifacts manager', { campaignId });
  }
  const written = writeReportArtifacts({
    artifacts: deps.artifacts,
    report,
    projectId: deps.config.reports?.projectId || 'agency',
    workflowId: deps.config.reports?.workflowId || 'intelligence',
    runId,
    storageRoot: deps.storageRoot
  });
  return { report, written };
}

export function buildCampaignEvaluationForEngine({ engine, now, campaignId, start = null, end = null }) {
  return buildCampaignEvaluation({ reader: engine.reader, observations: engine.observations, now, campaignId, start, end });
}