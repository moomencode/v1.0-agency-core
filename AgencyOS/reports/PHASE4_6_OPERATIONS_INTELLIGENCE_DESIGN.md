# Phase 4.6 — Agency Operations & Intelligence Layer (Design)

- **Phase**: 4.6 — Operations & Intelligence
- **Status**: DESIGN ONLY — no implementation performed, no source files modified, no commits
- **Date**: 2026-08-11
- **Repository**: Garcia2 (git root `D:\demo wepsite\Garcia2`), module prefix `AgencyOS/`
- **Git reference audited**: `main` @ `8030f78` (clean tree, tag `v1.6.0-orchestrator`)
- **Deliverable**: this document only

---

## 1. Executive Summary

AgencyOS has reached Phase 4.5: an autonomous, approval-gated orchestration layer that discovers
businesses, scores them deterministically (Brain), builds dossiers and websites (pipeline +
website-engine), deploys them (delivery), and keeps every action auditable (traces, audit log,
approval ledger). What the platform still lacks is an **information plane**: a layer that turns the
mountain of events, traces, records, and counters it already produces into structured metrics,
incidents, alerts, insights, and operator-readable reports — without becoming a second decision-maker.

This document designs the **Agency Operations & Intelligence Layer (Phase 4.6)** as a new,
read-mostly observer module (`AgencyOS/intelligence/`) that:

1. **Listens** to the existing event bus (best-effort, never in the execution hot path).
2. **Reads** existing orchestrator/execution records read-only (never writes into orchestrator storage).
3. **Produces** its own append-only, redacted stores: metrics series, event log, observations,
   incidents, alerts, and insights.
4. **Reports** through the existing artifacts system (deterministic report artifacts).
5. **Never changes** a verdict, never deploys, never mutates workflow state, and never auto-applies
   learned behavior.

Scope is divided into **MUST HAVE** (Phase 4.6.0), **SHOULD HAVE** (Phase 4.6.1), and **FUTURE**
(explicitly out of scope) so the phase stays a realistic single delivery. The three backlog items
(SCH-01, SCH-02, PRV-01) are dispositioned: both scheduler items are **Phase 4.6 hardening**
(their defects corrupt the exact reliability data this layer aggregates), and the Vercel provider
issue is **separate maintenance** (contained, delivery-stable, independent of intelligence).

---

## 2. Current State Audit

Verified against the working tree at `8030f78` on 2026-08-11.

### 2.1 Repository state

- Branch `main`, clean working tree, up to date with `origin/main`.
- Tags: `v1.0-agency-core`, `v1.1.0-brain`, `v1.2.0-dossier`, `v1.3.0-pipeline`,
  `v1.4.0-website-engine`, `v1.5.0-delivery`, `v1.6.0-orchestrator`.
- Verification baseline (Phase 4.5 close): **51 suites / 1148+ assertions**; orchestrator suite
  **119 PASS / 0 FAIL**; **16 module smokes PASS**.
- No root `AgencyOS/package.json`; zero runtime dependencies; Node 24 ESM; `storage/` under
  `AgencyOS/` is gitignored. No HTTP server (local-only surface).

### 2.2 Module inventory (all reusable — nothing may be duplicated)

| Module | Role | Relevant surfaces for 4.6 |
|---|---|---|
| `runtime/` | Shared utilities | `utils.js` (`atomicWrite`, `readJson`, `writeJson`, `ensureDir`, `stableStringify`, `hashString`, `shortHash`, `sanitizeName`, `sanitizeRunId`, `nowIso`, `sleep`); `eventBus.js` (`emitEvent(event, meta, payload)`) |
| `communication/` | Message bus & transports | `bus.js`, `message.js`, `queue.js`, `transport.js`, `heartbeat.js`, `registry.json` — acks, TTL, retries, heartbeat; the intended seam for future distributed mode |
| `validation/` | Schema validation | `engine.js`, `rules.js`, `report.js` — validate every new store and every import |
| `metrics/` | Counters/sums/snapshot | `engine.js`: `KNOWN_EVENTS` (businessDiscovered, businessSkipped, businessApproved, websiteGenerated, executionSucceeded, executionFailed, retry, escalation); counter+sum recording with `amount`; `snapshot()` → `businesses` / `performance` / `reliability` blocks; atomicWrite persistence; unknown event → error (typo-proof registry pattern) |
| `memory/` | Persistent knowledge | 8 types (working, project, business, brand, customer, agent, workflow, execution) with scope prefixes, TTL, versioned entries, fingerprints, index, sweeper, snapshots/restores |
| `artifacts/` | Deliverables | 21 types incl. `campaign-report`, `execution-report`, `decision-record`, `approval-record`, `execution-trace`, `deployment-report`, `qa-report`; formats md/json/html/text/svg/pdf/image; path containment enforced |
| `scheduler/` | Jobs & history | `engine.js` (`job_started`/`job_retry`/`job_succeeded`/`job_failed` emits, retries, persisted history), `cron.js`, `queue.js`, `runner.js`, `store.js` |
| `brain/` | Decision/policy | `BRAIN_EVENTS` (lead_discovered, decision_made, strategy_selected, plan_started, plan_completed); `runBusiness` → `{businessId, record, context, policy, decision, trace, strategy, route, plan, state, snapshot}`; `decision`: `{decisionId, verdict, confidence, risk.level, estimates{salesValue, roi, closingProbability, buildTimeMs}}`, `scores{opportunity, feasibility, competition, fit}`; `trace.headline`; internal `MetricsCollector` wired in |
| `discovery/` | Leads | Record: `{id, name, category, scores{business, opportunity, salesPriority.tier}, sources[], sourceSignals}`; probe modes online/simulated |
| `dossier/`, `pipeline/`, `website-engine/` | Production chain | Produce `research-report`/`seo-report`/`brand-document`/`ux-audit`/`website` artifacts |
| `delivery/` | Deploy | Record `{id (deterministic recordIdFor(buildId)), businessId, buildId, trace, provider, target, mode, status, deployment.id, dryRun, qaReport, error, rollback}`; emits `delivery.deployed` / `delivery.failed`; `security/`: `scanText`, `redactText`, `safeForLog`, `SecretVault`; `deliveryRetry`; rollback/revert managers |
| `orchestrator/` | Execution | See 2.3 |

### 2.3 Orchestrator surfaces (the primary producer for 4.6)

- **Events** — `orchestrator/observability/events.js`: 21 `ORC_EVENTS`
  (campaign_started/paused/resumed/completed/stopped/limits_reached, execution_started,
  step_completed/step_failed/step_retrying, state_changed, approval_required, approved, denied,
  deployed, failed, archived, rolled_back, kill_switch), emitted to listeners and bridged to the
  shared bus as `{module: 'orchestrator'}`. Listener failures never break the orchestrator.
- **Storage layout** (deterministic ids, all under `AgencyOS/storage/...`):
  - `instances/<executionId>/` → `decision.json` (full brainResult incl. scores/estimates),
    `checkpoint.json`, `trace.ndjson`, `trace.json`, `execution-report.json`
  - `campaigns/<campaignId>.json` → campaign state + `budget` ledger
  - `approvals/<approvalId>.json` → immutable approval ledger entries
  - `logs/orchestrator/<date>.ndjson` → redacted audit entries
  - id conventions: `cmp-<hex16>`, `orc-<hex16>`, `apr-<hex16>` (`sha256` fingerprints)
- **Budget ledger** — `budget.counters = {businesses, deployments, aiCalls, providerCalls, retries,
  steps}`, `budget.reached[]`, limits `{maxBusinesses, maxConcurrent, maxRetries, maxDeployments,
  maxAiCalls, maxProviderCalls, maxExecutionDurationMs, maxCampaignDurationMs}`; every
  `tryConsume(kind, n)` persists via atomicWrite (crash-safe accounting).
- **Trace collector** — per-execution NDJSON, every line `safeForLog`-redacted, assembled into
  `trace.json` per the `execution-trace` schema (`outcome`, `events[{step, detail, at}]`,
  `dossierVersion`, `pipelineRunId`, `engineRunId`, `deliveryRecordId`).
- **Recovery/safety** — `recovery/resume.js` (campaign resume, pending approvals), killswitch
  (`EMERGENCY_STOP` file + `ORC_EMERGENCY_STOP` env), `concurrency/lock.js` + `pool.js`,
  `policy/gate.js`, `limits/budget.js`, autonomy levels L1–L4.
