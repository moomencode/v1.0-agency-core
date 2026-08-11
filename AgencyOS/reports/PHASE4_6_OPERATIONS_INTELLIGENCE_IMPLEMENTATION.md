# Phase 4.6 Implementation Report — Operations Intelligence

> `AgencyOS/intelligence/` — the observability plane for AgencyOS: an
> event-driven, read-mostly module that turns the platform's existing events,
> records and scheduler history into a deterministic metric series, operational
> insights, incidents, alerts and operator reports — while touching no
> decision, execution, approval or budget semantics. API version 1.0.
> Design: `PHASE4_6_OPERATIONS_INTELLIGENCE_DESIGN.md` (binding, 36 sections).

## 1. Architecture Report

Intelligence is a **read-mostly observer**. It reads orchestrator campaigns,
instances, decisions and traces; delivery records; scheduler history — and
writes only to its own storage (`storageRoot`, default `intelligence/storage`).
It never writes through orchestrator/delivery/scheduler/policy/strategy paths
(test-enforced by storage-diff scanning), and its malfunction cannot corrupt
agency state.

```
Bus events (orchestrator · brain · delivery · scheduler)
   │  sink: validate → redact-at-write → daily NDJSON + watermark + dedupe
   ▼
MetricStore (series points + aggregates)   EventLog (redacted history)
   │                                             │
   ├── jobs (8, windowed, idempotent, marked)    └── incident triggers
   │      funnel · reliability · durations          + recovery sweeps
   │      providers · budget_burn · scheduler_stats
   ▼
InsightStore (recompute-over-write)   IncidentStore   AlertStore
   │                                    │               │
   ▼                                    ▼               ▼
Reports (health · incident · alert · campaign · operations)
   → artifacts (agency-health, incident-digest, alert-digest,
     campaign-report, operations-report) + readable mirrors
```

### 1.1 Module Inventory

| Path | Responsibility |
|---|---|
| `index.js` | `createIntelligence` facade — engine boot, store wiring, bus attach |
| `engine.js` | `IntelligenceEngine`: config/rule validation (`INT_INVALID_ALERT_RULE` on unknown metric/kind), `start/stop`, `runJobs/runJob`, `snapshot`, `buildReport/writeReport`, `health` (marker ages, storage bytes) |
| `errors.js` | `INT_CODES` + `intError` |
| `ids.js` | pure id functions: `eventIdFor`, `pointIdFor`, `insightIdFor`, `alertIdFor`, `incidentKeyFor`/`incidentIdFor`, `windowKeyFor`, `sanitizeScopeId` |
| `utils.js` | `windowsBetween` (bounded, UTC-aligned), `utcWindowFor`, `round2`, atomic writes |
| `config/` | `intelligence.config.json` (jobs, sink, incidents, alerts, metrics registry+derived) · `alerts.json` (6 rules) |
| `schemas/` | 10 JSON schemas (intelligence-config, alert-rule, alert-record, event-envelope, metric-point, metric-aggregate, incident, insight, job-marker, report) |
| `sinks/event-sink.js` | `EventSink`: envelope validation, write-time redaction, daily rollover, watermark resume, LRU + replay dedupe, bounded buffer with drop counter, `eventIdFor` |
| `stores/metrics.js` | `MetricStore`: registry-validated points per day, LRU dedupe, aggregates, `sum/avg/derive`, window-scoped `readPoints` |
| `stores/events.js` | `EventLog`: redacted event rows per day, window-scoped reads |
| `stores/incidents.js` | `IncidentStore`: upsert/dedupe/count/evidence cap, `resolve`, `ack`, `close`, append-only history |
| `stores/alerts.js` | `AlertStore`: deterministic `activate` (dedupe by alertId), `resolve`, `resolveForRuleScope`, cooldown tracking |
| `stores/insights.js` | `InsightStore`: recompute-over-write insights keyed by (kind, scope, window) |
| `jobs/framework.js` | `JobFramework`: pending windows (never future windows), markers, killswitch, scheduler registration, caps |
| `jobs/funnel.js` | day windows; per-campaign + agency funnel (discovered/qualified/approved/deployed/delivered, rejected/escalated, rates) |
| `jobs/reliability.js` | hour windows; executions started/succeeded, delivery deployed/failed, step completions, rates, summary |
| `jobs/durations.js` | hour windows; e2e + per-step durationMs percentiles from traces + events |
| `jobs/providers.js` | day windows; provider attempts/failures/dryRuns/verified, verify durations; single-writer of `provider.*` points |
| `jobs/budget_burn.js` | hour windows; utilization %, burnPerHour, per-limit counters; single-writer of `budget.*` points |
| `jobs/scheduler_stats.js` | day windows; runs/succeeded/failed per job + success rate; single-writer of `scheduler.*` points |
| `jobs/incidents.js` | hour windows; deterministic triggers (step_failed, limits_reached, escalation, provider_error, campaign_stuck, data_quality) + recovery sweep |
| `jobs/alerts.js` | hour windows; metric rules (derived/aggregated, minSamples, cooldown, dedupe by alertId) + kind rules mirroring open incidents |
| `tools/report.mjs` | deterministic report builders + `writeReportArtifacts` (json + markdown, kind-specific artifact types, mirrors) |
| `tests/` | 9 offline suites + `helpers.mjs` fixture stack (simulated campaign, fixed clock, shifted-stream windows) |
| `demo.mjs` | full simulated campaign → events → sink → jobs → insights → incidents → alerts → reports |

