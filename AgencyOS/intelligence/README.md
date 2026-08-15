# Operations Intelligence (Phase 4.6 + 4.7.0 Foundation & Trust)

> The observability plane for AgencyOS: an event-driven, read-mostly module that
> turns the platform's existing events, records and scheduler history into a
> deterministic metric series, operational insights, incidents, alerts and
> operator reports — without touching any decision, execution, approval or
> budget semantics.

## Overview

Intelligence observes the agency. It sits **beside** the orchestrator and
delivery systems, never inside them:

- **Read-mostly observer**: it reads `orchestrator-engine/` campaigns, instances
  and traces; reads `delivery/records`; reads scheduler history — and writes
  only to its own `intelligence/` storage. A malfunctioning intelligence module
  cannot corrupt agency state (test-enforced).
- **Event sink**: every bus event (orchestrator, brain, delivery, scheduler) is
  validated, redacted at write time, persisted to daily NDJSON files with a
  watermark, and deduplicated (LRU + watermark replay) — exactly-once ingestion.
- **Windowed jobs**: 9 idempotent jobs compute insights per fixed UTC window
  (hourly/daily), guarded by job markers, a killswitch and caps. Re-running a
  job over the same windows is a byte-stable no-op.
- **Deterministic everything**: `eventId`, `insightId`, `alertId`, `incidentId`,
  `observationId` and `batchId` are pure functions of content — the same inputs
  always produce the same outputs, across processes and restarts.
- **Observation ingestion** (4.7.0): schema-validated observation batches
  (conversion, lead_inquiry, site_up, …) with per-row rejection reasons, size
  caps (5000 rows / 1 MB / 64 KB per row), whole-batch secret rejection, orphan
  detection via `reader.hasExecution`, payload redaction at rest and
  byte-stable receipts: `engine.importObservations({ items, source, batchId })`.
- **Retention sweeps** (4.7.0): `engine.runRetentionSweep({ dryRun, now })`
  removes expired day files (events/metrics/observations), insights + metric
  aggregates past their retention window, terminal resolved incidents/alerts
  past cutoff, and delegates artifact expiry. Live incidents/alerts and
  unreadable files are never deleted; scheduler history is report-only.
- **Explicit backfill** (4.7.0): `engine.backfill({ from, to, jobs, maxWindows, now })`
  recomputes job windows over an explicit range, resumable and idempotent via a
  persisted marker (`intelligence_backfill.json`), never runs future windows,
  and aborts cleanly on killswitch.
- **Incidents & alerts**: deterministic incident triggers over events/records
  with recovery sweeps; configurable alert rules (metric thresholds + incident
  mirrors) with dedupe, cooldown and resolution.
- **Reports**: five report kinds (health, incident, alert, campaign,
  operations) written through the Phase 3.3 artifact system with
  kind-specific artifact types and readable mirrors under
  `<storageRoot>/reports/<date>/`.

```text
createIntelligence({ root, bus, clock, orchestratorRoot, deliveryRoot,
                     schedulerBaseDir, killswitchRoot, storageRoot, ... })
        │
IntelligenceEngine (facade)      AgencyOS/intelligence/index.js
   ├── EventSink                  validate → redact → daily NDJSON + watermark + dedupe
   ├── MetricStore                series points + aggregates (registry-validated)
   ├── EventLog                   queryable redacted event history
   ├── IncidentStore              open/ack/resolve/close + append-only history
   ├── AlertStore                 active/resolved records + cooldowns
   ├── InsightStore               recompute-over-write insights per (kind, scope, window)
   ├── RecordsReader              read-only views over orchestrator/delivery/scheduler
   ├── JobFramework               markers, pending windows, killswitch, caps
   └── buildJobSet()              9 jobs (funnel, reliability, durations, providers,
                                  budget_burn, scheduler_stats, incidents, alerts, retention)
```

## Quick Start

```js
import { createIntelligence } from './AgencyOS/intelligence/index.js';

const engine = createIntelligence({
  root: './AgencyOS/intelligence',
  bus,                                    // shared EventBus (optional)
  clock,                                  // injectable; defaults to wall clock
  orchestratorRoot: './storage/orchestrator-engine',
  deliveryRoot: '.',
  schedulerBaseDir: './storage/scheduler',
  killswitchRoot: './storage/orchestrator-engine',
  storageRoot: './storage/intelligence'
});
engine.start();                            // attach sink to the bus
await engine.runJobs({ now: '2026-08-11T10:00:00.000Z' });
engine.stop();
```

## The 9 Jobs