- **Adapters** — `integrations/*.js` (`brain`, `discovery`, `dossier`, `pipeline`, `website`,
  `delivery`, `artifacts`, `memory`, `scheduler`, `validation`): the established integration pattern
  (constructor injection, thin wrappers, `tryConsume` accounting).
- **Schemas** — `orchestrator/schemas/*.schema.json` (10): approval, autonomy-config, campaign-report,
  campaign, checkpoint, execution-report, execution-trace, limits, orchestration-error,
  workflow-instance.

### 2.4 Security invariants already in force (must be preserved by every 4.6 store)

- `sanitizeRunId` applied at every runtime/pipeline filesystem boundary; hashed `cmp-`/`orc-`/`apr-`
  ids; `sanitizeBusinessId` for business-scoped paths.
- `safeForLog(line, {vault})` redaction (secret patterns + vault entries) on traces, audit, and
  event payloads; final QA secret scan blocks credential-bearing content before deployment.
- Validation at every module boundary; path containment in artifacts.

### 2.5 Gaps this phase closes

1. No structured, queryable metric *series* (the metrics engine tracks 9 counters/sums, not a
   campaign/execution/provider-dimensioned time series).
2. No incidents/alerts: failures, limit hits, escalations, and provider errors are visible only in
   logs/traces, not aggregated or surfaced as lifecycle-managed records.
3. No cross-execution aggregation: no funnel rates, no duration/reliability breakdowns, no budget
   burn analysis, no operator digest.
4. No safe path for external outcome signals (post-deployment observations) to enter the system.
5. No versioned comparison of decision policies (learning is impossible to evaluate, hence the
   risk of "learning without breaking determinism" being done ad hoc).
6. Scheduler defects (SCH-01/SCH-02) corrupt exactly the job history that reliability analytics
   would aggregate.

---

## 3. Design Principles

1. **Never duplicate existing engines.** Reuse `runtime`, `communication`, `validation`,
   `artifacts`, `metrics`, `memory`, `scheduler`, `delivery/security`. New code is only for
   *derivation, aggregation, and reporting* — never for re-implementing storage, validation, or events.
2. **No second Brain.** The Brain remains the only decision-maker. Intelligence computes and
   reports; it never scores, never evaluates policies for the live path, and never changes verdicts.
3. **No second Scheduler.** Intelligence jobs are registered with the existing `scheduler/`
   (cron/immediate/retries/history) and consume the same reliability guarantees.
4. **No bypass of Orchestrator/Delivery security.** Every input (events, observations, imports)
   passes validation + `safeForLog` redaction before persistence. Intelligence creates no new trust
   surface.
5. **Reuse public APIs.** Integration follows the established adapter pattern
   (`orchestrator/integrations/*`): constructor injection, thin wrappers, best-effort semantics.
6. **Event-driven where appropriate.** The intelligence sink subscribes to the shared bus. Sinks
   are best-effort, bounded, and idempotent (watermark replay) — mirroring the audit-log precedent.
7. **Determinism everywhere.** Aggregations must be reproducible: fixed bucketing, stable ordering,
   tie-breaks by hashed ids, injectable clocks in all jobs, golden-file tests. No wall-clock logic
   inside computations (only in recorded timestamps).
8. **Auditability.** Every derived value must be traceable to the events/records that produced it
   (evidence links, schema versions, job versions). Everything is append-only or versioned; nothing
   is silently overwritten.
9. **Idempotency.** All jobs and imports are rerunnable and produce identical output for identical
   input windows (recompute semantics, no read-then-act races on shared files).
10. **Crash recovery.** Job markers, watermarks, and stores use `atomicWrite`; a crash mid-job
    leaves prior outputs intact and the job re-runs its window.
11. **Security boundaries.** New stores live under `storage/intelligence/`; all scope-derived paths
    are sanitized; redaction is applied at write time, never at read time.
12. **No unnecessary infrastructure.** Filesystem + Node built-ins only; no databases, no servers.
    (The `communication/` transport stack is the designed upgrade path, not a dependency.)
13. **Future distributed execution stays possible.** Jobs partition by scope (campaign/execution),
    single-writer per partition/day, event sink tolerates replay, and job markers are leaseable
    (`orchestrator/concurrency/lock.js` pattern).
14. **Intelligence informs, never overrides.** No automatic interventions: prioritization hints,
    adaptation proposals, and alerts all terminate in artifacts/records that require a human or an
    existing gate (approval store) to act.

---

## 4. Goals & Non-Goals

### 4.1 Goals

- A structured, persistent, queryable **metric series** across agency/campaign/execution/provider
  dimensions, built from existing events and records (no new instrumentation points where events
  already exist).
- **Operational intelligence**: funnel analytics, durations, reliability, provider behavior, budget
  burn — as deterministic insight records and report artifacts.
- **Incident & alert models** with deterministic triggers, dedupe, severity, lifecycle, and local
  surfacing (audit + digest artifacts + console), with external notification explicitly deferred.
- A **safe outcome-signal ingestion infrastructure** (validation, redaction, dedupe, receipts) with
  no live external adapters in this phase.
- A **learning boundary** that enables offline, versioned policy comparison experiments with zero
  auto-application, preserving reproducibility.
- **Human operations surface**: operator-readable report artifacts (health, incidents, alerts,
  campaigns) generated on demand and on schedule.
- Scheduler hardening (SCH-01, SCH-02) so the job-history data intelligence aggregates is truthful.

### 4.2 Non-Goals (explicitly out of scope)

- Any change to verdict semantics, policy evaluation on the live path, deployment behavior, or
  autonomy-level semantics.
- External integrations (web analytics, CRM, payment/webhook notification) — FUTURE.
- Monetary cost accounting (no invented pricing; resource units only) — FUTURE.
- Real-time/interactive dashboards, servers, or any network listener — FUTURE.
- Self-adaptation (auto-tuning policies from data) — FUTURE, gated on production history.
- Distributed execution — design seams only (Section 33).
- Any new dependency (npm) — rejected by principle 12.

---

## 5. Intelligence Scope Evaluation (A–I)

Each item is evaluated as: why needed → which module produces the data → who consumes it → what
new code → belongs in 4.6? → determinism/auditability impact. Verdicts use
**M = MUST (4.6.0)**, **S = SHOULD (4.6.1)**, **F = FUTURE**.

### A. Agency Metrics — **MUST (4.6.0 core)**

- *Why*: Phase 4.5 counters exist but are in-memory/snapshot; the agency needs a persistent,
  dimensioned series (per campaign/execution/provider/step) derived from the event stream.
- *Producers*: `orchestrator` events, `brain` events, `delivery` events, `scheduler` job events,
  budget ledger, execution reports.
- *Consumers*: insights, alerts, reports, operators, compare-experiments (policy version metrics).
- *New code*: metric registry (typo-proof, extending the existing `KNOWN_EVENTS` pattern), series
  store, event→metric mapping, daily rollover, retention job.
- *Verdict*: **M** — it is the foundation everything else reads.
- *Determinism*: metric keys are static; points carry `ts` + deterministic ids; aggregation windows
  are fixed buckets. Auditable: every point records its source eventId.

### B. Operational Intelligence — **MUST (4.6.0 core)**

- *Why*: cross-execution aggregation is the phase's purpose (funnels, durations, success rates,
  provider reliability, budget burn) — none of it exists today.
- *Producers*: traces, execution reports, campaign files, delivery records, scheduler history.
- *Consumers*: operators, campaign reports, alert rules, compare-experiments.
- *New code*: insight job framework + job functions; insight store; report generation.
- *Verdict*: **M**.
- *Determinism*: recompute-over-write per window; golden files.

### C. Outcome Feedback (safe signal ingestion) — **S (4.6.1 infrastructure only)**

- *Why*: the only way the platform ever learns real-world results is through a *safe* ingestion
  path; without it, Phase 4.5's `estimatedRevenue` can never be validated.
- *Producers*: none today (that is the point). Infrastructure: explicit, validated imports.
- *Consumers*: observation store, validation reports, later compare-experiments.
- *New code*: observation schema + import API + batch receipts + dedupe; **no adapters**.
- *Verdict*: **S** — build the pipe, not the hoses. Live adapters (uptime checks, analytics
  imports, operator-entered outcomes) are **F**.
- *Determinism/security*: import is explicit, size-limited, schema-validated, secret-scanned, and
  idempotent by `observationId` hash.