### 1.2 Scheduler Hardening (data-integrity prerequisite)

Two fixes landed in `scheduler/` before analytics could trust its history:

- **SCH-01** — atomic persist+enqueue with replay: a crash between persistence
  and dispatch no longer loses a job run; `regression-460.mjs` (21 PASS)
  injects the crash window.
- **SCH-02** — stop semantics: timers are cleared on `stop/close` so a closed
  scheduler never fires phantom runs (12 PASS in `regression-455.mjs`, 49 in
  `smoke.mjs`).

Regression suites were added (not modified behavior) to prove identical
observable behavior for existing schedules.

## 2. Determinism & Data Integrity

- **Pure ids**: `eventId = evt-<sha256(event|module|at|correlation|payload)>`;
  `insightId = ins-<sha256(kind|scope|window)>`; `alertId = alr-<sha256(rule|scope|windowStart)>`;
  `reportId = rpt-<sha256(kind|now)>`. No timestamps or randomness in identities.
- **Watermark resume**: the sink persists `<basename>, <lineNo>` after every
  envelope; a clean restart replays nothing (verified: replayed 0, windows
  reprocessed 0). Replay is idempotent (LRU + point dedupe).
- **Byte-stable recompute**: re-running all 8 jobs over the same windows
  produces identical files — `tests/determinism.mjs` runs the full pipeline
  twice in separate engines and diffs every file (20 PASS).
- **Markers never advance past `now`**: a job's pending windows are filtered to
  completed windows only, so recomputes are final and restart can never
  reprocess a partial future window.
- **Single-writer rule**: `provider.*` and `scheduler.*` points are produced
  only by their jobs; the sink never maps delivery events into provider
  metrics (delivery events carry no provider id).

## 3. Verification

