import path from 'node:path';
import fs from 'node:fs';
import { sha256, hex16 } from '../ids.js';
import { round2 } from '../utils.js';

function pathJoin(...parts) {
  return path.join(...parts);
}
function fsMkdir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function atomicWriteLocal(file, content) {
  fs.writeFileSync(file, content);
}

// Deterministic report builders. Every builder takes an explicit `now` (the
// engine's clock output) so two runs over identical state produce identical
// artifacts. Reports are written through the ArtifactManager as type "report"
// in json + markdown formats.

function reportIdFor(kind, now) {
  return `rpt-${hex16(sha256(`${kind}|${now}`))}`;
}

function baseReport(kind, now, title, summary) {
  return { schema: 'https://agency.os/intelligence/report', reportId: reportIdFor(kind, now), kind, title, summary, generatedAt: now };
}

function mdTable(headers, rows) {
  const lines = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const row of rows) lines.push(`| ${row.map((c) => String(c ?? '').replace(/\|/g, '/')).join(' | ')} |`);
  return lines.join('\n');
}

function mdSection(title, body) {
  return [`## ${title}`, '', body, ''].join('\n');
}

// ---------------------------------------------------------------------------
export function buildHealthReport({ engine, now }) {
  const snap = engine.snapshot();
  const data = {
    ...baseReport('health', now, 'AgencyOS Intelligence — Health Report', 'System health: ingestion, storage, incidents, alerts, jobs.'),
    engine: snap
  };
  const markdown = [
    `# ${data.title}`,
    '',
    `> ${data.summary}`,
    '',
    `- Generated at: \`${now}\``,
    `- Report id: \`${data.reportId}\``,
    '',
    mdSection('Sink', mdTable(['Metric', 'Value'], Object.entries(snap.sink).map(([k, v]) => [k, v]))),
    mdSection('Metrics', mdTable(['Metric', 'Value'], [
      ['points written', snap.metrics.stats.points],
      ['duplicates', snap.metrics.stats.duplicates],
      ['raw files', snap.metrics.rawFiles],
      ['aggregates', snap.metrics.aggregates],
      ['registry size', snap.metrics.registrySize]
    ])),
    mdSection('Incidents', mdTable(['Metric', 'Value'], [['open', snap.incidents.open], ['total', snap.incidents.total]])),
    mdSection('Alerts', mdTable(['Metric', 'Value'], [['active', snap.alerts.active], ['total', snap.alerts.total]])),
    mdSection('Jobs', mdTable(['Metric', 'Value'], [['runs', snap.jobs.runs], ['windows', snap.jobs.windows], ['aborted', snap.jobs.aborted]])),
    `- Storage bytes: ${snap.storageBytes}`
  ].join('\n');
  return { data, markdown };
}

// ---------------------------------------------------------------------------
export function buildIncidentReport({ engine, now }) {
  const incidents = engine.incidents.list();
  const history = engine.incidents.history({ max: 200 });
  const data = {
    ...baseReport('incident', now, 'AgencyOS Intelligence — Incident Report', 'Current and recent incidents across all scopes.'),
    summary: {
      open: incidents.filter((i) => i.status === 'open').length,
      acknowledged: incidents.filter((i) => i.status === 'acknowledged').length,
      resolved: incidents.filter((i) => i.status === 'resolved').length,
      closed: incidents.filter((i) => i.status === 'closed').length
    },
    incidents: incidents.map((i) => ({
      incidentId: i.incidentId,
      kind: i.kind,
      severity: i.severity,
      status: i.status,
      scope: i.scope,
      count: i.count,
      firstSeen: i.firstSeen,
      lastSeen: i.lastSeen,
      openedAt: i.openedAt,
      resolvedAt: i.resolvedAt,
      acknowledgedAt: i.acknowledgedAt,
      resolvedBy: i.resolvedBy,
      detail: i.detail,
      evidenceCount: (i.evidence || []).length
    })),
    recentHistory: history.slice(-50).map((h) => ({ at: h.at, event: h.event, incidentId: h.incidentId, status: h.status }))
  };
  const markdown = [
    `# ${data.title}`,
    '',
    `> ${data.summary}`,
    '',
    `- Generated at: \`${now}\``,
    `- Report id: \`${data.reportId}\``,
    '',
    mdSection('Summary', mdTable(['Status', 'Count'], Object.entries(data.summary))),
    mdSection('Incidents', data.incidents.length
      ? mdTable(['Id', 'Kind', 'Severity', 'Status', 'Scope', 'Count', 'Opened'], data.incidents.map((i) => [i.incidentId, i.kind, i.severity, i.status, `${i.scope.type}:${i.scope.id}`, i.count, i.openedAt]))
      : '_none_')
  ].join('\n');
  return { data, markdown };
}