### D. Learning Without Breaking Determinism — **S (4.6.1 mechanism)**

- *Why*: the requirement exists; the *mechanism* (versioned policy comparison, offline
  re-simulation) is deterministic and safe; auto-adaptation is not.
- *Producers*: stored `decision.json` records (inputs incl. scores/estimates), policy/strategy
  version files.
- *Consumers*: operators (review artifacts), Brain maintainers (manual policy updates).
- *New code*: policy snapshot at campaign start, `compare-experiment` job (offline re-run of the
  pure `DecisionEngine` under an explicit alternative policy version), experiment report artifacts.
  **Zero auto-apply** — enforced by design and by tests.
- *Verdict*: **S**.
- *Determinism*: engine is a pure function of (record, context, policy, strategy) — identical
  inputs, identical outputs; report diff table is reproducible.

### E. Campaign Intelligence — **MUST (4.6.0, delivered by the insight jobs in B)**

- *Why*: per-campaign funnel/stage/timing/budget analytics is the primary operator deliverable.
- *Producers*: campaign files (ledger, timeline), instance files, approval store.
- *Consumers*: campaign-report artifacts (additive fields), ops digest.
- *New code*: campaign insight job (funnel rates, stage durations, retry/escalation breakdowns,
  budget utilization) — part of the B framework, not a separate engine.