| Suite | Result | Coverage |
|---|---|---|
| `tests/models.mjs` | 36 PASS | 10 schemas, metric registry (unknown key → error), pure ids |
| `tests/sink.mjs` | 50 PASS | envelope validation, redaction (vault + patterns), LRU + watermark dedupe, drops, day-boundary rollover |
| `tests/jobs.mjs` | 79 PASS | golden insights per window (byte-stable), recompute idempotent, marker crash recovery, window bounds, killswitch abort |
| `tests/incidents.mjs` | 20 PASS | trigger mapping, dedupe/count/evidence cap, resolve-on-clear, ack/close, history |
| `tests/alerts.mjs` | 30 PASS | rule validation, evaluation, dedupe by (rule, scope, window), cooldown, recovery |
| `tests/security.mjs` | 22 PASS | path containment, no cross-store writes (storage diff), no policy writes, redaction at rest |
| `tests/reports.mjs` | 57 PASS | golden reports (health/incident/alert/campaign/operations), deterministic ids/content, artifacts + mirrors, `INT_STORE_ERROR` without ArtifactManager |
| `tests/determinism.mjs` | 20 PASS | full pipeline byte-reproducible, sink-only deterministic, ids pure, markers deterministic, `windowsBetween` bounded/aligned |
| `tests/integration.mjs` | 32 PASS | day-1 + day-2 cycle, incident lifecycle, alert lifecycle, clean restart, records-only backfill mode, health surface |
| **Intelligence total** | **346 PASS, 0 FAIL** | |
| `scheduler/regression-460.mjs` | 21 PASS | SCH-01 crash window (atomic persist+enqueue, replay) |
| `scheduler/regression-455.mjs` | 12 PASS | SCH-02 stop semantics |
| `scheduler/smoke.mjs` | 49 PASS | scheduler regression |
| Platform regression | green | delivery 12+16, orchestrator 8+1+3+5+1, website-engine 2 (112 checks) + 10 |
| Secret scan | clean | `delivery/security/scan.js` + `delivery/qa/secret-scan.js` exit 0 |

Golden values (shifted +3h fixture, day 08-10): funnel discovered 6 /
qualified 6 / approved 4 / deployed 4 / delivered 4 / rejected 1 / escalated 1,
approvedPct 66.67, deliveredPct 100; reliability hour 11:00 — 4/6 executions
succeeded (66.67%), 8 deployed events, 1 delivery failure, 12 steps;
durations e2e p50 36000ms (4 × 12s steps), step p50 500ms; providers —
attempts 6, failures 1, dry-runs 1, verified 5; budget — 100% utilized,
burnPerHour 39, elapsed 1h, maxDeployments 83.33%; scheduler_stats — 8 runs,
6 succeeded, 2 failed. Fixture produces zero spurious incidents/alerts.

## 4. Demo

`node intelligence/demo.mjs` runs 11 demonstrations end to end:

1. module boot + configuration validation
2. simulated campaign: 57-event stream → sink (57 written, 0 rejected, 0 duplicates)
3. deterministic identifiers (pure functions)
4. all 8 jobs → insights (funnel, reliability, providers, budget, durations, scheduler stats)
5. incident lifecycle (open → job resolve → operator ack/close)
6. alert lifecycle (failure-rate rule activates at 75% → resolves next day)
7. recompute idempotency (98 → 98 points, markers untouched)
8. clean restart (0 replayed, 0 windows reprocessed)
9. killswitch abort (marker `aborted`, no window consumed)
10. records-only backfill over existing storage (no bus)
11. five reports → artifacts + readable mirrors under `reports/2026-08-11/`

## 5. Rollout & Backlog Disposition

- **No data migration** — intelligence starts fresh from events/records; a
  records-only backfill over existing Phase 4.5 demo data is demonstrated
  (engine without a bus produces the same insights from records alone).
- **SCH-01** — disposition **B** (fixed in 4.6.0 as data-integrity
  prerequisite; regression suite `regression-460.mjs` shipped).
- **SCH-02** — disposition **B** (fixed; regression suites extended).
- **PRV-01** — disposition **C** (tracked separately in delivery maintenance;
  not part of 4.6.0).
- **Phase 4.6.1 backlog** (SHOULD HAVE, not built): observations import,
  compare-experiment, priority hints, cost-efficiency, backfill job,
  retention job, digests polish.

## 6. Production Readiness Checklist

- [x] All 9 new suites green (346 PASS) + scheduler regression (82 PASS) + platform regression green.
- [x] Golden-file reports byte-stable across runs.
- [x] Security: no cross-store writes, no policy writes, raw stores grep-clean of secret patterns, path containment.
- [x] Crash-injection: sink watermark resume; job marker recovery; SCH-01/SCH-02 fixed.
- [x] Killswitch abort honored by all jobs.
- [x] Demo: full simulated campaign → events → insights → incidents → alerts → reports, artifacts readable.
- [x] Docs: `intelligence/README.md`, this report, root `README.md`/`ARCHITECTURE.md` updated (additive).
- [x] Backlog disposition recorded (SCH-01 B, SCH-02 B, PRV-01 C).
