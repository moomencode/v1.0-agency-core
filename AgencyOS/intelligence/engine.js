import fs from 'node:fs';
import path from 'node:path';
import { Validator } from '../runtime/validator.js';
import { intError, INT_CODES } from './errors.js';
import { MetricStore } from './stores/metrics.js';
import { EventLog } from './stores/events.js';
import { IncidentStore } from './stores/incidents.js';
import { AlertStore } from './stores/alerts.js';
import { InsightStore } from './stores/insights.js';
import { EventSink } from './sinks/event-sink.js';
import { RecordsReader } from './jobs/records.js';
import { JobFramework } from './jobs/framework.js';
import { buildJobSet } from './jobs/index.js';
import { runRetentionSweep } from './jobs/retention.js';
import { runBackfill } from './jobs/backfill.js';
import { ObservationStore } from './observations/store.js';
import { importObservations } from './observations/import.js';
import { reportBuilders, writeReportArtifacts } from './tools/report.mjs';
import { dirSize } from './utils.js';

const INCIDENT_KINDS = ['step_failed', 'limits_reached', 'escalation', 'provider_error', 'campaign_stuck', 'data_quality'];

// Intelligence engine: owns configuration validation, the validated stores, the
// event sink (read-only consumer of the runtime bus), the scheduled analysis
// jobs, incident triggers and local alert evaluation. It never writes through
// orchestrator/delivery/scheduler paths.
export class IntelligenceEngine {
  constructor({ root, bus = null, scheduler = null, clock = null, logger = null, configFile = null, alertsFile = null, orchestratorRoot = null, deliveryRoot = null, schedulerBaseDir = null, vault = null, killswitchRoot = null, artifacts = null, storageRoot = null } = {}) {
    if (!root) throw intError(INT_CODES.STORE_ERROR, 'intelligence requires a root directory', {});
    this.root = root;
    this.logger = logger;
    this.now = clock?.now || (() => new Date());
    this.validator = new Validator({ schemasDir: path.join(root, 'schemas'), logger });

    this.config = this._loadConfig(configFile || path.join(root, 'config', 'intelligence.config.json'));
    this.rules = this._loadRules(alertsFile || path.join(root, 'config', 'alerts.json'));

    this.storageRoot = storageRoot ? path.resolve(storageRoot) : path.join(root, this.config.storageRoot);
    fs.mkdirSync(this.storageRoot, { recursive: true });
    this.artifacts = artifacts || null;

    this.metrics = new MetricStore({ root: this.storageRoot, registry: this.config.metrics.registry, derived: this.config.metrics.derived, lruCap: this.config.sink?.lruCap || 10000, clock });
    this.events = new EventLog({ root: this.storageRoot });
    this.incidents = new IncidentStore({ root: this.storageRoot, evidenceCap: this.config.incidents?.evidenceCap || 50, clock });
    this.alerts = new AlertStore({ root: this.storageRoot, clock });
    this.insights = new InsightStore({ root: this.storageRoot });
    this.observations = new ObservationStore({ root: this.storageRoot, clock, lruCap: this.config.observations?.lruCap || 10000 });

    this.observationSchema = this.validator.loadFile(path.join(root, 'schemas', 'observation.schema.json'));
    this.observationBatchSchema = this.validator.loadFile(path.join(root, 'schemas', 'observation-batch.schema.json'));

    this.reader = new RecordsReader({
      orchestratorRoot: orchestratorRoot || path.join(root, 'storage', 'orchestrator-engine'),
      deliveryRoot: deliveryRoot || root,
      schedulerBaseDir: schedulerBaseDir || path.join(root, 'storage', 'scheduler')
    });

    this.sink = new EventSink({
      root: this.storageRoot,
      bus,
      validator: this.validator,
      envelopeSchema: this.validator.loadFile(path.join(root, 'schemas', 'event-envelope.schema.json')),
      registry: this.config.sink,
      metrics: this.metrics,
      vault,
      lruCap: this.config.sink?.lruCap || 10000,
      bufferCap: this.config.sink?.bufferCap || 1000,
      clock,
      logger
    });

    const ctx = {
      reader: this.reader,
      events: this.events,
      metrics: this.metrics,
      insights: this.insights,
      incidents: this.incidents,
      alerts: this.alerts,
      observations: this.observations,
      config: this.config,
      rules: this.rules,
      root: this.storageRoot,
      getSinkStats: () => this.sink.statsSnapshot()
    };
    this.ctx = ctx;

    this.framework = new JobFramework({
      root: this.storageRoot,
      killswitchRoot: killswitchRoot || orchestratorRoot,
      scheduler,
      clock,
      logger
    });
    for (const def of buildJobSet(ctx)) this.framework.define(def.name, def);
  }