- *Verdict*: **M** (folded into B's job set; listed separately for scope clarity).

### F. Autonomous Prioritization — **S (4.6.1, advisory only)**

- *Why*: with limits (e.g. `maxBusinesses: 20`) the order businesses are admitted matters; a
  deterministic `priorityHint` (opportunity tier, tie-break by business id hash) is safe.
- *Producers*: discovery scores (already in records), campaign state.
- *Consumers*: orchestrator admission order (pending queue ordering), ops reports.
- *New code*: deterministic ordering function + report column; a small orchestrator hook to sort
  the pending queue by the hint (advisory, never skips approvals, never re-scores).
- *Verdict*: **S**.
- *Determinism*: pure function of (scores, ids); stable ordering.

### G. Human Operations — **MUST (4.6.0 surface, S extras in 4.6.1)**

- *Why*: operators need a generated, deterministic "what is the agency doing / what needs me"
  surface. Approvals already exist (ApprovalStore); incidents/alerts/health digests do not.
- *Producers*: all stores; orchestrator state; killswitch state.
- *Consumers*: humans.
- *New code*: report tooling (`tools/report.mjs`), health/incident/alert/campaign digest artifacts.
- *Verdict*: **M** (digests), with richer interactive/HTML views **S/F**.
- *Determinism*: reports are generated from snapshots at a fixed point; golden-file tested.

### H. Alerts — **MUST (4.6.0 engine, local surfacing only)**

- *Why*: thresholds over aggregates (e.g. success rate, provider error rate, budget burn) need a
  deterministic evaluation engine + dedupe + severity + lifecycle; external delivery is FUTURE.
- *Producers*: metric aggregates, incidents.
- *Consumers*: operators (digest/console/audit), FUTURE notifiers.
- *New code*: alert rule registry (validated config), evaluation job, alert records, digest.
- *Verdict*: **M** (engine + local surfacing); external notification **F**.
- *Determinism*: rule evaluation over fixed windows; cooldown by rule+scope+window.

### I. Cost & Resource Intelligence — **S (4.6.1)**

- *Why*: the platform already meters resources (providerCalls, aiCalls, build times, storage);
  ratios and burn forecasts make budgets actionable without inventing money.
- *Producers*: budget ledgers, traces, scheduler history, storage stats.
- *Consumers*: ops digest, campaign reports, alert rules (burn rate).
- *New code*: resource-unit aggregation + deterministic forecast formulas.
- *Verdict*: **S**; monetary pricing **F**.

**Scope verdict summary**: A, B, E, G, H = MUST (4.6.0); C, D, F, I = SHOULD (4.6.1); adapters,
notifiers, dashboards, distributed, self-adaptation = FUTURE.

---

## 6. Backlog Disposition (SCH-01, SCH-02, PRV-01)

Rubric: **A** = 4.6 blocker, **B** = 4.6 hardening, **C** = separate maintenance, **D** = deferred.

### SCH-01 — crash between job persist and memory-queue enqueue drops the run (`scheduler/engine.js:216-250`)
- *Verdict*: **B — Phase 4.6 hardening** (fix in 4.6.0).
- *Reasoning*: 4.6 registers *scheduled analysis jobs* on this engine; a lost run means a silently
  missing insight window, and the missing history corrupts the reliability metrics this phase
  aggregates. The fix (persist + enqueue as one atomic operation, replay from store on recovery)
  is small, behavior-preserving, and testable with a crash-injection fixture.
- *Impact if not fixed*: insight jobs become best-effort; reliability stats understate runs.

### SCH-02 — retry timer not cleared on stop/close; can keep the process alive and fire post-stop (`scheduler/engine.js:314`, stop/close at `:84-100`)
- *Verdict*: **B — Phase 4.6 hardening** (fix in 4.6.0).
- *Reasoning*: a post-stop retry produces a *phantom job run* in history — the exact artifact that
  scheduler reliability analytics read. Phantom runs would silently skew success/retry rates.
  Same file, same hardening pass as SCH-01. Behavior-preserving (no semantics change for
  well-behaved callers).
- *Impact if not fixed*: phantom runs poison `scheduler.*` aggregates; process exit hangs.

### PRV-01 — dead `default` export + unknown readyState mapped to BUILDING, burning the 120 s verify window with a misleading `PROVIDER_ERROR` (`delivery/providers/vercel/index.js:11`, `:70`)
- *Verdict*: **C — separate maintenance** (tracked in delivery maintenance, not 4.6).
- *Reasoning*: the defect is contained to one provider adapter, is visible/handled in the delivery
  record (documented error + rollback/revert path), and does not affect the data intelligence
  consumes (delivery records are read as-is). Intelligence aggregation must simply be robust to
  `provider_error` outcomes (it is, by design). Fixing it is orthogonal and low-risk; it can be
  merged at any time without coupling to 4.6.

*Nothing in the current backlog is dispositioned A (blocker) or D (deferred); D is reserved for
FUTURE backlog (external notifiers, monetary cost accounting).*

---

## 7. Reference Architecture — Three Planes

```
        ┌────────────────────────────────────────────────────────────┐
        │            HUMAN OPERATOR (approvals, imports, review)      │
        │  ApprovalStore (existing)   •   report artifacts   •   config│
        └───────┬────────────────────────────────────────────────────┘
                │ (approval gate, existing)          │ (reads)
   ┌────────────┴──────────┐      ┌──────────────────┴──────────────────┐
   │ BRAIN — DECISION      │      │ OPERATIONS INTELLIGENCE — INFO      │
   │ plane (unchanged)     │      │ plane (NEW, read-mostly)            │
   │ verdicts, policies,   │      │ sinks → metrics/events             │
   │ strategies, strategy  │      │ derives → insights/incidents/alerts│
   │ selection, estimates  │      │ reports → artifacts (deterministic)│
   └────────────┬──────────┘      └──────────────────┬──────────────────┘
                │  scores / verdicts                 │  reads (read-only)
   ┌────────────┴──────────┐                         │
   │ ORCHESTRATOR —        │────────────────────────►┘   existing events,
   │ EXECUTION plane       │  bus (existing, unchanged)   records, traces,
   │ campaigns, budgets,   │                             audit, ledger
   │ approvals, steps,     │
   │ delivery, recovery    │
   └────────────┬──────────┘
                │
   discovery → dossier → pipeline → website-engine → delivery (unchanged)
```

- **Brain plane**: unchanged. Owns decision policy, strategy selection, estimates. Emits its 5
  events on the bus (already done).
- **Orchestrator plane**: unchanged execution semantics. Emits 21 events (already done). The only
  planned orchestration-side change is advisory: deterministic ordering of the *pending admission
  queue* by `priorityHint` (S, 4.6.1) — approval gates and verdict flow untouched.
- **Intelligence plane (new)**: consumes, derives, stores, reports. Writes *only* under
  `storage/intelligence/`. Never writes to orchestrator/brain/delivery storage.

Data flow contract:

1. Modules emit events on the shared bus (existing behavior; nothing new required upstream except
   optional additive metrics events from `brain`'s internal collector, Section 10.3).
2. The **EventSink** subscribes, validates the envelope, redacts, dedupes (watermark), and appends
   to `intelligence/events/<date>.ndjson`.
3. **Jobs** (scheduled via existing `scheduler/`) transform raw events + read-only records into
   metric points, aggregates, incidents, alerts, and insights under `storage/intelligence/`.
4. **Report tooling** renders deterministic report artifacts through the existing artifacts system.
5. Operators act through existing gates (approvals), manual config, and imports (observations).

---

## 8. Module Boundaries

### 8.1 New module: `AgencyOS/intelligence/`

```
intelligence/
  index.js            — facade: createIntelligence({root, bus, scheduler, metrics, artifacts,
                        validator, vault, config, logger}) → {sink, importObservations, incidents,
                        alerts, insights, reports, health, snapshot}
  engine.js           — wiring: sink, stores, job runner registration, report tooling
  errors.js           — INT_CODES (mirror style of sibling modules)
  package.json        — zero dependencies (reuses runtime/)
  config/
    intelligence.config.json      — committed defaults (validated by schema)
    alerts.json                   — alert rule registry (default rules)
  schemas/
    metric-point.schema.json
    event-envelope.schema.json
    observation.schema.json
    observation-batch.schema.json
    incident.schema.json
    alert-rule.schema.json
    alert-record.schema.json
    insight.schema.json
    intelligence-config.schema.json
    job-marker.schema.json
  sinks/
    event-sink.js     — subscribe, validate, redact, dedupe, watermark, append
  stores/
    metrics.js        — metric registry + append-only series + aggregates
    events.js         — event log reader (raw is only touched by the sink)
    observations.js   — observation store + batch receipts
    incidents.js      — current set + history + lifecycle transitions
    alerts.js         — current set + history + lifecycle
    insights.js       — recompute-over-write insight records
  jobs/
    framework.js      — job runner contract (window in → window out, marker, idempotent)
    funnel.js         — per-campaign funnel + stage durations
    reliability.js    — success/retry/failure rates by scope and step
    providers.js      — provider attempts/errors/verify durations
    budget.js         — burn rate, utilization, forecast (deterministic formulas)
    scheduler-stats.js— job history aggregates (post-hardening data)
    compare-experiment.js — offline policy-version comparison (S, 4.6.1)
    retention.js      — rollover/compaction/expiry (S, 4.6.1)
  tools/
    report.mjs        — CLI: generate health / incidents / alerts / campaign digests (M)
    import-observations.mjs — CLI: validated observation import (S, 4.6.1)
  tests/              — helpers.mjs + unit/integration suites (Section 31)
  README.md
```

### 8.2 Hard boundary rules (enforced by tests)

1. **Read-only reader**: intelligence never writes under `storage/instances/`, `storage/campaigns/`,
   `storage/approvals/`, `storage/logs/orchestrator/`, or any other module's storage. Integration
   tests assert no cross-writes occur during jobs.
2. **No hot path**: the sink is fire-and-forget, bounded (in-memory cap + drop counter), and its
   failures are never propagated to producers (same precedent as `AuditLog.append`).
3. **No decision authority**: the module exposes no API that alters verdicts, budgets, approvals,
   or workflow state. Its only mutation surfaces are its own stores and report artifacts.
4. **No second engines**: it uses `scheduler/`, `validation/`, `artifacts/`, `runtime/`,
   `delivery/security/`, and (read-only) `metrics/` conventions; it contains no new queue, no new
   validation, no new redaction implementation.

### 8.3 Responsibilities table

| Plane | Decides | Executes | Informs | Writes |
|---|---|---|---|---|
| Brain | verdict, strategy, policy | (via plans) | reasoning trace | decision records (via orchestrator), own metrics |
| Orchestrator | campaign flow, gates, limits | steps, approvals, delivery | events, traces, audit | instances/campaigns/approvals/logs |
| Intelligence | *nothing* | scheduled read-only jobs | metrics, insights, incidents, alerts, reports, hints | `storage/intelligence/**` only |

---

## 9. Data Separation Model (Memory vs Artifacts vs Metrics vs Traces vs Audit vs Intelligence)

| Store | Purpose | Writer | Reader | Lifecycle | Redaction |
|---|---|---|---|---|---|
| **Memory** (`memory/`) | Semantic knowledge facts (business/brand/customer/agent/workflow/execution summaries) | brain/pipeline/executors | brain, pipeline, future services | Versioned, TTL per type, sweeper | Entry payloads via `safeForLog`; `SECRET_PATTERN` rejected at write |
| **Artifacts** (`artifacts/`) | Human-deliverable files (reports, sites, decision records, traces as files) | producers | humans, consumers | Immutable, contained paths | Write-time redaction |
| **Metrics** (`metrics/`) | Numeric counters/sums/snapshots (brain-level, in-memory + file) | brain | brain snapshots | Session + snapshot file | N/A (numbers) |
| **Traces** (`orchestrator/.../trace.ndjson`) | Per-execution step timeline | orchestrator steps | execution reports, operators | Per-instance, durable | `safeForLog` per line |
| **Audit** (`logs/orchestrator/<date>.ndjson`) | Operator/agency actions (who did what, when) | orchestrator/delivery | operators, compliance | Daily files, append-only | `safeForLog` per line |
| **Intelligence events** (new) | The inter-module event stream, redacted, as evidence | sink (bus subscriber) | jobs, audits | Daily NDJSON + retention job | `safeForLog` per envelope |
| **Intelligence derived** (new) | Metric points, aggregates, incidents, alerts, insights, observations | jobs/sink | reports, operators, experiments | Append-only raw + versioned aggregates | Applied at write; derived stores never hold raw credentials |

Rules:
- Raw data lives in the *producer's* store; intelligence stores **derived** data only, plus the
  redacted event stream (evidence) and observations (explicitly imported signals).
- One canonical owner per store; no two modules write the same file.
- Everything is append-only or explicitly versioned; "updates" are new versions with history.

---

## 10. Event Model & Ingestion

### 10.1 Canonical envelope (stored form, schema `event-envelope.schema.json`)

```json
{
  "schema": "https://agency.os/intelligence/event-envelope",
  "ev": "orchestrator.deployed",
  "at": "2026-08-11T09:00:00.000Z",
  "module": "orchestrator",
  "eventId": "evt-<sha256-hex16(module|at|correlation|payload)>",
  "correlation": { "campaignId": "cmp-...", "executionId": "orc-...", "businessId": "..." },
  "payload": { "recordId": "...", "status": "deployed", "url": "..." }
}
```

- `eventId` is deterministic; it is the dedupe key.
- `payload` is `safeForLog`-redacted at sink time (with the shared vault), like audit/trace.

### 10.2 Event families consumed

| Family | Producer | Examples | Use in intelligence |
|---|---|---|---|
| `orchestrator.*` | orchestrator | campaign_started/completed/limits_reached, execution_started, step_completed/failed/retrying, approved/denied/deployed/failed, kill_switch | funnel, durations, incidents, alerts |
| `brain.*` | brain | lead_discovered, decision_made, strategy_selected, plan_started/completed | decision funnel, strategy mix |
| `delivery.*` | delivery | delivery.deployed, delivery.failed | provider reliability, incidents |
| `scheduler.job_*` | scheduler | job_started, job_retry, job_succeeded, job_failed | job reliability, alerts |
| `agency.metric_*` | brain metrics bridge (10.3) | metric_recorded | metric points when counters matter |

### 10.3 Wiring notes

- `orchestrator`, `delivery`, and `brain` already emit on the shared bus — **no producer change
  needed** for those families.
- `scheduler/_emit` currently notifies local listeners only. **Additive change (hardening pass)**:
  an optional `bridge` callback in the scheduler constructor that forwards
  `job_started/job_retry/job_succeeded/job_failed` envelopes to the bus (default `null`, so current
  behavior is unchanged).
- `brain`'s internal `MetricsCollector` records without bus emission. **Additive change (optional,
  MUST-A fallback)**: if bus emission is not wired, intelligence reads the brain snapshot files the
  orchestrator persists per campaign; both paths produce the same metric keys. Design keeps the
  snapshot-read as the default (zero producer change) and the bus bridge as an optimization.

### 10.4 Sink semantics

- Subscribe via `bus` (existing registry: add the consumed families to `registry.json` —
  additive, no breaking change).
- Validation: envelope must match schema (module with no schema → rejected + `sink.rejected`
  counter + audit entry).
- Redaction: `safeForLog(payload, {vault})`.
- Dedupe: in-memory LRU (`eventId`, cap 10 000) + persisted `watermark.json` storing
  `{file, lastLine, lastEventId}`. On restart, replay from watermark; duplicate `eventId`s are
  dropped silently (idempotent ingestion).
- Bounded: if the in-memory queue exceeds the cap, events are dropped and counted
  (`sink.dropped`), never blocking producers.
- Write: `fs.appendFileSync` to `intelligence/events/<date>.ndjson`; rollover at UTC day change
  (rollover decision uses `now` injected from `nowIso`, testable).

---

## 11. Metric Model

### 11.1 Metric keys (static registry, typo-proof)

Registered in `intelligence/config/intelligence.config.json` under `metrics.registry`:

```
agency.discovered / agency.approved / agency.websitesGenerated / agency.executions
agency.deployed / agency.failed / agency.escalations
campaign.started / campaign.completed / campaign.stopped / campaign.limitsReached
execution.succeeded / execution.failed / execution.retries / execution.steps
step.completed / step.failed / step.retried / step.durationMs(avg)
provider.attempts / provider.failures / provider.verifyDurationMs / provider.dryRuns
scheduler.jobsSucceeded / scheduler.jobsFailed / scheduler.jobsRetried
budget.utilizationPct / budget.burnPerHour / budget.remainingPct
```

- Unknown key → hard error in tests/CI (mirrors `MetricsCollector.record` behavior); runtime
  ignores unknown keys with an audit note (never breaks producers).

### 11.2 Metric point (schema `metric-point.schema.json`)

```json
{
  "schema": "https://agency.os/intelligence/metric-point",
  "ts": "2026-08-11T09:00:00.000Z",
  "metric": "campaign.deployments",
  "value": 1,
  "kind": "counter | gauge | ratio | duration",
  "scope": { "type": "agency|campaign|execution|business|provider|step|job", "id": "..." },
  "source": { "type": "event", "event": "orchestrator.deployed", "eventId": "evt-..." },
  "correlation": { "campaignId": "...", "executionId": "..." }
}
```

### 11.3 Series store

- Raw points: `intelligence/metrics/<date>.ndjson` (append-only, redacted = numbers + ids only).
- Aggregates: `intelligence/metrics/aggregates/<windowKey>.json`, where
  `windowKey = sha256-hex16(kind|scopeType|scopeId|windowStart|windowEnd)` — deterministic,
  recompute-over-write (job idempotency).
- Bucketing: fixed UTC windows `(start, end]`; window boundaries computed from the *campaign or
  execution* timeline where possible (not wall clock), else fixed 15-minute UTC buckets.
- Retention (retention job, S 4.6.1): raw 90 days, aggregates 2 years (configurable).

---

## 12. Observations & Outcome Signals Model (C — S, 4.6.1)

### 12.1 Principles

- **Explicit, validated, human-or-operator-initiated.** No scraping, no auto-fetch.
- **Idempotent** by `observationId` (hash of `batchId|kind|businessId|at|payload`).
- **Redacted** at import time; never stored with credentials (import rejects fields matching the
  secret pattern; `safeForLog` applied).
- **Referential integrity**: observations reference existing ids (`businessId`, optional
  `executionId`/`deliveryRecordId`) but are stored even if references are unknown (marked
  `orphan: true` in the receipt) — they must not fail campaigns.

### 12.2 Observation record (schema `observation.schema.json`)

```json
{
  "schema": "https://agency.os/intelligence/observation",
  "observationId": "obs-<hex16>",
  "batchId": "batch-<hex16>",
  "kind": "site_up | lead_inquiry | conversion | manual_review | deployment_signal",
  "businessId": "...",
  "executionId": "orc-... | null",
  "deliveryRecordId": "... | null",
  "at": "2026-08-11T09:00:00.000Z",
  "importedAt": "2026-08-11T10:00:00.000Z",
  "source": "import",
  "payload": { "url": "...", "status": "up", "notes": "..." },
  "integrity": "sha256-<hash of payload+businessId+at>"
}
```

### 12.3 Import contract (4.6.1)

- API: `intelligence.importObservations(batch)` — batch `{batchId?, items: [observation-like]}`.
- Per-item: schema validation → secret scan → dedupe (by observationId; duplicates recorded in
  receipt, not stored) → append to `intelligence/observations/<date>.ndjson`.
- Receipt: `intelligence/observations/batches/<batchId>.json` with `{accepted, rejected, duplicates,
  reasons[]}`; batch accepted as artifact type `observation-batch`.
- CLI: `node AgencyOS/intelligence/tools/import-observations.mjs <batch.json>`.
- Limits: max items per batch, max payload size, max fields — configurable; oversized rejected.
- Consumers (4.6.1+): validation reports ("estimated vs actual"), compare-experiment inputs
  (actual outcomes), alert rules (e.g. conversion rate below threshold).

### 12.4 Deferred (FUTURE)

- Live adapters: uptime checks via `delivery` verify results, web analytics imports, CRM/lead
  imports, operator web form. Design seam: an adapter is just a function producing
  `observation`-shaped items into the same import API.

---

## 13. Incident Model

### 13.1 Definition

An **incident** is a lifecycle-managed aggregation of related adverse signals. It is derived,
never imported raw.

### 13.2 Incident record (schema `incident.schema.json`)

```json
{
  "schema": "https://agency.os/intelligence/incident",
  "incidentId": "inc-<hex16>",
  "key": "inc-key-<hash(scope|kind|subject)>",
  "kind": "step_failed | limits_reached | escalation | provider_error | campaign_stuck | data_quality",
  "severity": "info | warning | critical",
  "status": "open | acknowledged | resolved | closed",
  "scope": { "type": "campaign|execution|provider|agency", "id": "..." },
  "firstSeen": "...", "lastSeen": "...",
  "openedAt": "...", "acknowledgedAt": "... | null", "resolvedAt": "... | null",
  "count": 3,
  "evidence": ["evt-...", "evt-..."],
  "detail": "redacted detail line",
  "resolvedBy": "job | operator", "resolutionNote": "..." 
}
```

### 13.3 Deterministic triggers

| Trigger (input) | Kind | Severity |
|---|---|---|
| `orchestrator.step_failed` with retryable error | step_failed | warning |
| `step_failed` exhausting retries → execution failed | step_failed | critical |
| `orchestrator.limits_reached` | limits_reached | warning |
| `orchestrator.escalation`-based failure / `approval_required` stale > X | escalation | warning/critical |
| `delivery.failed` / provider_error outcome | provider_error | warning |
| campaign started but no step_completed within maxExecutionDurationMs | campaign_stuck | warning |
| sink drop counter > threshold / schema rejections spike | data_quality | info |

### 13.4 Lifecycle

- `open`: first sighting of `key` → record created (`firstSeen = openedAt`).
- Dedupe: subsequent sightings increment `count`, update `lastSeen`, append evidence (cap 50
  evidence ids).
- `resolved`: condition clears (e.g., same execution succeeded; provider returns to ready;
  campaign reaches a healthy state) → `resolvedAt`, `resolvedBy: job`.
- `acknowledged`/`closed`: operator actions via the report tooling CLI or a small API
  (`incidents.ack(id, by)`, `incidents.close(id, by, note)`) — audited entries.
- Stored: open set `intelligence/incidents/current.json` (atomicWrite), append-only
  `intelligence/incidents/history.ndjson` for every transition.

---

## 14. Alert Model

### 14.1 Alert rule (schema `alert-rule.schema.json`, registry `config/alerts.json`)

```json
{
  "ruleId": "alert-success-rate-low",
  "metric": "agency.successRatePct",
  "op": "lt", "threshold": 90,
  "windowMs": 86400000,
  "severity": "warning",
  "minSamples": 5,
  "cooldownMs": 3600000,
  "enabled": true,
  "description": "Agency success rate below 90% over the last day"
}
```

- Rules reference only registered metric keys or incident kinds; validated at load and on write;
  numeric bounds checked (threshold within sane range); operator-owned file, changes audited.

### 14.2 Alert record (schema `alert-record.schema.json`)

```json
{
  "schema": "https://agency.os/intelligence/alert-record",
  "alertId": "alr-<hex16(ruleId|scope|windowStart)>",
  "ruleId": "alert-success-rate-low",
  "severity": "warning",
  "status": "active | resolved",
  "triggeredAt": "...", "resolvedAt": "... | null",
  "triggeredBy": { "metric": "agency.successRatePct", "value": 87.5, "threshold": 90, "window": { "start": "...", "end": "..." } },
  "scope": { "type": "agency|campaign|provider", "id": "..." }
}
```

### 14.3 Evaluation semantics

- Scheduled job (hourly default) evaluates rule over the latest closed window.
- Dedupe: an alert is created once per `(ruleId, scope, window)`; `cooldownMs` prevents flapping
  within the same window; recovery clears `status` (record kept, transition to history).
- Surfacing (M, local): audit log entry + alert digest artifact + console line in report tooling.
- FUTURE: external notifiers via a `delivery`-style provider with the same security/redaction
  (webhook/email) — explicitly out of 4.6.

---

## 15. Insight Model

### 15.1 Definition

An **insight** is a deterministic aggregation record: a reusable computation over a fixed input
window, stored with its inputs' identity so it can be recomputed or audited.

### 15.2 Insight record (schema `insight.schema.json`)

```json
{
  "schema": "https://agency.os/intelligence/insight",
  "insightId": "ins-<hex16(kind|scope|window)>",
  "kind": "funnel | reliability | durations | provider_reliability | budget_burn | cost_efficiency | scheduler_stats | experiment",
  "schemaVersion": 1,
  "job": "funnel@1",
  "scope": { "type": "campaign|agency|provider", "id": "..." },
  "window": { "start": "...", "end": "..." },
  "computedAt": "...",
  "inputs": { "rawEvents": 42, "recordsRead": { "campaigns": 1, "executions": 4 } },
  "data": { },
  "summary": "Human-readable one-liner",
  "artifactIds": ["art-..."]
}
```

### 15.3 Insight job framework (`jobs/framework.js`)

- Contract: `run({inputWindow, now, ctx}) → {insightId, window, data, summary, inputs}`.
- Idempotent: `store.put(insight)` overwrites the same `insightId` deterministically; a job marker
  records `{jobId, lastWindowStart, status, error}` in `intelligence/jobs/<jobId>.json`
  (atomicWrite) so crashes resume from the last completed window.
- Scheduling: registered with the existing `scheduler/` as jobs of type
  `intelligence:aggregate` (cron hourly/daily or triggered post-campaign), reusing retries/history.
- Bound: every job accepts `maxInputRows` / `maxExecutions` caps from config; a job exceeding the
  cap logs and completes the partial window (no infinite scans).
- Killswitch-aware: jobs check the `EMERGENCY_STOP` file and abort between windows.

### 15.4 Job set (4.6.0)

| Job | Output (data block examples) |
|---|---|
| `funnel` | per campaign: discovered→approved→deployed→delivered counts and rates; escalation reasons distribution; denied reasons distribution |
| `reliability` | success rate by scope (agency/campaign/provider/step), retry rate, failure reasons top-N |
| `durations` | avg/p50/p95 step durations (from trace events), end-to-end execution duration |
| `providers` | attempts, failures, verify durations, dry-run reuse rate per provider |
| `budget` | utilization % per limit, burn per hour, remaining budget, projected exhaustion (deterministic linear formula) |
| `scheduler_stats` | job success/retry rates from scheduler history (post-SCH-01/02 hardening) |
| `cost_efficiency` (S, 4.6.1) | resource units per deployed site: providerCalls, aiCalls, buildTimeMs, storage bytes |
| `compare_experiment` (S, 4.6.1) | verdict distribution + per-business diff under policy v1 vs v2 (Section 17) |

---

## 16. Campaign Intelligence (E — MUST, 4.6.0)

- Source of truth: `campaigns/<campaignId>.json` (state, `budget.counters`, `timeline`),
  instance files (`decision.json`, `trace.ndjson`, `execution-report.json`), approval store.
- Outputs:
  - Extended `campaign-report` artifact — **additive fields only** on the existing schema
    (`metrics` block gains `funnel`, `durations`, `budget`, `insights[]` references; existing
    fields and consumers unchanged).
  - `campaign-intelligence` insight records per campaign (job `funnel` + `budget` scoped to the
    campaign).
- Lifecycle: generated at `campaign_completed`/`campaign_stopped` (event-triggered immediate job)
    and re-generable on demand (`tools/report.mjs --campaign <id>`).
- Determinism: campaign timeline is the bucketing anchor; identical campaign → identical report
  (golden-file tested with a fixture campaign).

---

## 17. Learning & Adaptation Boundary (D — S, 4.6.1)

### 17.1 Model: versioned configuration + offline comparison

- Policies (`policies/defaults.json`) and strategies (`strategy/strategies/default.json`) become
  **versioned artifacts**: at campaign start, the orchestrator snapshots the exact policy/strategy
  files used into the campaign state (`policyVersion` hash) — **additive, no behavior change**.
- The `DecisionEngine` is a pure function: same (record, context, policy, strategy) → same
  verdict/estimates. `decision.json` already stores the full inputs (context scores, estimates,
  policy summary). Therefore:
  - `compare_experiment` job re-runs stored decision inputs through the engine with an explicit
    alternative policy version file (operator-provided, e.g. `policies/experiments/v2.json`).
  - Output: `experiment-report` artifact (verdict/estimate diffs table, aggregate distribution
    before/after, list of businesses that would change) + `experiment` insight record.
- **Zero auto-apply**: the experiment report is a review artifact; adopting v2 is a manual,
  versioned, audited file change by an operator. A test asserts the intelligence module has no
  code path that writes policy/strategy files.

### 17.2 Guardrails

- Experiments run only over *stored* decision inputs (never re-fetched/never live).
- No wall-clock dependence; identical inputs → identical report.
- Every experiment records `policyVersion`, `strategyVersion`, engine version, and the experiment
  input set hash → reproducible months later.

---

## 18. Autonomous Prioritization (F — S, 4.6.1, advisory only)

### 18.1 Mechanism

- `priorityHint` is a pure deterministic function of the pending business record:
  `tier(salesPriority) * 100 + opportunityScore`, tie-break by `sha256(businessId)` ascending.
- The orchestrator sorts its **pending admission queue** by the hint before admission checks
  (additive, behavior-preserving for single-item queues). Limits, budgets, approval gates, and
  Brain verdicts are untouched; hint ordering never skips an item or changes a decision.
- Reports expose the ordering rationale (`priority-order` list in campaign intelligence).

### 18.2 Boundary

- The hint is *information for admission order*, not a verdict: REJECT/ESCALATE outcomes still
  come only from the Brain. If a hint would reorder deployments, it doesn't — deployments remain
  strictly approval-driven.

---

## 19. Human Operations Interface (G — MUST surface 4.6.0)

Operator deliverables, all generated deterministically by `tools/report.mjs` (no server):

| Report | Contents | Schedule |
|---|---|---|
| `agency-health` | module smoke status, storage sizes, latest event/audit timestamps, killswitch state, sink drop counter, oldest/newest open incident | on demand + daily |
| `incident-digest` | open/acknowledged incidents, severity counts, top evidence links, stale open incidents | daily + on demand |
| `alert-digest` | active alerts, recent resolutions, rule status | daily + on demand |
| `campaign-report` | existing artifact + additive intelligence fields (Section 16) | campaign end + on demand |
| `operations-report` | agency-wide funnel, reliability, durations, providers, budget burn, cost efficiency | daily |
| `experiment-report` (4.6.1) | policy comparison results | on experiment completion |

- Interaction surface: approvals already flow through `ApprovalStore` (unchanged). Incidents/
  alerts are acknowledged/closed via the report tooling CLI (audited). Killswitch stays the
  emergency stop.
- FUTURE: interactive console/HTML dashboard (self-contained SVG charts, no external resources),
  and external notifications.

---

## 20. Cost & Resource Intelligence (I — S, 4.6.1)

- Resource units (all already metered): `providerCalls`, `aiCalls`, `buildTimeMs`, `retries`,
  `steps`, storage bytes (fs stat on `storage/`), artifact count.
- Derived metrics (deterministic formulas): `cost per deployed site` (unit sum / deployed),
  `build time per site`, `provider calls per deployment`, `retry per execution`,
  `budget utilization %`, `burn per hour` (unit deltas over UTC hour windows), `projected
  exhaustion` (linear extrapolation vs `maxCampaignDurationMs`).
- No monetary values anywhere; real pricing/currency is FUTURE (config schema leaves a
  `pricing` block intentionally absent).
- Consumers: budget alert rules (e.g. burn per hour above threshold), campaign reports, ops digest.

---

## 21. Dashboard & Report Artifacts (reuse of `artifacts/`)

- All reports are artifacts of types `report` / `campaign-report` (existing) plus new additive
  types: `operations-report`, `incident-digest`, `alert-digest`, `agency-health`,
  `experiment-report`, `observation-batch` (added to `ARTIFACT_TYPES` — additive list change).
- Generation: `tools/report.mjs` renders Markdown (default) and JSON views via the artifacts
  manager (path containment, checksums, existing storage).
- FUTURE (out of 4.6): self-contained HTML dashboards with inline SVG charts; interactive views.

---

## 22. Security Design

1. **Redaction at write time**: every intelligence store is written through `safeForLog` with the
   shared `SecretVault`; derived stores contain only ids and numbers. No reader path ever applies
   redaction "later".
2. **Validation at every boundary**: envelopes, metric points, observations, imports, rules,
   config — all validated by `validation/` against schemas before write. Rejected input is
   counted + audited, never partially stored.
3. **Observation import hygiene**: secret-pattern field rejection (reuse `SECRET_PATTERN`
   convention), size caps, no code execution, no URLs fetched, explicit operator invocation.
4. **Path containment**: all new paths derive from sanitized ids (`campaignId`, `executionId`,
   `businessId` via existing sanitizers; new scope ids via `sanitizeRunId`-style sanitizer);
   tests assert no `..`/absolute escapes (mirror `artifacts/tests/path-containment.mjs`).
5. **No new trust surfaces**: intelligence has no server, no sockets, no exec, no network.
   The only ingress is the in-process bus and the explicit CLI/API imports.
6. **Rule/config safety**: alert rules and intelligence config are operator-owned files,
   schema-validated; unknown metric keys are rejected; thresholds bounded; changes audited.
7. **Determinism is a security property**: reproducible outputs prevent forged/manipulated
   aggregates from being undetectable (golden files + evidence links).

---

## 23. Reliability & Recovery Design

- **Sink**: watermark resume (Section 10.4); bounded queue; drops counted and surfaced in
  `agency-health`; never blocks producers.
- **Jobs**: idempotent recompute per window; `atomicWrite` markers; crash mid-job leaves prior
  outputs intact; scheduler retries apply (existing); killswitch honored between windows.
- **Stores**: append-only raw files + atomicWrite for stateful files (`current.json`,
  `watermark.json`, job markers); daily rollover prevents unbounded files.
- **Observations/imports**: receipt-before-data (receipt written after successful append; batch
  rerun is safe due to observationId dedupe).
- **Incidents/alerts**: single-writer per process via `lock.js`; transitions append-only history.
- **Backfill**: on 4.6.0 rollout, a one-time backfill job (S) reads existing records
  (campaigns/executions/decisions/delivery) to seed metric aggregates so reports are useful
  immediately, without waiting for future events.
- **Health**: `health()` returns sink stats, watermark age, job marker age, store sizes, open
  incident/alert counts — itself a report artifact.

---

## 24. Determinism & Testability

- All jobs and report tools accept explicit `{now, window, root}` parameters; no module-level
  `Date.now()` inside computation (timestamps recorded from the injected clock).
- Bucketing: fixed windows anchored to campaign/execution timeline; daily windows are UTC-day
  aligned from the injected clock.
- Ordering: all sorts are total (value + id-hash tie-breaks) so outputs are byte-stable.
- Ids: everything derived is a hash of its inputs (`sha256-hex16`), so outputs are reproducible
  from inputs alone.
- Fixtures: `tests/helpers.mjs` provides a fixed simulated campaign (6 businesses, deterministic
  Brain verdicts — mirroring `orchestrator/tests/helpers.mjs`), fixed event stream, and fixed
  clock; golden files for every report type.
- Regression: full platform suite must remain green (51 suites today, growing with 4.6 suites).

---

## 25. Storage Design

All under `AgencyOS/storage/intelligence/` (gitignored, same convention as other modules):

```
storage/intelligence/
  events/<date>.ndjson            raw redacted envelopes (append-only)
  events/watermark.json           sink resume point
  metrics/<date>.ndjson           raw metric points
  metrics/aggregates/<windowKey>.json
  observations/<date>.ndjson
  observations/batches/<batchId>.json
  incidents/current.json          open set
  incidents/history.ndjson        transition log
  alerts/current.json             active set
  alerts/history.ndjson
  insights/<kind>/<scopeType>/<scopeId>/<windowKey>.json
  jobs/<jobId>.json               job markers
  reports/<date>/<name>.md        generated report artifacts (mirrored via artifacts manager)
```

- Retention (4.6.1 job): raw events/metrics 90 days; observations 2 years; insights/aggregates
  forever (small); incidents/alerts history 2 years; reports kept.
- All writes: `appendFileSync` (raw) or `atomicWrite` (stateful); `ensureDir` before write;
  `safeForLog` before write; fsync not required (matches platform precedent).

---

## 26. API & Schema Design

### 26.1 Facade (`intelligence/index.js`)

```
createIntelligence({ root, bus, scheduler, metrics, artifacts, validator, vault, config, logger })
  → {
      sink,                       // .start(), .stop(), .stats()
      importObservations(batch),  // S 4.6.1
      incidents: { list, ack, close, resolve },
      alerts:    { list, ack },
      insights:  { get, list, recompute(kind, window) },
      reports:   { generate(name, opts), list },
      health(), snapshot(),
      start(), stop()
    }
```

### 26.2 New schemas (10)

`metric-point`, `event-envelope`, `observation`, `observation-batch`, `incident`, `alert-rule`,
`alert-record`, `insight`, `intelligence-config`, `job-marker` — each draft-07, `additionalProperties:
true` where forward-compatible (matching orchestrator schema precedent), validated by
`validation/`.

### 26.3 Integration contract (adapter pattern)

The orchestrator integration `orchestrator/integrations/intelligence.js` (future implementation)
constructs the facade with the shared bus/scheduler/artifacts/validator/vault — the same injection
style as the existing 10 adapters. No static imports of intelligence internals elsewhere.

---

## 27. Orchestrator Integration Points

| Point | Change in 4.6 | Type |
|---|---|---|
| Event bus | none (already emits 21 events) | read |
| `scheduler/` bridge for `job_*` events | additive optional `bridge` callback | additive (hardening pass) |
| Campaign state | snapshot `policyVersion`/`strategyVersion` at start | additive |
| Pending admission queue | optional deterministic sort by `priorityHint` (4.6.1) | additive, advisory |
| Campaign-report | additive intelligence fields | additive |
| Autonomy config / limits | unchanged | none |
| Approval store / killswitch | unchanged | none |

No existing file's behavior is modified in 4.6.0 except `scheduler/engine.js` (SCH-01/SCH-02
hardening, behavior-preserving for current callers) and the additive artifacts type list.