// ---------------------------------------------------------------------------
export function buildAlertReport({ engine, now }) {
  const active = engine.alerts.list({ status: 'active' });
  const data = {
    ...baseReport('alert', now, 'AgencyOS Intelligence — Alert Report', 'Alert rules and current activations.'),
    rules: engine.rules.map((r) => ({ ruleId: r.ruleId, metric: r.metric || null, kind: r.kind || null, op: r.op || null, threshold: r.threshold ?? null, severity: r.severity, enabled: r.enabled !== false, scopeType: r.scopeType || null, minSamples: r.minSamples ?? null, description: r.description || '' })),
    active: active.map((a) => ({
      alertId: a.alertId,
      ruleId: a.ruleId,
      severity: a.severity,
      scope: a.scope,
      triggeredAt: a.triggeredAt,
      window: a.window,
      triggeredBy: a.triggeredBy
    }))
  };
  const markdown = [
    `# ${data.title}`,
    '',
    `> ${data.summary}`,
    '',
    `- Generated at: \`${now}\``,
    `- Report id: \`${data.reportId}\``,
    '',
    mdSection('Rules', mdTable(['Rule', 'Metric/Kind', 'Condition', 'Severity', 'Enabled'], data.rules.map((r) => [r.ruleId, r.metric || r.kind, r.op && r.threshold !== null ? `${r.op} ${r.threshold}` : '-', r.severity, r.enabled]))),
    mdSection('Active Alerts', data.active.length
      ? mdTable(['Alert', 'Rule', 'Severity', 'Scope', 'Triggered'], data.active.map((a) => [a.alertId, a.ruleId, a.severity, `${a.scope.type}:${a.scope.id}`, a.triggeredAt]))
      : '_none_')
  ].join('\n');
  return { data, markdown };
}

// ---------------------------------------------------------------------------
export function buildCampaignReport({ engine, now, campaignId }) {
  const file = engine.reader.readCampaign(campaignId);
  if (!file) throw engineError(engine, `no campaign "${campaignId}"`, { campaignId });
  const funnel = engine.insights.list('funnel', { scopeType: 'campaign', scopeId: campaignId });
  const budget = engine.insights.list('budget_burn', { scopeType: 'campaign', scopeId: campaignId });
  const reliability = engine.insights.list('reliability', { scopeType: 'campaign', scopeId: campaignId });
  const data = {
    ...baseReport('campaign', now, `Campaign Report — ${campaignId}`, `Campaign ${campaignId}: funnel, budget and reliability insights.`),
    campaign: {
      id: file.id,
      name: file.name,
      state: file.state,
      autonomyLevel: file.autonomyLevel,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      metrics: file.metrics || {},
      budget: file.budget || {},
      executions: (file.executions || []).length
    },
    funnel: funnel.map((i) => ({ window: i.window, data: i.data, summary: i.summary })),
    budget: budget.map((i) => ({ window: i.window, data: i.data, summary: i.summary })),
    reliability: reliability.map((i) => ({ window: i.window, data: i.data, summary: i.summary }))
  };
  const markdown = [
    `# ${data.title}`,
    '',
    `> ${data.summary}`,
    '',
    `- Generated at: \`${now}\``,
    `- Report id: \`${data.reportId}\``,
    '',
    mdSection('Campaign', mdTable(['Field', 'Value'], Object.entries(data.campaign).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v]))),
    mdSection('Funnel', data.funnel.length ? mdTable(['Window', 'Summary'], data.funnel.map((f) => [f.window.start, f.summary])) : '_none_'),
    mdSection('Budget Burn', data.budget.length ? mdTable(['Window', 'Summary'], data.budget.map((b) => [b.window.start, b.summary])) : '_none_'),
    mdSection('Reliability', data.reliability.length ? mdTable(['Window', 'Summary'], data.reliability.map((r) => [r.window.start, r.summary])) : '_none_')
  ].join('\n');
  return { data, markdown };
}

function engineError(engine, message, meta) {
  const err = new Error(message);
  err.code = 'INT_UNKNOWN_REPORT';
  err.meta = meta;
  return err;
}