  _loadConfig(configFile) {
    if (!fs.existsSync(configFile)) throw intError(INT_CODES.INVALID_CONFIG, `config not found: ${configFile}`, { configFile });
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    const schema = this.validator.loadFile(path.join(this.root, 'schemas', 'intelligence-config.schema.json'));
    const check = this.validator.validate(config, schema, { schemaPath: 'intelligence:config' });
    if (!check.valid) {
      throw intError(INT_CODES.INVALID_CONFIG, `intelligence config invalid: ${check.errors[0]?.message}`, { errors: check.errors.slice(0, 20) });
    }
    return config;
  }

  _loadRules(alertsFile) {
    if (!fs.existsSync(alertsFile)) throw intError(INT_CODES.INVALID_ALERT_RULE, `alert rules not found: ${alertsFile}`, { alertsFile });
    const registry = JSON.parse(fs.readFileSync(alertsFile, 'utf8'));
    const rules = Array.isArray(registry) ? registry : registry.rules;
    if (!Array.isArray(rules)) throw intError(INT_CODES.INVALID_ALERT_RULE, 'alert rules file must contain a rules array', { alertsFile });
    const schema = this.validator.loadFile(path.join(this.root, 'schemas', 'alert-rule.schema.json'));
    const knownMetrics = new Set([...this.config.metrics.registry, ...this.config.metrics.derived]);
    for (const rule of rules) {
      const check = this.validator.validate(rule, schema, { schemaPath: `intelligence:alert-rule:${rule.ruleId}` });
      if (!check.valid) throw intError(INT_CODES.INVALID_ALERT_RULE, `rule "${rule.ruleId}" invalid: ${check.errors[0]?.message}`, { errors: check.errors.slice(0, 20) });
      if (rule.metric && !knownMetrics.has(rule.metric)) {
        throw intError(INT_CODES.INVALID_ALERT_RULE, `rule "${rule.ruleId}" references unknown metric "${rule.metric}"`, { ruleId: rule.ruleId, metric: rule.metric });
      }
      if (rule.kind && !INCIDENT_KINDS.includes(rule.kind)) {
        throw intError(INT_CODES.INVALID_ALERT_RULE, `rule "${rule.ruleId}" references unknown incident kind "${rule.kind}"`, { ruleId: rule.ruleId, kind: rule.kind });
      }
    }
    return rules;
  }

  start() {
    this.sink.start();
    return this;
  }

  stop() {
    this.sink.stop();
    return this;
  }

  async runJobs({ now = null } = {}) {
    const nowIso = now || this.now().toISOString();
    const results = [];
    for (const name of this.framework.jobs.keys()) {
      results.push(await this.framework.execute(name, { now: nowIso }));
    }
    return results;
  }

  async runJob(name, { now = null, window = null } = {}) {
    const nowIso = now || this.now().toISOString();
    return this.framework.execute(name, { now: nowIso, window });
  }

  snapshot() {
    return {
      configVersion: this.config.version,
      enabled: this.config.enabled !== false,
      sink: this.sink.statsSnapshot(),
      metrics: this.metrics.snapshot(),
      events: { count: this.events.count(), days: this.events.days().length },
      observations: this.observations.statsSnapshot(),
      incidents: { open: this.incidents.openCount(), total: this.incidents.list().length },
      alerts: { active: this.alerts.activeCount(), total: this.alerts.list().length },
      insights: { kinds: this.insights.list().length > 0 ? [...new Set(this.insights.list().map((i) => i.kind))].sort() : [], total: this.insights.list().length },
      jobs: { runs: this.framework.stats.runs, windows: this.framework.stats.windows, aborted: this.framework.stats.aborted },
      storageBytes: dirSize(this.storageRoot)
    };
  }

  // 4.7.0 observation ingestion: validates the whole batch (schema, sizes,
  // secrets), then applies accepted rows deterministically. Receipts are
  // byte-stable for identical input under a fixed clock.
  importObservations({ items, source, batchId = null, caps = {} } = {}) {
    return importObservations({
      items,
      source,
      batchId,
      validator: this.validator,
      schema: this.observationSchema,
      batchSchema: this.observationBatchSchema,
      store: this.observations,
      reader: this.reader,
      clock: { now: this.now },
      caps: { maxRowsPerBatch: this.config.observations?.maxRowsPerBatch, maxBytesPerBatch: this.config.observations?.maxBytesPerBatch, maxRowBytes: this.config.observations?.maxRowBytes, ...caps }
    });
  }

