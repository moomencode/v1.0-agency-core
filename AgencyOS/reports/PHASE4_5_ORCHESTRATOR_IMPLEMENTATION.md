# Phase 4.5 Implementation Report — Autonomous Agency Workflow Orchestrator

> `AgencyOS/orchestrator/` — coordinates the full agency loop
> (discover → qualify → brain decision → dossier → pipeline → website → QA →
> approval → deploy → verify → report) as campaigns of executions with a
> persistent state machine, human-in-the-loop approvals, autonomy levels,
> killswitch, crash recovery, budget limits and full observability.
> API version 1.0.

## 1. Architecture Report

The orchestrator is the coordination layer that closes the loop built in
Phases 4.0–4.4:

```
Discovery (4.0) → Brain (4.0.5) → Dossier (4.1) → Pipeline (4.2)
  → Website Engine (4.3) → Delivery (4.4) → Local/Mock/Vercel → Report
```

It never scores, never invents policy, and never overrides a Brain verdict —
it routes work through the existing engines, gates every sensitive
transition, and persists everything to `storage/orchestrator-engine/`.

### 1.1 Module Inventory

| Path | Responsibility |
|---|---|
| `index.js` | `OrchestratorSystem` facade: `boot` `startCampaign` `runCampaign` `pauseCampaign` `stopCampaign` `resumeCampaign` `approve` `deny` `requestQaOverride` `retryExecution` `rollback` `status` `history` `pendingApprovals` `getTrace` `registerProvider` `attachScheduler` `on/off/emit/close`; exports `ORCHESTRATOR_API_VERSION`, `ORC_EVENTS`, `ORC_CODES`, `AUTONOMY_LEVELS`, `AUTONOMY_CONFIG`, `ORC_STATES`, `ORC_CAMPAIGN_STATES`, `TERMINAL_STATES`, `RETRYABLE_STATES`, `STEP_IDS`, `FAILURE_CLASSES` |
| `utils.js` | deterministic ids `campaignIdFor`/`executionIdFor`/`approvalIdFor`, `sanitizeRunId`, atomicWrite, instance/campaign/approval/trace/report file helpers |
| `errors.js` | `ORC_CODES` + `orcError`, failure classification classes |
| `state/machine.js` | 20 execution + 8 campaign states, legal/illegal transition tables |
| `workflow/engine.js` | `StepEngine` — step runner with per-step retry, budget hooks, killswitch check |
| `workflow/steps.js` | `WORKFLOW_VERSION`, 13 `STEP_IDS`, step definitions (discover → report) |
| `policy/gate.js` | `PolicyGate` — autonomy L0–L5, auto steps vs human approval kinds |
| `approval/store.js` | `ApprovalStore` — immutable, disk-persisted approval records (6 kinds) |
| `limits/budget.js` | 7 limit kinds + counters + reached set |
| `recovery/resume.js` | `RecoveryManager.boot()` — stale locks, resumable campaign scan |
| `campaign/index.js` | `CampaignManager` — lifecycle, queue, pool, approvals, retry, rollback, limits |
| `campaign/queue.js` | `CandidateQueue` — deterministic ordering, maxBusinesses |
| `concurrency/pool.js` | `BoundedPool` — maxConcurrent capped by hardCap |
| `concurrency/lock.js` | `LockManager` — per-business lock files, stale-lock TTL break, `lockIdFor` rejects traversal |
| `execution/checkpoint.js` | `CheckpointStore` — instance state files (atomicWrite) |
| `execution/trace.js` | `TraceCollector` — redacted NDJSON + assembled trace + execution report |
| `observability/audit.js` | `AuditLog` — redacted daily NDJSON (`logs/orchestrator/`) |
| `observability/events.js` | `OrchestratorEvents` + `ORC_EVENTS` (shared bus bridge) |
| `safety/killswitch.js` | `EMERGENCY_STOP` file + `ORC_EMERGENCY_STOP` env |
| `integrations/` | adapters: discovery, brain, dossier, pipeline, website, delivery, memory, artifacts, scheduler, validation |
| `schemas/` | 10 JSON schemas (campaign, approval, checkpoint, limits, execution-trace, execution-report, campaign-report, workflow-instance, autonomy-config, orchestration-error) |
| `tests/` | 18 offline suites + `helpers.mjs` fixture stack (6-business simulated market) |
| `demo/` | offline end-to-end demo (6 businesses, L4, local deploys, crash recovery, emergency stop) |