---

## 28. Backward Compatibility

- **Additive only**: new module + new files + new schemas; existing module APIs unchanged.
- Existing consumers of `metrics/`, `artifacts/`, `scheduler/`, `orchestrator/` keep identical
  inputs/outputs (verified by the existing 51 suites staying green).
- `campaign-report` grows fields; old readers ignore unknown fields (schema is
  `additionalProperties: true`).
- Intelligence never touches existing storage paths; a malfunctioning intelligence module cannot
  corrupt orchestrator/delivery state (test-enforced).
- Scheduler hardening: same observable behavior for existing schedules (added tests cover the
  crash window and stop semantics).

---

## 29. Migration Plan

1. **4.6.0a — hardening first**: SCH-01 + SCH-02 fixes with regression tests (scheduler suites
   green).
2. **4.6.0b — module skeleton**: `intelligence/` with config + schemas + stores (no jobs yet),
   sink enabled behind config flag (`enabled: true`), verification of redaction + containment.
3. **4.6.0c — jobs & reports**: framework + funnel/reliability/durations/providers/budget/
   scheduler_stats jobs; report tooling; artifact types; incident/alert models and triggers.
4. **4.6.0d — verification**: new suites + full platform regression + demo run producing real
   reports from the simulated campaign.
5. **4.6.1 (following phase)**: observations import, compare-experiment, priority hints, cost
   efficiency, backfill, retention, digests polish.