  // 4.7.0 retention: sweeping storage-only, dry-run capable, report-only on
  // scheduler-owned history. Never touches live incidents/alerts.
  runRetentionSweep({ dryRun = false, now = null } = {}) {
    const nowIso = now || this.now().toISOString();
    return runRetentionSweep({ ctx: this.ctx, nowIso, dryRun });
  }

  // 4.7.0 explicit, resumable recompute of insight windows. Idempotent —
  // completed windows are marked and skipped on retry; never looks at future
  // windows. Defaults to the registered job set.
  backfill({ from, to, jobs = null, maxWindows = 90, now = null } = {}) {
    return runBackfill({
      jobSet: [...this.framework.jobs.values()],
      framework: this.framework,
      ctx: this.ctx,
      from,
      to,
      jobs,
      maxWindows,
      now
    });
  }

  buildReport(kind, { now = null, campaignId = null } = {}) {
    const builder = reportBuilders[kind];
    if (!builder) throw intError(INT_CODES.UNKNOWN_REPORT, `unknown report kind "${kind}"`, { kind });
    const at = now || this.now().toISOString();
    return builder({ engine: this, now: at, campaignId });
  }

  // Recompute the insight(s) a job produces for one specific window (or all
  // pending windows when none is given). Kind → job mapping mirrors buildJobSet.
  async recomputeInsight(kind, { window = null, now = null } = {}) {
    const kindToJob = {
      funnel: 'intelligence:funnel',
      reliability: 'intelligence:reliability',
      durations: 'intelligence:durations',
      provider_reliability: 'intelligence:providers',
      budget_burn: 'intelligence:budget',
      scheduler_stats: 'intelligence:scheduler_stats'
    };
    const job = kindToJob[kind];
    if (!job) throw intError(INT_CODES.UNKNOWN_REPORT, `no insight job for kind "${kind}"`, { kind });
    return this.runJob(job, { window, now });
  }

  // Build a report and persist it: kind-specific artifact type via the shared
  // ArtifactManager (when provided) + mirrored copy under storageRoot/reports/.
  writeReport(kind, { now = null, campaignId = null, runId = null, projectId = null, workflowId = null } = {}) {
    const report = this.buildReport(kind, { now, campaignId });
    if (!this.artifacts) {
      throw intError(INT_CODES.STORE_ERROR, 'writeReport requires an artifacts manager', { kind });
    }
    return writeReportArtifacts({
      artifacts: this.artifacts,
      report,
      projectId: projectId || this.config.reports?.projectId || 'agency',
      workflowId: workflowId || this.config.reports?.workflowId || 'intelligence',
      runId,
      storageRoot: this.storageRoot
    });
  }

  // Health surface (Section 23): sink stats, watermark age, job marker ages,
  // store sizes, open incident/alert counts.
  health() {
    const nowMs = this.now().getTime();
    const markerAges = {};
    for (const name of this.framework.jobs.keys()) {
      const marker = this.framework.loadMarker(name);
      markerAges[name] = marker ? { lastWindowStart: marker.lastWindowStart, lastWindowEnd: marker.lastWindowEnd, status: marker.status, updatedAt: marker.updatedAt, ageMs: marker.updatedAt ? nowMs - new Date(marker.updatedAt).getTime() : null } : null;
    }
    const sink = this.sink.statsSnapshot();
    const watermarkAgeMs = sink.watermark && sink.lastEventAt ? nowMs - new Date(sink.lastEventAt).getTime() : null;
    const snapshot = this.snapshot();
    return {
      module: 'intelligence',
      healthy: sink.rejected === 0 && snapshot.incidents.open <= 25,
      sink: { written: sink.written, rejected: sink.rejected, dropped: sink.dropped, watermarkAgeMs },
      stores: { eventsBytes: dirSize(path.join(this.storageRoot, 'events')), metricsBytes: dirSize(path.join(this.storageRoot, 'metrics')), observationsBytes: dirSize(path.join(this.storageRoot, 'observations')), storageBytes: snapshot.storageBytes },
      markers: markerAges,
      openIncidents: snapshot.incidents.open,
      activeAlerts: snapshot.alerts.active,
      generatedAt: this.now().toISOString()
    };
  }
}

export function createIntelligence(opts) {
  return new IntelligenceEngine(opts);
}