// ---------------------------------------------------------------------------
export function buildOperationsReport({ engine, now }) {
  const health = buildHealthReport({ engine, now }).data;
  const incidents = engine.incidents.list().filter((i) => i.status === 'open' || i.status === 'acknowledged');
  const activeAlerts = engine.alerts.list({ status: 'active' });
  const funnel = engine.insights.list('funnel', { scopeType: 'agency' })[0] || null;
  const reliability = engine.insights.list('reliability', { scopeType: 'agency' })[0] || null;
  const scheduler = engine.insights.list('scheduler_stats', { scopeType: 'agency' })[0] || null;
  const data = {
    ...baseReport('operations', now, 'AgencyOS Intelligence — Operations Report', 'Operational rollup: health, open incidents, active alerts, latest insights.'),
    health: {
      sink: health.engine.sink,
      metrics: health.engine.metrics,
      jobs: health.engine.jobs,
      storageBytes: health.engine.storageBytes
    },
    openIncidents: incidents.map((i) => ({ incidentId: i.incidentId, kind: i.kind, severity: i.severity, status: i.status, scope: i.scope, count: i.count, detail: i.detail })),
    activeAlerts: activeAlerts.map((a) => ({ alertId: a.alertId, ruleId: a.ruleId, severity: a.severity, scope: a.scope, triggeredBy: a.triggeredBy })),
    latest: {
      funnel: funnel ? { insightId: funnel.insightId, window: funnel.window, summary: funnel.summary, data: funnel.data } : null,
      reliability: reliability ? { insightId: reliability.insightId, window: reliability.window, summary: reliability.summary, data: reliability.data } : null,
      scheduler: scheduler ? { insightId: scheduler.insightId, window: scheduler.window, summary: scheduler.summary, data: scheduler.data } : null
    }
  };
  const markdown = [
    `# ${data.title}`,
    '',
    `> ${data.summary}`,
    '',
    `- Generated at: \`${now}\``,
    `- Report id: \`${data.reportId}\``,
    '',
    mdSection('Health', mdTable(['Metric', 'Value'], [
      ['events written', data.health.sink.written],
      ['events rejected', data.health.sink.rejected],
      ['metric points', data.health.metrics.stats.points],
      ['aggregates', data.health.metrics.aggregates],
      ['job runs', data.health.jobs.runs],
      ['storage bytes', data.health.storageBytes]
    ])),
    mdSection('Open Incidents', data.openIncidents.length
      ? mdTable(['Id', 'Kind', 'Severity', 'Scope', 'Count'], data.openIncidents.map((i) => [i.incidentId, i.kind, i.severity, `${i.scope.type}:${i.scope.id}`, i.count]))
      : '_none_'),
    mdSection('Active Alerts', data.activeAlerts.length
      ? mdTable(['Alert', 'Rule', 'Severity', 'Scope'], data.activeAlerts.map((a) => [a.alertId, a.ruleId, a.severity, `${a.scope.type}:${a.scope.id}`]))
      : '_none_'),
    mdSection('Latest Insights', [
      funnel ? `- **Funnel**: ${funnel.summary} (window \`${funnel.window.start}\` → \`${funnel.window.end}\`)` : '- **Funnel**: none',
      reliability ? `- **Reliability**: ${reliability.summary} (window \`${reliability.window.start}\` → \`${reliability.window.end}\`)` : '- **Reliability**: none',
      scheduler ? `- **Scheduler**: ${scheduler.summary} (window \`${scheduler.window.start}\` → \`${scheduler.window.end}\`)` : '- **Scheduler**: none'
    ].join('\n'))
  ].join('\n');
  return { data, markdown };
}

const KIND_ARTIFACT_TYPE = {
  health: 'agency-health',
  incident: 'incident-digest',
  alert: 'alert-digest',
  campaign: 'campaign-report',
  operations: 'operations-report'
};

// Write a built report as json + markdown artifacts (kind-specific artifact
// types) and mirror copies under <storageRoot>/reports/<date>/ so reports are
// readable without the artifacts manager.
export function writeReportArtifacts({ artifacts, report, projectId = 'agency', workflowId = 'intelligence', runId = null, storageRoot = null }) {
  const type = KIND_ARTIFACT_TYPE[report.data.kind] || 'report';
  const opts = {
    name: `${report.data.kind}-report`,
    type,
    format: 'json',
    content: JSON.stringify(report.data, null, 2),
    projectId,
    workflowId,
    runId,
    title: report.data.title,
    summary: report.data.summary,
    tags: ['intelligence', report.data.kind],
    generatedBy: 'intelligence',
    metadata: { reportId: report.data.reportId, kind: report.data.kind }
  };
  const jsonArtifact = artifacts.create(opts);
  const mdArtifact = artifacts.create({ ...opts, format: 'markdown', content: report.markdown });

  if (storageRoot) {
    const day = String(nowOf(report)).slice(0, 10);
    const dir = pathJoin(storageRoot, 'reports', day);
    fsMkdir(dir);
    atomicWriteLocal(pathJoin(dir, `${report.data.kind}-report.json`), JSON.stringify(report.data, null, 2));
    atomicWriteLocal(pathJoin(dir, `${report.data.kind}-report.md`), report.markdown);
  }
  return { json: jsonArtifact, markdown: mdArtifact, reportId: report.data.reportId };
}

function nowOf(report) {
  return report.data.generatedAt;
}

export const reportBuilders = {
  health: buildHealthReport,
  incident: buildIncidentReport,
  alert: buildAlertReport,
  campaign: buildCampaignReport,
  operations: buildOperationsReport
};