6. **No data migration** is required — intelligence starts fresh from events/records; backfill is
   optional convenience (S).

---

## 30. Testing Strategy

| Suite | Coverage |
|---|---|
| `intelligence/tests/models.mjs` | schema validation for all 10 new schemas; metric key registry (unknown key → error); ids deterministic |
| `intelligence/tests/sink.mjs` | envelope validation, redaction (vault + secret patterns), dedupe (LRU + watermark replay), drops counted, rollover at injected day boundary |
| `intelligence/tests/jobs.mjs` | each job over a fixed fixture window produces the golden insight (byte-stable); recompute idempotent; markers on crash (simulated by deleting marker); window bounds; killswitch abort |
| `intelligence/tests/incidents.mjs` | trigger mapping, dedupe/count/evidence cap, resolve-on-clear, ack/close transitions, history append-only |
| `intelligence/tests/alerts.mjs` | rule validation, evaluation, dedupe by (rule,scope,window), cooldown, recovery |
| `intelligence/tests/observations.mjs` (4.6.1) | import happy path, rejects (schema, secrets, size), duplicate idempotency, receipts, orphan flag |
| `intelligence/tests/security.mjs` | path containment, no cross-store writes (scan storage diff after jobs), no writes to policy/strategy files, redaction at rest (grep raw stores for secret patterns) |
| `intelligence/tests/reports.mjs` | golden-file report generation (health/incidents/alerts/campaign/operations) |
| `intelligence/tests/integration.mjs` | end-to-end: simulated campaign (reuse orchestrator fixture style) → events → sink → jobs → insights → reports; assert orchestrator storage untouched |
| Regression | full platform run: 51 existing suites + new suites all green |

