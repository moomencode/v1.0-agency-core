// Deterministic incident triggers over a window: events are mapped to
// incidents; recovery evidence (later success events / terminal states /
// healthy counters) resolves them. Wall-clock ordering concerns do not apply —
// within a window pass, trigger evidence and recovery evidence are processed
// together against the same event set.
const DATA_QUALITY_THRESHOLD = 100;

export function incidentsJob({ reader, events, metrics, incidents, config, root, getSinkStats = null }) {
  const c = config.incidents;
  const stuckThresholdMs = c.stuckThresholdMs || 3600000;
  return {
    name: 'intelligence:incidents',
    version: 1,
    schedule: '0 * * * *',
    windowMs: 3600000,
    maxWindows: 48,
    async run({ window, now, ctx }) {
      const rows = events.read({ start: window.start, end: window.end });
      const inputs = { eventsRead: rows.length, windowStart: window.start, windowEnd: window.end };
      const evidenceOf = (evId) => [{ id: evId, kind: 'event' }];
      const opened = [];
      const resolved = [];

      // Map events to incident signals.
      for (const line of rows) {
        const corr = line.correlation || {};
        const executionId = corr.executionId || null;
        const campaignId = corr.campaignId || null;
        const step = corr.step || null;
        const evidence = evidenceOf(line.eventId);
        switch (line.ev) {
          case 'orchestrator.failed': {
            opened.push(incidents.upsert({
              scope: { type: 'execution', id: executionId || 'unknown' },
              kind: 'step_failed',
              severity: 'critical',
              subject: 'execution-failed',
              detail: 'execution exhausted retries and failed',
              evidence
            }));
            break;
          }
          case 'orchestrator.step_failed': {
            opened.push(incidents.upsert({
              scope: { type: 'step', id: `${executionId || 'exec'}:${step || 'step'}` },
              kind: 'step_failed',
              severity: 'warning',
              subject: step || 'step',
              detail: `step "${step}" failed`,
              evidence
            }));
            break;
          }
          case 'orchestrator.limits_reached': {
            opened.push(incidents.upsert({
              scope: { type: 'campaign', id: campaignId || 'agency' },
              kind: 'limits_reached',
              severity: 'warning',
              subject: 'limits',
              detail: 'campaign budget/limit threshold reached',
              evidence
            }));
            break;
          }
          case 'orchestrator.approval_required': {
            opened.push(incidents.upsert({
              scope: { type: 'execution', id: executionId || 'unknown' },
              kind: 'escalation',
              severity: 'warning',
              subject: 'approval',
              detail: 'execution waiting for approval',
              evidence
            }));
            break;
          }
          case 'delivery.failed': {
            const record = reader.readDeliveryRecord(corr.recordId);
            const provider = record ? record.provider : null;
            opened.push(incidents.upsert({
              scope: provider ? { type: 'provider', id: provider } : { type: 'agency', id: 'agency' },
              kind: 'provider_error',
              severity: 'warning',
              subject: provider || corr.recordId || 'delivery',
              detail: `delivery failed for ${corr.recordId || 'unknown record'}`,
              evidence
            }));
            break;
          }
          default:
            break;
        }
      }

      // Campaign stuck: running campaign with no activity since stuckThresholdMs.
      for (const campaignId of reader.campaignIds()) {
        const file = reader.readCampaign(campaignId);
        if (!file || file.state !== 'RUNNING') continue;
        const updatedMs = new Date(file.updatedAt || file.createdAt).getTime();
        const windowEndMs = new Date(window.end).getTime();
        if (windowEndMs - updatedMs > stuckThresholdMs) {
          opened.push(incidents.upsert({
            scope: { type: 'campaign', id: campaignId },
            kind: 'campaign_stuck',
            severity: 'warning',
            subject: 'stuck',
            detail: `no activity since ${file.updatedAt || file.createdAt}`,
            evidence: [{ id: `campaign:${campaignId}`, kind: 'record' }]
          }));
        } else if (file.state === 'COMPLETED' || file.state === 'STOPPED') {
          // handled below via recovery sweep
        }
      }

      // Data quality snapshot trigger.
      const stats = getSinkStats ? getSinkStats() : { rejected: 0, dropped: 0 };
      const bad = (stats.rejected || 0) + (stats.dropped || 0);
      if (bad > DATA_QUALITY_THRESHOLD) {
        opened.push(incidents.upsert({
          scope: { type: 'agency', id: 'agency' },
          kind: 'data_quality',
          severity: 'info',
          subject: 'sink',
          detail: `${bad} envelope(s) rejected or dropped by the sink`,
          evidence: [{ id: `sink:${window.end}`, kind: 'job' }]
        }));
      }

      // Recovery sweep — resolve incidents whose condition cleared.
      const recoveryEvents = new Set(rows.map((r) => r.ev));
      const recoveryExecutions = new Set(rows.filter((r) => r.ev === 'orchestrator.deployed' || r.ev === 'orchestrator.approved' || r.ev === 'orchestrator.denied').map((r) => r.correlation?.executionId).filter(Boolean));
      const terminalCampaigns = new Set();
      for (const campaignId of reader.campaignIds()) {
        const file = reader.readCampaign(campaignId);
        if (file && (file.state === 'COMPLETED' || file.state === 'STOPPED')) terminalCampaigns.add(campaignId);
      }
      const verifiedProviders = new Set();
      for (const line of rows) {
        if (line.ev !== 'delivery.deployed') continue;
        const record = reader.readDeliveryRecord(line.correlation?.recordId);
        if (record && record.provider) verifiedProviders.add(record.provider);
      }
      for (const rec of reader.deliveryRecords()) {
        if (rec && rec.status === 'verified' && rec.createdAt >= window.start && rec.createdAt < window.end && rec.provider) verifiedProviders.add(rec.provider);
      }

      const tryResolve = (key, note) => {
        const incident = incidents.get(key);
        if (incident && incident.status !== 'resolved' && incident.status !== 'closed') {
          resolved.push(incidents.resolve({ key, by: 'job', note }));
        }
      };

      for (const incident of incidents.list()) {
        const scope = incident.scope;
        if (incident.kind === 'step_failed' && incident.severity === 'critical' && scope.type === 'execution') {
          if (recoveryEvents.has('orchestrator.deployed') && recoveryExecutions.has(scope.id)) tryResolve(incident.key, 'execution succeeded after failure');
        } else if (incident.kind === 'step_failed' && scope.type === 'step') {
          if (recoveryEvents.has('orchestrator.step_completed')) tryResolve(incident.key, 'step completed on retry');
        } else if (incident.kind === 'escalation' && scope.type === 'execution') {
          if (recoveryEvents.has('orchestrator.approved') || recoveryEvents.has('orchestrator.denied')) tryResolve(incident.key, 'approval granted or denied');
        } else if (incident.kind === 'provider_error' && scope.type === 'provider') {
          if (verifiedProviders.has(scope.id)) tryResolve(incident.key, 'provider verified a deployment');
        } else if (incident.kind === 'limits_reached' && scope.type === 'campaign') {
          if (terminalCampaigns.has(scope.id)) tryResolve(incident.key, 'campaign completed or stopped');
        } else if (incident.kind === 'campaign_stuck' && scope.type === 'campaign') {
          if (terminalCampaigns.has(scope.id)) tryResolve(incident.key, 'campaign left RUNNING state');
        }
      }
      if (bad <= DATA_QUALITY_THRESHOLD) {
        for (const incident of incidents.list()) {
          if (incident.kind === 'data_quality' && incident.status !== 'resolved' && incident.status !== 'closed') {
            resolved.push(incidents.resolve({ key: incident.key, by: 'job', note: 'sink health restored' }));
          }
        }
      }

      return { opened: opened.length, resolved: resolved.length, inputs };
    }
  };
}