### 1.2 Identity & Determinism

- `campaignId = cmp-<hex>` — hash of the canonical spec; the same spec always
  maps to the same campaign (resumable by construction).
- `executionId = orc-<hex>` — hash of (campaignId | businessId |
  workflowVersion); raw business ids never reach the filesystem.
- `approvalId = apr-<hex>` — hash of (executionId | kind | step); one
  decision per record, immutable once decided.
- No timestamps or randomness in identities.

### 1.3 Execution Flow (13 steps)

`discover` → `qualify` → `evaluate` (Brain verdict) → `build-dossier` →
`generate-config` → `render-site` → `run-qa` (incl. secret scan) →
`request-delivery` (approval gate) → `deploy` → `verify` → `persist` →
`report`. StepEngine advances the execution state machine step by step;
retryable steps respect the budget (`maxRetries`, `maxExecutionDurationMs`).

### 1.4 State Machines

Execution (20): `CREATED QUALIFIED EVALUATED DOSSIER_READY GENERATING
SITE_RENDERING QA_RUNNING READY_FOR_DELIVERY AWAITING_APPROVAL DELIVERING
DEPLOYING VERIFYING DEPLOYED ESCALATED REJECTED QA_FAILED FAILED RETRYING
ROLLED_BACK ARCHIVED`. Recovery states (`ESCALATED AWAITING_APPROVAL
QA_FAILED FAILED`) persist across restarts.

Campaign (8): `DRAFT QUEUED RUNNING PAUSED STOPPED LIMITS_REACHED COMPLETED`
(+ QUEUED/RUNNING transitions with explicit legal-transition tables).
Campaigns with waiting executions stay RUNNING by design — the orchestrator
waits for humans.

### 1.5 Autonomy & Approvals

| Level | Auto steps | Human approvals |
|---|---|---|
| L0–L3 | increasing step autonomy | all sensitive kinds |
| L4 | all 13 steps | DEPLOY, ESCALATE, QA_OVERRIDE, SENSITIVE, POLICY_VIOLATION |
| L5 | + auto-approve DEPLOY | every auto-grant written to the immutable ledger |

Approval records are written atomically, can never be re-decided, and
survive restarts (`storage/orchestrator-engine/approvals/`).

### 1.6 Safety & Recovery

- **Killswitch** — `EMERGENCY_STOP` file (or env) halts execution between
  steps; executions record outcome `STOPPED`, campaigns transition to
  STOPPED; clearing the switch + `runCampaign(force)` recovers.
- **RecoveryManager.boot()** — breaks stale locks (TTL), scans persisted
  campaigns, resumes resumable executions through checkpoints; pending
  approvals survive restarts.
- **Budget limits** — businesses, deployments, AI calls, provider calls,
  retries, steps, execution/campaign wall-clock durations; reached limits →
  campaign LIMITS_REACHED with the reached set recorded.
- **Failure isolation** — one business failing never sinks the campaign;
  per-business locks serialize state transitions.

### 1.7 Security Model (SEC-01 — fixed this phase)

The read-only audit (4.5.9) confirmed a P2 traversal defect: caller-supplied
`runId` flowed raw into `path.join` at runtime/pipeline filesystem
boundaries. Fixed with a single shared sanitizer plus boundary validation:

- `runtime/utils.js` — new `sanitizeRunId`: strips path separators and
  control chars, collapses `..` runs, strips leading dots, caps at 96 chars;
  hostile ids (`..\..\x`, `/etc/passwd`, `%2e%2e%2f`, bare `.`/`..`) collapse
  to a benign segment.
- `runtime/contextManager.js` — `create()` discards any runId that does not
  survive sanitization unchanged and generates a fresh id; `_runDir()` (used
  by `_contextFile`, `persist`, `writeSummary`, `load`) sanitizes again.