---

## 31. Performance & Scale

- Sink: ~µs per envelope (validate + redact + append); bounded queue; worst case drop with counter.
- Jobs: window-scoped reads with caps (`maxExecutions`, `maxRows` per job); aggregates stored
  once per window; no full-history scans in 4.6 (retention/backfill jobs are bounded passes).
- Storage growth: raw events ≈ audit-log scale (daily files); retention job bounds it.
- Concurrency: single-writer per store file; `lock.js` for cross-process safety; jobs scheduled
  serially per kind (configurable overlap guard: a job kind never runs twice concurrently).
- Determinism constraint: job duration does not affect output (window fixed by inputs).

---

## 32. Future Distributed Architecture (seams kept, not built)

- **Transport**: `communication/` already provides queues/transports/acks/TTL/heartbeat — the
  sink can later read from a message transport instead of in-process bus without changing
  envelope semantics.
- **Partitioning**: all stores partition by day/scope; jobs partition by `(kind, scope)` — a
  worker pool maps 1:1 to partitions; markers + `lock.js` leases give exactly-once recompute.
- **Single-writer rule** per partition is preserved by design; aggregation is recompute-on-read
  tolerant of lag.
- **Idempotent everything** (eventIds, window keys, insightIds, observationIds) is the
  distributed safety net — already in this design.