| Job | Window | Reads | Produces |
|---|---|---|---|
| `intelligence:funnel` | day | campaign/execution/decision records | per-campaign + agency funnel (discovered → qualified → approved → deployed → delivered) |
| `intelligence:reliability` | hour | event stream + records | executions started/succeeded, delivery counts, failure/success rates |
| `intelligence:durations` | hour | traces (`trace.ndjson`) + events | e2e + per-step duration percentiles |
| `intelligence:providers` | day | delivery records | provider attempts/failures/dry-runs/verified, verify durations (single-writer of `provider.*` points) |
| `intelligence:budget_burn` | hour | campaign budget records | utilization %, burn rate, per-limit counters |
| `intelligence:scheduler_stats` | day | scheduler history | runs/succeeded/failed per job + success rate |
| `intelligence:incidents` | hour | events + records | deterministic incident triggers + recovery sweep |
| `intelligence:alerts` | hour | metric points + incidents | rule evaluation, activation, cooldown, resolution |
| `intelligence:retention` | day `0 5 * * *` | storageRoot + artifacts | retention sweep (expired day files, insights, terminal incidents/alerts, artifact expiry) + `retention.filesRemoved`/`retention.bytesFreed` points |

## Alerts

Rules live in `config/alerts.json` and are validated at engine load (unknown
metric or incident kind → hard error `INT_INVALID_ALERT_RULE`). Two rule forms:

- **metric rules** — derived/aggregated values over a rule window
  (e.g. `agency.failureRatePct > 50`, `provider.failureRatePct > 30`,
  `budget.burnPerHour > 8`), gated by `minSamples` and cooldown, deduped by
  deterministic `alertId = alertIdFor(rule, scope, windowStart)`.
- **kind rules** — mirror open incidents of a given kind, resolved when no
  incident of that kind remains open.

## Reports

`engine.buildReport(kind, { now })` and `engine.writeReport(kind, { now, runId, ... })`
(deterministic `reportId = rpt-<sha256(kind|now)>`; requires an `ArtifactManager`).

| Report | Artifact type | Contents |
|---|---|---|
| `health` | `agency-health` | sink/metrics/incidents/alerts/jobs snapshot + storage bytes |
| `incident` | `incident-digest` | status summary, incident list, recent history |
| `alert` | `alert-digest` | configured rules + active alerts |
| `campaign` | `campaign-report` | campaign record + funnel/budget/reliability insights |
| `operations` | `operations-report` | health + open incidents + active alerts + latest insights |

Every report is written as JSON + Markdown artifacts and mirrored to
`<storageRoot>/reports/<yyyy-mm-dd>/` so it is readable without the artifact
system.

## Security & Boundaries

- Redaction happens **at write time** (`delivery/security/redaction.js`); raw
  stores are grep-verified to contain no secret patterns.
- Path containment on every file operation; caller-supplied ids are sanitized.
- No cross-store writes: jobs never write to orchestrator/delivery/scheduler/
  policy/strategy files (test-enforced by storage-diff scanning).
- Single-writer rule: `provider.*` and `scheduler.*` points are produced only
  by their jobs, never by sink events.
- Killswitch: `EMERGENCY_STOP` file (or `ORC_EMERGENCY_STOP=1`) aborts any job
  run before it consumes a window.

## Tests & Demo

```bash
node intelligence/tests/models.mjs        # 36 PASS  — 10 schemas, registry, ids
node intelligence/tests/sink.mjs          # 50 PASS  — envelopes, redaction, dedupe, replay
node intelligence/tests/jobs.mjs          # 79 PASS  — golden insights, idempotency, killswitch
node intelligence/tests/incidents.mjs     # 20 PASS  — triggers, dedupe, resolve, ack/close
node intelligence/tests/alerts.mjs        # 30 PASS  — rules, activation, cooldown, recovery
node intelligence/tests/security.mjs      # 22 PASS  — containment, redaction at rest
node intelligence/tests/reports.mjs       # 57 PASS  — golden reports + artifacts + mirrors
node intelligence/tests/determinism.mjs   # 20 PASS  — byte-reproducibility across runs
node intelligence/tests/integration.mjs   # 32 PASS  — day cycle, incidents, alerts, restart
node intelligence/tests/observations.mjs  # 41 PASS  — ingestion, receipts, dedupe (4.7.0)
node intelligence/tests/retention.mjs     # 30 PASS  — sweeps, live guards, dry-run (4.7.0)
node intelligence/tests/backfill.mjs      # 11 PASS  — ranges, markers, killswitch (4.7.0)
node intelligence/tests/security-470.mjs  # 14 PASS  — storage-diff, secrets, golden (4.7.0)
node intelligence/demo.mjs                # full simulated campaign → reports
node intelligence/demo-470.mjs            # observations/retention/backfill/scheduler-fire/PRV-01/ID-1 evidence
```

Design: `reports/PHASE4_7_DESIGN.md` + `reports/PHASE4_6_OPERATIONS_INTELLIGENCE_DESIGN.md`.
Implementation reports: `reports/PHASE4_7_FOUNDATION_TRUST_IMPLEMENTATION.md`,
`reports/PHASE4_6_OPERATIONS_INTELLIGENCE_IMPLEMENTATION.md`.