- `runtime/logger.js` (sink file), `runtime/workflowRunner.js` (`_runBus`,
  `_writeArtifacts`), `runtime/agentRunner.js` (command input file),
  `pipeline/runner.js` (`_safeRunId` + checkpoint dirs) — all joins now go
  through `sanitizeRunId` (pipeline previously allowed `..`).
- Orchestrator ids are hashed, so hostile businessIds cannot influence paths;
  `LockManager.lockIdFor` rejects traversal.
- Secret hygiene verified: `safeForLog` redacts scan-pattern matches and
  vault-known values in traces/audits/reports; the final QA secret scan
  blocks credential-bearing content from ever reaching deployment.

### 1.8 Known Non-Blocking Findings (documented, deferred to backlog)

- **SCH-01** — scheduler `engine.js:216-250` persists `lastRunAt`/`runNumber`
  before enqueueing on the in-memory queue; a crash between the two drops the
  run. Fix: persist after enqueue or make the queue durable.
- **SCH-02** — the retry timer (`engine.js:314`) is not cleared by
  `stop()`/`close()`; it can fire post-stop and, if a resolver existed, keeps
  the process alive. Fix: track and clear timers on stop.
- **PRV-01** — `delivery/providers/vercel/index.js` exports a dead
  `default`, and unknown `readyState` maps to `BUILDING`, burning the full
  120s verify window with a misleading `PROVIDER_ERROR`. Fix: export the
  factory; map unknown states to a failed/errored state.
- Backlog notes: stale `FAILED` outcome after `retryExecution`
  (campaign/index.js:766) — benign because status is authoritative;
  `safeForLog` returns a JSON string (double-encoded NDJSON) with no
  in-product consumer — leave for a future formatter; F4 rollback
  `.catch(() => {})` (campaign/index.js:696) is deliberate best-effort.

## 2. Verification

```
orchestrator/tests/unit.mjs              13 PASS  ids, spec canonicalization, sanitizeRunId, utils
orchestrator/tests/state-machine.mjs     12 PASS  legal/illegal transitions, terminal sets
orchestrator/tests/approval.mjs           9 PASS  immutable ledger, kinds, evidence, purge
orchestrator/tests/policy.mjs            10 PASS  autonomy L0–L5 gate behavior
orchestrator/tests/accounting.mjs         7 PASS  budget counters, reached limits
orchestrator/tests/limits.mjs            10 PASS  per-limit enforcement incl. wall-clock
orchestrator/tests/resume.mjs             4 PASS  stale locks, resumable scan, re-dispatch
orchestrator/tests/smoke.mjs              1 PASS  full L4 campaign: 3 APPROVE / 2 REJECT /
                                                    1 ESCALATE, 4 local deploys, artifacts, memory
orchestrator/tests/concurrency.mjs       11 PASS  bounded pool, per-business isolation, locks
orchestrator/tests/failure-isolation.mjs  3 PASS  one failure never sinks the campaign
orchestrator/tests/idempotency.mjs        6 PASS  duplicate starts/runs/approvals are safe
orchestrator/tests/security.mjs          13 PASS  SEC-01 traversal table, runtime + pipeline
                                                    containment, hostile businessId campaign,
                                                    secret-scan QA block, vault redaction
orchestrator/tests/regression-454.mjs     8 PASS
orchestrator/tests/regression-456.mjs     1 PASS
orchestrator/tests/regression-457.mjs     3 PASS
orchestrator/tests/regression-458.mjs     5 PASS
orchestrator/tests/chain1-integrity.mjs   2 PASS  orchestrator ↔ delivery chain (deploy/rollback)
orchestrator/tests/stress.mjs             1 PASS  concurrent campaigns under load
```

**Orchestrator total: 119 PASS, 0 FAIL — all offline.** Full platform
regression across phases 3.0–4.5 (16 module smokes + 18 orchestrator suites +
demo): all green.

## 3. Demo

```
node AgencyOS/orchestrator/demo/demo.mjs
```

Six-business simulated Cairo market at autonomy L4, zero network: brain
routing (3 APPROVE / 2 REJECT / 1 ESCALATE with verdicts from the real
Brain), human approvals, 4 local deploys with production tree verification,
orchestrator-restart crash recovery (pending approval survives), emergency
stop via killswitch + recovery, budget counters, traces and audit tail.