- Not in 4.6: actual workers, external transport, cluster config.

---

## 33. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Scope creep (36 sections of design vs. one realistic phase) | High | MUST/SHOULD/FUTURE cut at Section 5; 4.6.0 frozen to core; FUTURE explicitly listed |
| Determinism broken by wall-clock or unordered input | Medium | Injected clocks, fixed buckets, total orderings, golden tests |
| Phantom scheduler runs skew reliability data | Medium | SCH-01/SCH-02 hardening in 4.6.0 before analytics trust it |
| Redaction gap leaks credentials into new stores | Low | Write-time `safeForLog` everywhere + security test greps raw stores |
| Intelligence misclassified as decision-maker (scope creep into policy) | Medium | Hard boundary rules + tests; no API surface for verdicts/state |
| Storage growth | Medium | Retention/compaction job (4.6.1); daily rollover |
| Insight staleness if scheduler idle | Low | Event-triggered immediate jobs for campaign end; health report shows marker age |
| False alerts / alert fatigue | Medium | `minSamples`, cooldown, dedupe by window, severities |
| Import poisoning (observations) | Low | Validation, caps, secret scan, no execution, receipts, idempotency |
| Learning mechanism misused (auto-apply) | Low | No write path to policy files (test-enforced); experiments explicit + versioned |

---

## 34. Open Questions & Decisions Required

1. Retention durations (proposed: events 90 d, aggregates forever) — operator confirmation.
2. Whether `metrics/` engine gains a "series mode" or stays as-is while intelligence owns series
   (proposed: stays as-is; intelligence owns series; avoid touching a green module).
3. Brain metrics bridge: snapshot-read (default) vs additive bus bridge — confirm no preference.
4. Alert surfacing: audit + digest artifact + console is proposed; confirm no e-mail/webhook
   expectation in 4.6.
5. Backfill job: run over existing Phase 4.5 demo data at rollout (proposed: yes, demo scope).
6. New artifact type names (`operations-report`, `incident-digest`, `alert-digest`,
   `agency-health`, `experiment-report`, `observation-batch`) — confirm naming.
7. Priority hints: confirm advisory ordering is acceptable to operators (approvals unchanged).
8. Report schedule defaults (daily at 00:05 UTC vs on-demand only) — default proposed: both.

---

## 35. Open Questions carried as backlog (non-blocking)

- FUTURE: external notifiers, live outcome adapters, monetary pricing, HTML dashboard,
  distributed workers, self-adaptation — tracked as backlog, not scheduled in 4.6.

---

## 36. Implementation Plan, Production Readiness Checklist & Final Recommendation

### 36.1 Implementation plan

**Phase 4.6.0 (MUST HAVE — core intelligence)**
1. Scheduler hardening: SCH-01 (atomic persist+enqueue, replay) + SCH-02 (clear timers on
   stop/close) with crash-injection tests. *(pre-requisite)*
2. `intelligence/` skeleton: index/engine/errors, config + 10 schemas, stores (metrics, events,
   incidents, alerts, insights), sink with watermark + dedupe + redaction.
3. Job framework + jobs: funnel, reliability, durations, providers, budget, scheduler_stats.
4. Incident model + deterministic triggers; alert rule engine + evaluation job + local surfacing.
5. Report tooling: health/incident/alert/campaign/operations reports via artifacts system;
   additive artifact types.
6. Security + determinism suites; integration test (simulated campaign); full regression;
   demo run; docs (module README, phase report).

**Phase 4.6.1 (SHOULD HAVE)**
7. Observations import (schema, API, CLI, receipts, dedupe, limits).
8. Compare-experiment job + policy version snapshots + experiment reports.
9. Priority-hint ordering (advisory) + reports.
10. Cost-efficiency insights + budget alert rules; backfill job; retention job; digests polish.

**FUTURE (explicitly out)**: live adapters, external alerts, monetary cost, HTML dashboards,
distributed workers, self-adaptation.

### 36.2 Production readiness checklist (for 4.6.0 close)

- [ ] 51 existing suites + new suites all green; orchestrator 119 PASS preserved.
- [ ] Golden-file reports byte-stable across runs.
- [ ] Security tests: no cross-store writes, no policy writes, raw stores contain no secret
      patterns, path containment.
- [ ] Crash-injection tests: sink watermark resume; job marker recovery; SCH-01/SCH-02 fixed.
- [ ] Killswitch abort honored by jobs.
- [ ] Demo: full simulated campaign → events → insights → reports, artifacts readable.
- [ ] Docs: `intelligence/README.md`, phase implementation report, root README/ARCHITECTURE
      updated (additive).
- [ ] Backlog disposition recorded in phase report (SCH-01 B, SCH-02 B, PRV-01 C).

### 36.3 Final recommendation

**Proceed with Phase 4.6 as designed**: a read-mostly, event-driven **Operations Intelligence
plane** (`intelligence/`) that makes the agency observable — metrics series, operational insights,
incidents, alerts, observations, and deterministic operator reports — while touching no decision,
execution, approval, or budget semantics. First commit ships the scheduler hardening
(SCH-01/SCH-02) as the data-integrity prerequisite, then the MUST HAVE core; SHOULD HAVE items
land in 4.6.1; FUTURE items are explicitly deferred. PRV-01 is tracked separately in delivery
maintenance. No new dependencies, no servers, no auto-actions: the agency gains sight without
gaining a second brain.
