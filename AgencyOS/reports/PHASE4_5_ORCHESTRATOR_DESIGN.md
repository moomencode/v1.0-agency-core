# Phase 4.5 Design — Autonomous Agency Workflow / End-to-End Orchestrator

> `AgencyOS/orchestrator/` (proposed) — the coordination layer that composes
> the existing Phase 4 engines (Discovery 4.0, Brain 4.0.5, Dossier 4.1,
> Pipeline 4.2, Website Engine 4.3, Delivery 4.4) and the platform services
> (Scheduler, Memory, Artifacts, Validation, Runtime) into one traceable,
> resumable, campaign-driven workflow.
>
> Status: **design only — no implementation yet.** Baseline: `b9c17b4`
> (`v1.5.0-delivery`), 97 delivery tests, 20/20 platform modules, clean tree.

---

## 1. Executive Summary

AgencyOS today is a set of powerful, individually verified engines. What is
missing is the **glue**: nothing connects "a scheduled market discovery" to
"a deployed website with a QA report, an execution trace, and campaign
metrics". Phase 4.5 builds exactly that glue and nothing else.

The orchestrator is a **coordinator, not a new engine**:

- Every step calls an existing module's public API (`DiscoverySystem.run`,
  `Brain.runBusiness`, `DossierEngine.build`, `PipelineRunner.run`,
  `createWebsiteEngine().build/validate/export`, `createDeliverySystem`
  `deliver/approve/rollback`, `MemorySystem.put`, `ArtifactSystem.create`).
- The **Brain remains the only decision/policy engine**. The orchestrator
  never re-implements business verdicts, policies, or estimates; it only
  *routes* on the Brain's verdict (APPROVE → proceed, REJECT → archive,
  ESCALATE → human checkpoint, PARK → hold).
- The orchestrator adds: a durable per-execution state machine, checkpoints
  for crash recovery, campaign-level queueing/limits/metrics, explicit and
  immutable human approvals, autonomy levels as *policy*, resource budgets,
  a global kill switch, and full execution traces.

The result: one call (`agency.website-acquisition`) can take a market spec to
deployed websites — or any intermediate point, per campaign autonomy level —
while every decision, approval, error, retry, and artifact remains
reconstructible from disk.

## 2. Objectives

1. **Compose, don't duplicate** — zero re-implementations of the 9 listed
   engines; orchestrator steps are thin adapters with validation.
2. **One traceable lifecycle** — a single execution record carries
   `executionId → businessId → dossierVersion → pipelineRunId → buildId →
   deliveryRecordId → artifacts → outcome`.
3. **Durable and resumable** — a workflow survives process crash, restart,
   and partial failure, resuming from its last checkpoint without redoing
   completed stages.
4. **Idempotent by construction** — deterministic identities and content
   fingerprints mean re-running a campaign never duplicates businesses,
   dossiers, deployments, memory entries, or artifacts.
5. **Human-in-the-loop by design** — every sensitive transition (escalation,
   deployment, QA override, policy violation, manual step) requires an
   explicit, auditable, immutable approval; there is no silent approval.
6. **Autonomy as configuration** — autonomy level (L0–L5) is a per-campaign
   policy, switchable without code changes, and never bypasses security,
   QA, or approval gates.
7. **Safe concurrency** — multiple businesses process independently in one
   campaign; one failure never aborts the campaign; shared state is never
   corrupted (per-business locks, bounded pools, persisted budgets).
8. **Observable** — execution traces, `orchestrator.*` events, redacted
   audit log, campaign metrics, and artifact linkage for every run.
9. **Regression-proof** — the complete existing suite (97 delivery +
   20/20 modules + 1029 assertions) stays green; the new module is additive.

## 3. Architecture

### 3.1 Layered view

```
┌───────────────────────────────────────────────────────────────────┐
│  Campaign layer  — spec, autonomy level, limits, queue, metrics   │
├───────────────────────────────────────────────────────────────────┤
│  Workflow layer  — step engine, state machine, checkpoints, trace │
├───────────────────────────────────────────────────────────────────┤
│  Gate layer      — approvals, policy gate, limits, kill switch    │
├───────────────────────────────────────────────────────────────────┤
│  Integration layer — thin adapters over existing module facades   │
├───────────────────────────────────────────────────────────────────┤
│  Existing engines (DISCOVERY BRAIN DOSSIER PIPELINE WEBSITE       │
│  DELIVERY) + platform (SCHEDULER MEMORY ARTIFACTS VALIDATION      │
│  RUNTIME) — unmodified                                             │
└───────────────────────────────────────────────────────────────────┘
```

### 3.2 Module inventory (proposed `AgencyOS/orchestrator/`)

| File | Responsibility |
|---|---|
| `index.js` | `OrchestratorSystem` facade: `startCampaign` `resumeCampaign` `pauseCampaign` `stopCampaign` `status` `history` `approve` `deny` `retryExecution` `rollback` `getExecution` `getTrace`; `registerProvider` passthrough; re-exports `ORCHESTRATOR_API_VERSION`, `ORC_EVENTS`, `AUTONOMY_LEVELS`, `ORC_STATES`, `ORC_CODES` |
| `errors.js` | `ORC_CODES` (BUSINESS_FAILURE, POLICY_FAILURE, VALIDATION_FAILURE, TRANSIENT_FAILURE, SYSTEM_FAILURE + state/limit/approval/security subcodes) + `orcError` |
| `utils.js` | `campaignIdFor`, `executionIdFor`, `approvalIdFor`, `instanceRoot`, `fingerprint`, reuse of `sha256`/`stableStringify` conventions |
| `workflow/engine.js` | step registry + step runner (calls integration adapters), per-step validation, event emission |
| `workflow/steps.js` | the 13 step definitions (discover, qualify, evaluate, build-dossier, generate-config, render-site, run-qa, package, request-delivery, deploy, verify, persist, report) |
| `campaign/index.js` | `CampaignManager`: register/start/pause/stop, per-business planning, queue, metrics aggregation |
| `campaign/queue.js` | per-campaign FIFO + priority queue of business executions |
| `state/machine.js` | `ORC_STATES`, transitions, retryable/terminal/recovery sets, `applyOrcTransition` (throws on illegal moves) |
| `execution/checkpoint.js` | per-instance checkpoint store (atomicWrite JSON) |
| `execution/trace.js` | append-only trace events → final `trace.json` + `execution-report.json` |
| `approval/index.js` | `ApprovalStore`: `request` `decide` (granted/denied), immutable records, `pending`, `byExecution` |
| `policy/gate.js` | autonomy-level policy resolution + campaign rules → approval kinds; **never business verdicts** |
| `concurrency/pool.js` | bounded execution pool (per campaign limit, hard cap) |
| `concurrency/lock.js` | per-business lock (single active instance per business) |
| `recovery/resume.js` | boot scan of non-terminal instances + resume, stale-lock cleanup |
| `limits/budget.js` | persisted budget counters + enforcement (maxBusinesses, maxDeployments, maxAiCalls, maxProviderCalls, duration) |
| `observability/events.js` | `ORC_EVENTS` map |
| `observability/audit.js` | redacted NDJSON audit to `logs/orchestrator/<date>.ndjson` (reuses `safeForLog` semantics) |
| `integrations/` | `discovery.js` `brain.js` `dossier.js` `pipeline.js` `website.js` `delivery.js` `memory.js` `artifacts.js` `scheduler.js` — thin adapters (see §11–§17) |
| `schemas/` | campaign, workflow-instance, execution-trace, checkpoint, approval, autonomy-config, limits, orchestration-error, execution-report (see §26) |
| `tests/` | suites listed in §27 |
| `demo/` | deterministic 6-business campaign demo (§28) |

### 3.3 Storage (follows existing conventions)

```
storage/orchestrator-engine/
  campaigns/<campaignId>.json              # spec, state, budgets, metrics
  instances/<executionId>/
    checkpoint.json                        # last valid checkpoint (atomicWrite)
    trace.ndjson                           # append-only trace events
    trace.json                             # assembled final trace
    execution-report.json                  # report artifact payload
  approvals/<approvalId>.json              # immutable approval records
  EMERGENCY_STOP                           # kill-switch file (presence = stop)
logs/orchestrator/<YYYY-MM-DD>.ndjson      # redacted audit
```

### 3.4 Non-goals

- No new discovery/brain/dossier/pipeline/website/delivery/scheduler/memory/
  artifacts/validation implementation.
- No second policy or decision engine — the Brain's verdicts are
  authoritative and stored as decision artifacts.
- No provider code paths beyond `delivery/` (providers stay inside delivery).
- No modifications to existing modules at design stage; at implementation
  time only additive changes are allowed (e.g., new artifact types in
  `artifacts/formats.js` `ARTIFACT_TYPES`, README/ARCHITECTURE updates).

## 4. End-to-End Data Flow

```
Scheduler job ──► campaign spec {market, category, maxBusinesses, minOpportunityScore, autonomyLevel, ...}
   │
   ▼ DISCOVERING
DiscoverySystem.run(query) ──► candidate records (id, name, category, scores, weaknesses, probe)
   │                            → persisted per-business JSON (discovery owns it)
   ▼ QUALIFYING
filter + rank: minOpportunityScore, website status (no website / weak), priority tier
   ▼ EVALUATING
Brain.runBusiness(record) ──► decision {verdict APPROVE|REJECT|ESCALATE|PARK, confidence, risk, estimates, decisionId}
   │                            → stored as decision artifact + trace entry (authoritative)
   ├── APPROVE  ──────────► continue (policy gate: autonomy level applies)
   ├── REJECT   ──────────► ARCHIVED (terminal)
   ├── ESCALATE ──────────► approval checkpoint kind=ESCALATE → AWAITING_HUMAN (resumes on approve/deny)
   └── PARK     ──────────► held (requeue after backoff or human review)
   ▼ APPROVED → DOSSIER_BUILDING
DossierEngine.build(record, {requireApproved:true, persist:true}) ──► dossierVersion (v<N>), 20 docs + 5 reports
   ▼ CONFIG_GENERATING
PipelineRunner.run(dossier, {runId, resume:true}) ──► 19-file config bundle + manifest + structuredData
   ▼ SITE_RENDERING
WebsiteEngine.build(configs, {manifest, structuredData}) ──► site model
   ▼ QA_RUNNING
WebsiteEngine.validate(site) + DeliverySystem.qa.run({buildId, ...}) ──► final QA report (secret scan incl.)
   │   └─ QA_FAILED → recovery: re-render (fixable) or QA override approval (human)
   ▼ READY_FOR_DELIVERY → AWAITING_APPROVAL (per autonomy level; L5 may auto-approve within policy)
DeliverySystem.deliver({buildId, mode, provider, target}) ──► record dep_<buildId>
   ▼ DEPLOYING
DeliverySystem.approve(recordId, {by}) ──► provider.deploy → verify READY → recorded (delivery gates enforced internally)
   ▼ VERIFYING (delivery verify + orchestrator check)
   ▼ DEPLOYED → ROLLED_BACK (on operator rollback via DeliverySystem.rollback)
   ▼ PERSISTING
MemorySystem.put (business facts, deployment facts, orchestration facts)   [content-fingerprint deduped]
ArtifactSystem.create (dossier reports, QA report, deployment report, execution report, campaign report)
   ▼ REPORTING
execution-report.json + campaign metrics + orchestrator.deployed event
```

Output IDs produced along the way (all deterministic except nothing — see §18):

| Stage | Identity |
|---|---|
| campaign | `cmp-<sha256(spec)[0:16]>` |
| execution | `orc-<sha256(campaignId\|businessId\|workflowVersion)[0:16]>` |
| approval | `apr-<sha256(executionId\|kind\|step)[0:16]>` |
| dossier version | `v<N>` (existing convention) |
| pipeline run | `run-<businessId>-website-production` (existing convention) |
| build / engine run | `buildId = sha256(businessId\|dossierVersion\|pipelineRunId\|engineOutputChecksum)[0:16]` |
| delivery record | `dep_<buildId>` |
| artifact | deterministic `name` + key `projectId::workflowId::type::name`, deduped by checksum |

## 5. State Machine

### 5.1 States (`ORC_STATES`)

Per-execution states:

`CREATED, DISCOVERING, QUALIFYING, EVALUATING, ESCALATED, APPROVED,
DOSSIER_BUILDING, CONFIG_GENERATING, SITE_RENDERING, QA_RUNNING, QA_FAILED,
READY_FOR_DELIVERY, AWAITING_APPROVAL, DEPLOYING, VERIFYING, DEPLOYED,
ROLLED_BACK, REJECTED, FAILED, ARCHIVED`

Campaign-level states: `DRAFT, QUEUED, RUNNING, PAUSED, DRAINING, COMPLETED,
STOPPED, LIMITS_REACHED`.

### 5.2 Transition table (events)

| From | Event | To |
|---|---|---|
| CREATED | START | DISCOVERING |
| DISCOVERING | RETRY | DISCOVERING |
| DISCOVERING | DISCOVERED | QUALIFYING |
| QUALIFYING | QUALIFIED | EVALUATING |
| EVALUATING | DECIDED_APPROVE | APPROVED |
| EVALUATING | DECIDED_REJECT | REJECTED |
| EVALUATING | DECIDED_ESCALATE | ESCALATED |
| EVALUATING | DECIDED_PARK | ARCHIVED (hold; requeue re-creates) |
| ESCALATED | APPROVAL_GRANTED | APPROVED |
| ESCALATED | APPROVAL_DENIED | REJECTED |
| APPROVED | DOSSIER_READY | DOSSIER_BUILDING* |
| DOSSIER_BUILDING | RETRY | DOSSIER_BUILDING |
| DOSSIER_BUILDING | CONFIG_START | CONFIG_GENERATING |
| CONFIG_GENERATING | RETRY | CONFIG_GENERATING |
| CONFIG_GENERATING | SITE_START | SITE_RENDERING |
| SITE_RENDERING | RETRY | SITE_RENDERING |
| SITE_RENDERING | QA_START | QA_RUNNING |
| QA_RUNNING | QA_PASSED | READY_FOR_DELIVERY |
| QA_RUNNING | QA_FAILED | QA_FAILED |
| QA_RUNNING | RETRY | QA_RUNNING |
| QA_FAILED | QA_OVERRIDDEN | READY_FOR_DELIVERY |
| QA_FAILED | REJECTED | REJECTED |
| QA_FAILED | RETRY (re-render) | SITE_RENDERING |
| READY_FOR_DELIVERY | DELIVERY_REQUESTED | AWAITING_APPROVAL (L4) / DEPLOYING (L5 auto) |
| AWAITING_APPROVAL | APPROVAL_GRANTED | DEPLOYING |
| AWAITING_APPROVAL | APPROVAL_DENIED | REJECTED |
| DEPLOYING | RETRY | DEPLOYING |
| DEPLOYING | DEPLOYED | VERIFYING |
| VERIFYING | VERIFIED | DEPLOYED |
| VERIFYING | FAIL | FAILED |
| DEPLOYED | ROLLBACK_REQUESTED | ROLLED_BACK |
| any non-terminal | FAIL | FAILED |
| REJECTED / FAILED / DEPLOYED / ROLLED_BACK | ARCHIVE | ARCHIVED |

\* `APPROVED → DOSSIER_BUILDING` is labelled by event `DOSSIER_START`; the
table uses event names as the transition key (same mechanism as
`delivery/deployment/state.js`).

### 5.3 Properties

- **Invalid transitions** — anything not in the table throws
  `ORC_STATE_INVALID` (mirrors `applyTransition` in delivery).
- **Retryable states** — where a `TRANSIENT_FAILURE` may re-enter the same
  state with a bounded attempt counter: DISCOVERING, DOSSIER_BUILDING,
  CONFIG_GENERATING, SITE_RENDERING, QA_RUNNING, DEPLOYING, VERIFYING.
- **Terminal states** — `REJECTED, FAILED, ARCHIVED, DEPLOYED, ROLLED_BACK`
  (per execution). `ROLLED_BACK` keeps the record available for future
  revert, matching delivery semantics.
- **Recovery states** — `QA_FAILED` (re-render or override), `FAILED` with
  `error.class === 'TRANSIENT'|'SYSTEM'` (resumable on next boot or manual
  retry), `ESCALATED`/`AWAITING_APPROVAL` (resume on human decision).

## 6. Workflow Model

- **Workflow version**: a constant `WORKFLOW_VERSION` in
  `workflow/steps.js` (v1 at launch). `executionId` includes the version, so
  a version bump starts new executions instead of resuming incompatible ones.
- **Step engine**: each step is `{ id, run(ctx), validateOut(ctx), attempts }`.
  Steps are sequential per execution; checkpoints are written after every
  step (`execution/checkpoint.js`, `atomicWrite`).
- **Step outputs** are stored in the checkpoint: `dossierVersion`,
  `pipelineRunId`, `buildId`, `qaReportId`, `deliveryRecordId`,
  `artifactIds[]`, plus per-step `ok: true`.
- **Idempotent re-run**: every step must be safely re-runnable (same input →
  same output, or detect the already-existing output and reuse it — §18).
- **Module instances**: created once per `OrchestratorSystem` root and shared
  (DiscoverySystem, Brain, DossierEngine, PipelineRunner, WebsiteEngine,
  DeliverySystem, MemorySystem, ArtifactSystem, SchedulerSystem). No
  per-execution engine construction.

## 7. Campaign Model

```jsonc
{
  "schema": "https://agency.os/orchestrator/campaign",
  "id": "cmp-<hex16>",
  "name": "cairo-cafe-wave-2026-08",
  "discovery": { "market": "Cairo", "category": "cafe", "query": { "area": "Cairo" } },
  "filters": { "minOpportunityScore": 70, "maxBusinesses": 20, "requireNoWebsiteOrWeak": true },
  "autonomyLevel": 3,
  "deployment": { "provider": "local", "target": { "project": "agency-cairo" },
                  "mode": "explicit", "allowedProviders": ["local", "mock"] },
  "limits": { "maxConcurrent": 3, "maxRetries": 3, "maxDeployments": 20,
              "maxAiCalls": 100, "maxProviderCalls": 200,
              "maxExecutionDurationMs": 1800000, "maxCampaignDurationMs": 86400000 },
  "approvals": { "requireDeploymentApproval": true, "requireEscalationApproval": true,
                 "autoApproveQaOverrides": false },
  "workflowVersion": 1,
  "createdAt": "…"            // timestamps only in observational fields, never in ids
}
```

Campaign lifecycle: `DRAFT → QUEUED → RUNNING → (PAUSED|DRAINING) → COMPLETED |
STOPPED | LIMITS_REACHED`. Produces:

- discovered / approved / rejected / escalated / generated / deployed /
  failed counts
- per-execution outcomes + trace links
- budget ledger (limits consumed)
- `campaign-report` artifact (aggregate + links)

`CampaignManager.startCampaign(spec)`:
1. validate + fingerprint → `campaignId` (existing campaign with same id and
   `state !== RUNNING` is resumed, not duplicated);
2. run discovery once (campaign-level step), rank candidates;
3. enqueue one execution per candidate (up to `maxBusinesses`);
4. feed executions to the pool under campaign `limits`.

## 8. Autonomy Levels

Autonomy is **policy data** on the campaign, not code. `policy/gate.js`
resolves each level to (a) which steps run automatically and (b) which
approval kinds are required.

| Level | Name | Automated | Human required |
|---|---|---|---|
| L0 | MANUAL | nothing | every step (`MANUAL_STEP` approval per step) |
| L1 | DISCOVERY | discovery + ranking | everything downstream per business |
| L2 | QUALIFICATION | + brain evaluation, dossier | config generation onward |
| L3 | GENERATION | + pipeline, website, QA | delivery (deploy approval) |
| L4 | DEPLOYMENT_APPROVAL | + delivery request, staging | deployment approval (default) |
| L5 | FULLY_AUTONOMOUS | + deployment (auto-approve within policy) | escalation, QA override, policy violations — **never auto** |

Invariants at every level:

- Brain verdict routing never changes; ESCALATE always requires a human
  (`ESCALATE` approval kind) even at L5.
- QA must pass, or a human `QA_OVERRIDE` approval must exist.
- Deployment at L5 still passes through the delivery approval mechanism —
  the auto-approval is a **formal, recorded approval record** created by the
  autonomy policy actor, never a silent side-effect.
- `DELIVERY_AUTO_ALLOWED` / provider whitelist / kill switch remain in force.
- Raising the level never removes existing approvals from history; it only
  changes how future approvals are requested.

## 9. Human Approval Model

`approval/index.js` — an **ApprovalStore** of immutable records:

```jsonc
{
  "schema": "https://agency.os/orchestrator/approval",
  "id": "apr-<hex16>",                     // deterministic per (executionId, kind, step)
  "executionId": "orc-…",
  "campaignId": "cmp-…",
  "kind": "ESCALATE | DEPLOY | QA_OVERRIDE | SENSITIVE | POLICY_VIOLATION | MANUAL_STEP",
  "requestedBy": "workflow",
  "requestedAt": "…",
  "evidence": { "decisionId": "…", "recordId": "dep_…", "qaReportId": "…" },
  "decision": { "granted": true, "decidedBy": "operator:alice", "decidedAt": "…",
                "reason": "…" },
  "terminal": true
}
```

Rules:

- **Explicit** — an execution may only leave `ESCALATED` / `AWAITING_APPROVAL`
  via a stored approval record. `OrchestratorSystem.approve/deny` are the only
  doors; no internal auto-grant except the L5 policy actor which still writes
  a record.
- **Auditable** — approvals link to their evidence (decision id, deployment
  record id, QA report id) and are mirrored in the trace and audit log.
- **Immutable** — records are written once with `atomicWrite` and never
  mutated (a denied request is terminal; re-request = new `approvalId`).
- Checkpoints: `ESCALATE` (brain), `DEPLOY` (deployment approval),
  `QA_OVERRIDE`, `POLICY_VIOLATION` (limits/policy guard hit that a human may
  override), `SENSITIVE` (provider/target changes, rollback), `MANUAL_STEP`
  (L0–L2).

## 10. Scheduler Integration

Reuses `SchedulerSystem` as-is (no rebuild). The orchestrator registers
handler jobs and uses scheduler-native retry, priority, pause/resume:

| Scheduler feature | Orchestrator usage |
|---|---|
| `registerHandler(name, fn)` | `orchestrator.campaign` (start/resume), `orchestrator.execution` (per-business retry) |
| `registerJob(spec)` | one-time `{ schedule: { at } }` or manual `trigger(id, input)`; recurring `{ schedule: { cron|intervalMs } }` |
| `priority` | campaign priority (default 5, delivery's `deployment-*` jobs at 8 stay) |
| `maxAttempts/retryDelayMs/backoff` | transient retries at the job level (job-level guard only; step-level retry policy is §21) |
| `pause/resume` | campaign pause/resume |
| `removeJob` / `trigger` | campaign cancellation / manual re-trigger |
| `updateJob` | live campaign limit/priority changes |

Spec shape (matches `scheduler/engine.js`):

```js
{
  id: `campaign-${campaignId}`,
  name: `campaign:${campaignId}`,
  handler: 'orchestrator.campaign',
  input: { campaignId, action: 'start' | 'resume' },
  schedule: { at } | { cron } | { intervalMs },
  priority: 5, maxAttempts: 3, retryDelayMs: 200, backoff: 'exponential',
  timeoutMs: 60000, enabled: true
}
```

Delivery's existing `DeliveryScheduler.attach()` keeps its `delivery.deploy`
handler; the orchestrator may schedule deployments through it or call
`deliver/approve` directly per autonomy level — both paths compose.

## 11. Brain Integration

- One shared `Brain` instance (created with the runtime executor, as
  `dossier/` already does).
- Decision step: `brain.runBusiness(record)` → store `result.decision`
  (verdict, confidence, risk, estimates, `decisionId`), `result.policy`,
  `result.trace` as **decision artifacts** (`decision-record` type) and trace
  entries. These are authoritative — the orchestrator does not re-score.
- Routing only: `APPROVE → APPROVED`; `REJECT → REJECTED`; `ESCALATE →
  ESCALATED` (approval checkpoint); `PARK → ARCHIVED` (held).
- `brain.summarize(result)` feeds the memory facts.
- The orchestrator registers its own actions via `brain.registerExecutor`
  (e.g., `website.generate`, `delivery.deploy` already exist from Phase 4.4)
  so the brain's plan executor can trigger orchestrator work — but the
  orchestrator's own workflow engine is the execution driver; the brain's
  `execution-plans` is **not** reused as the step engine (it lacks
  campaign queueing, budgets, and cross-business recovery), only as the
  decision/plan artifact source.
- Explicitly: `policy/gate.js` evaluates only *autonomy + campaign policy*
  (which approvals are needed); business verdicts come exclusively from the
  Brain's policy engine.

## 12. Dossier Integration

- Adapter: `DossierEngine.build(record, { version, update, policies,
  persist: true, requireApproved: true })` — `requireApproved` re-checks the
  brain verdict inside the dossier engine, preserving the existing gate.
- Idempotency: before building, `dossier.latestVersion(businessId)` + content
  fingerprint of the input. If a dossier for this business already exists at
  the same input fingerprint → reuse `dossierVersion` (load), no new version.
  If input changed → `version = latest + 1` (existing versioning).
- Output recorded in checkpoint: `dossierVersion`.

## 13. Pipeline Integration

- Adapter: `PipelineRunner.run(dossier, { runId: <deterministic>, resume: true,
  businessId })` — the pipeline's own per-stage checkpoints provide
  resume across crashes **inside** this stage.
- `runId` is deterministic (`run-<businessId>-website-production`), so a
  resumed pipeline produces the identical bundle (pipeline is deterministic —
  seeded RNG + stable JSON, verified by checksum in its smoke suite).
- Outputs: `ctx.configs` (19 files), `ctx.manifest`, `ctx.structuredData`,
  `ctx.summary` (checksums) — passed to the website step; `pipelineRunId`
  recorded in the checkpoint.

## 14. Website Engine Integration

- Adapter: `createWebsiteEngine()` (shared instance).
- `site = engine.build(configs, { manifest, structuredData })` →
  `validation = engine.validate(site)` (7 checks/page).
- QA failure here (`validation.passed === false`) → `QA_FAILED` state with
  the full report; recovery: re-render after fix (new config) or human
  `QA_OVERRIDE` approval (with evidence).
- Rendering is deterministic (Phase 4.3 guarantee), so re-render after crash
  produces byte-identical output; no duplicate site artifacts.

## 15. Delivery Integration

- Adapter: the existing `createDeliverySystem({ root, engine, artifacts,
  memory, autoAllowed, retryConfig })` — the engine adapter is provided by
  the orchestrator's website step (the website engine exposes `export(site)`
  producing the production tree, exactly like delivery's test/demo wiring).
- Production build + final QA use delivery's own managers (they already
  assemble `delivery-meta.json`, checksums, and run the secret scan):
  `delivery.builds.build(businessId, { site, validation, trace })`,
  `delivery.qa.run({ buildId, site, validation, buildRecord, files: tree })`,
  `delivery.packaging.packageBuild({ buildId, buildRecord, qaReport, tree })`.
- Delivery: `deliver({ buildId, mode, provider, target, trace })` — `mode`
  from autonomy level: `dry-run` (L0–L3), `explicit` (L4, or L5-with-gate),
  `auto` (L5 only and only when `DELIVERY_AUTO_ALLOWED=true` and provider is
  whitelisted).
- The orchestrator's `DEPLOY` approval wraps delivery's own
  `approve(recordId, { by })` — both approvals are recorded (orchestrator
  record + delivery record), keeping delivery's internal gates authoritative.
- `VERIFYING` maps to delivery's verify-to-READY (already internal) plus an
  orchestrator-level outcome check (`getRecord(recordId)` status).
- Rollback: `OrchestratorSystem.rollback(executionId, { by, mode })` →
  `approveRollback` + `rollback` on the delivery record (state →
  `ROLLED_BACK`); `revert` supported the same way. `allowedProviders` on the
  campaign constrains `provider`; providers themselves are only reachable
  via delivery's registry.

## 16. Memory Integration

- Shared `MemorySystem`; the existing delivery bridge already writes
  `business:<businessId>` / `deployment:<recordId>` facts.
- Orchestrator facts (same API, deterministic keys):
  - `put('business', 'business:<businessId>', 'orchestrator:execution:<executionId>', summary, { tags: ['orchestrator'] })`
  - `put('business', 'business:<businessId>', 'orchestrator:campaign:<campaignId>', …)`
- **No duplicates by construction**: `MemoryStore.put` fingerprints
  `(type, scope, key, content)` and returns `{ deduped: true }` without a new
  version when the content is identical (§ verified in `memory/store.js`).

## 17. Artifact Integration

- Shared `ArtifactSystem`; every persistence uses `create({ name, type,
  format, content, projectId, workflowId, runId, stepId, title, summary,
  tags, generatedBy: 'orchestrator' })` with deterministic names.
- New artifact types (additive to `artifacts/formats.js` at implementation,
  exactly like Phase 4.4 added `deployment-report`/`qa-report`):
  `campaign-report`, `execution-report`, `decision-record`,
  `approval-record`, `execution-trace`.
- **No duplicates by construction**: artifact keys are
  `projectId::workflowId::type::name` and each key is versioned; the adapter
  checks `latestVersion(key)` and compares content `checksum` before
  creating — identical content is skipped (existing engine behavior:
  versions only grow on change, and the orchestrator names artifacts
  deterministically).
- Written per execution: QA report (delivery already), deployment report
  (delivery already), decision record, approval records, execution report,
  execution trace; per campaign: campaign report.

## 18. Idempotency

Rules (enforced by `execution/checkpoint.js` + `campaign/queue.js`):

1. **Same campaign spec → same `campaignId`.** Starting an existing
   non-terminal campaign resumes it; starting a completed one is a fresh
   campaign (spec must differ or operator force flag).
2. **Same (campaign, business, workflow version) → same `executionId`.**
   Re-running skips already-`DEPLOYED`/`REJECTED`/`ARCHIVED` executions
   (terminal) and resumes non-terminal ones.
3. **Discovery** — discovery persists records by business `id`; the queue
   de-duplicates candidates by `id`.
4. **Dossier** — fingerprint + version reuse (§12).
5. **Pipeline** — deterministic `runId` + resume + deterministic output
   (§13).
6. **Website + build** — deterministic `buildId` (content hash); the same
   build produces the same `dep_<buildId>` record. If `getRecord` shows the
   record already `recorded` for this `buildId`, deployment is skipped and
   the existing record is linked (no duplicate deployments).
7. **Memory** — content-fingerprint dedupe (§16).
8. **Artifacts** — key + checksum dedupe (§17).
9. **Approvals** — deterministic `approvalId`; a decided approval is
   terminal and never re-created.
10. **Crash between step and checkpoint** — step re-runs; because all steps
    are idempotent (same input → same output or skip), re-run is safe.

## 19. Recovery / Resume

- **Checkpoint model**: `checkpoint.json` per instance, written with
  `atomicWrite` after every completed step:
  `{ executionId, campaignId, businessId, status, stepIndex, attempts,
     outputs: { dossierVersion, pipelineRunId, buildId, qaReportId,
     deliveryRecordId, artifactIds }, timeline: [last 5] }`.
- **Boot recovery** (`recovery/resume.js`): on `createOrchestratorSystem`,
  scan `instances/`; for each non-terminal instance, mark
  `status=CREATED`-ish resume point: if `error.class` is TRANSIENT/SYSTEM →
  re-queue with bounded attempts; if `AWAITING_APPROVAL`/`ESCALATED` → leave
  paused for human decision; `QA_FAILED` → leave for review/override.
- **Crash safety**: every stage is resumable because (a) step outputs are
  idempotent, (b) checkpoint write is atomic, (c) downstream stages reuse
  existing outputs (delivery record lookup, dossier version lookup).
- **Stale locks**: per-business lock files carry a timestamp + process token;
  locks older than `lockTtlMs` are broken on boot.
- **Provider/network/AI failure** inside a step: step-level transient retry
  (§21) then `FAILED` with class → resume eligible.
- **Expensive stages are never redone**: once `dossierVersion`,
  `pipelineRunId`, `buildId`, or `deliveryRecordId` is in the checkpoint,
  the corresponding step re-validates the artifact exists and re-links it.

## 20. Concurrency

- **Pool** (`concurrency/pool.js`): bounded worker pool;
  `maxConcurrent = min(campaign.limits.maxConcurrent, hardCap)` (hardCap
  default 4, matching scheduler's `maxWorkers` default).
- **Per-business isolation**: one active execution per `businessId`
  (lock file); executions share no mutable state — each has its own
  checkpoint/trace; engines are safe for concurrent use across executions
  (their storage is per-id; delivery records/packages are content-addressed
  by `buildId`).
- **Queue** (`campaign/queue.js`): per-campaign FIFO with priority
  (brain score/priority tier), drained by the pool.
- **Failure isolation**: a step failure throws into the *execution's* error
  lane (recorded, classified §21); the campaign continues with remaining
  executions; campaign totals track `failedExecutions`.
- **Shared-state rules**: campaign budget counters are updated
  serially (single writer section with in-process mutex; persisted with
  `atomicWrite`); approval store appends are atomic single files; no
  cross-execution file writes.
- **Idempotent concurrent triggers**: two schedulers firing the same
  campaign → same `campaignId`; the campaign lock guarantees one owner.

## 21. Failure Classification

`errors.js` `ORC_CODES` + a classifier that maps downstream codes
(`E_DEL_*`, `PIP_*`, `DOS_*`, `WEB_*`, discovery/brain errors) to classes:

| Class | Examples | Retry behavior |
|---|---|---|
| `BUSINESS_FAILURE` | invalid business data, missing required fields, discovery record invalid | terminal `FAILED`; no retry; recorded with reason; campaign continues |
| `POLICY_FAILURE` | brain REJECT, blocked by policy, provider not whitelisted | terminal `REJECTED`/`ARCHIVED`; no retry |
| `VALIDATION_FAILURE` | schema violation, QA fail (no override), security/secret gate | terminal `FAILED`/`QA_FAILED`; no automatic retry; human override path |
| `TRANSIENT_FAILURE` | network, provider 429/5xx/`E_TR_*`, scheduler job retry, rate limit | step-level retry with backoff up to `limits.maxRetries`; then `FAILED` (resumable) |
| `SYSTEM_FAILURE` | unexpected internal error, crash | `FAILED`; eligible for resume on next boot/retry (bounded) |

- Every error is persisted: `record.error = { class, code, message,
  attempts, at }` in the checkpoint, trace entry, and redacted audit log.
- **One business failure never stops the campaign** — only
  `EMERGENCY_STOP`, a limit, or explicit operator stop halts the campaign.

## 22. Safety Model

- **Gates are non-negotiable**: brain verdict → dossier `requireApproved`;
  QA must pass or be overridden; delivery's internal gates (checksum,
  preflight, secret scan) stay authoritative; `DELIVERY_AUTO_ALLOWED`
  semantics unchanged.
- **Provider restrictions**: `campaign.deployment.allowedProviders`
  (default `['local']` in demo; production would add `mock`/`vercel` with
  explicit operator config). Provider registry is delivery's; orchestrator
  only passes `provider` + `target` through.
- **Rate limits**: delivery retry config + scheduler `retryDelayMs` + budget
  counters (`maxProviderCalls`, `maxAiCalls`).
- **Kill switch (global emergency stop)**:
  - File `storage/orchestrator-engine/EMERGENCY_STOP` **or**
  - Env `ORC_EMERGENCY_STOP=1`.
  - Effect: pool stops dispatching new steps; in-flight steps finish or are
    abandoned at the next checkpoint boundary; all instances marked
    `STOPPED`; campaigns → `STOPPED`; scheduler jobs for campaigns
    paused. Recovery resumes normally only after the switch is cleared
    and an operator explicitly resumes.
- **Autonomy ≠ unlimited**: even at L5, ESCALATE, QA_OVERRIDE, and
  POLICY_VIOLATION approvals are human-only; budgets and kill switch apply
  at every level.

## 23. Security Model

Boundaries (data flows):

```
Discovery data ─► Brain ─► Dossier ─► Pipeline ─► Website ─► Delivery ─► Provider
    ▲ upstream (business/AI data) never touches provider credentials        ▼
    └───────────────── provider secrets live only in delivery vault/env ────┘
```

- The orchestrator **never** receives or forwards provider credentials; it
  passes `{ provider, target }` to delivery's registry, which already
  redacts targets and validates configs (Phase 4.4).
- Secret scan: the delivery final QA runs `scanFiles` on the production
  tree; orchestrator does not add a second scan — it surfaces the QA report
  (which includes `secret-scan` results).
- Trace/audit redaction: reuse of the delivery `safeForLog` semantics —
  audit NDJSON lines and trace entries are passed through redaction so vault
  values and provider tokens never appear in orchestration logs.
- Approval evidence only references artifact ids/record ids, never payloads
  that may embed secrets.
- Sensitive actions (`SENSITIVE` kind: rollback, target change, provider
  change) always require an explicit approval at any autonomy level.
- Runtime secrets policy: no secrets in campaign specs; `SecretVault`
  (delivery) remains the only credential source.

## 24. Resource Limits

`limits/budget.js` — persisted ledger per campaign (survives restart):

| Limit | Enforcement |
|---|---|
| `maxBusinesses` | discovery candidate cap (hard cut after ranking) |
| `maxConcurrent` | pool size (per campaign, hard cap 4) |
| `maxRetries` | step retry budget per execution (and job-level `maxAttempts`) |
| `maxDeployments` | counter incremented on each real deploy (not dry-run) |
| `maxAiCalls` | counter over brain/discovery/external calls (reserved; discovery has none by default — simulated sources) |
| `maxProviderCalls` | counter over delivery provider calls (deploy/verify/promote) |
| `maxExecutionDurationMs` | per-execution watchdog (elapsed since checkpoint `startedAt`) |
| `maxCampaignDurationMs` | campaign watchdog |

- When a limit is reached: the campaign stops safely — pool drains in-flight
  executions, no new executions are queued, state → `LIMITS_REACHED`,
  scheduler campaign job paused, an `orchestrator.limits_reached` event +
  audit line + trace entry are written, and the campaign report includes
  the budget ledger.
- Limits are configurable per campaign (JSON schema validated) and may be
  raised by an operator only with an approval record when `SENSITIVE`.

## 25. Observability

Every execution produces (in `instances/<executionId>/`):

- `checkpoint.json` — last valid checkpoint (status + outputs).
- `trace.ndjson` → assembled `trace.json` — ordered events:
  `executionId, workflowId (= campaignId + workflowVersion), businessId,
  dossierVersion, pipelineRunId, engineRunId (= buildId), deliveryRecordId,
  step, state transitions (from→to), decisions (decisionId + verdict),
  approvals (approvalId + granted), errors (class/code/attempts), retries
  (attempt counts), artifactIds[], timestamps, final outcome`.
- `execution-report.json` — the report payload (also an artifact).

Cross-cutting:

- Events on the shared EventBus: `orchestrator.campaign_started/paused/
  resumed/completed/stopped/limits_reached`, `orchestrator.execution_
  started/step_completed/state_changed/approval_required/approved/denied/
  deployed/failed/archived/rolled_back`.
- Audit: redacted NDJSON to `logs/orchestrator/<date>.ndjson`.
- Campaign metrics in `campaigns/<campaignId>.json` (counts, tiers, budget
  ledger, trace links).

The full lifecycle can be reconstructed from disk by replaying
checkpoint + trace + approvals + artifacts — no memory required.

## 26. Schemas

`orchestrator/schemas/` (JSON Schema, validated via `runtime/validator.js`
like every other module):

1. `campaign.schema.json` — spec (§7) incl. `limits` and `autonomyLevel`
   enum L0–L5.
2. `workflow-instance.schema.json` — per-execution record (state, outputs,
   error, attempts).
3. `execution-trace.schema.json` — event entries + assembled trace.
4. `checkpoint.schema.json` — checkpoint payload.
5. `approval.schema.json` — approval record (§9).
6. `autonomy-config.schema.json` — level → step/approval mapping table
   (operator-editable policy data).
7. `limits.schema.json` — budget ledger.
8. `orchestration-error.schema.json` — classified error payload.
9. `execution-report.schema.json` — report artifact payload.
10. `campaign-report.schema.json` — aggregate report payload.

## 27. Testing Strategy

All suites offline, mirroring the delivery test conventions
(`tests/helpers.mjs` with `runTests`, scratch roots under
`storage/delivery-tests/`, fake/simulated sources, mock/local providers).

| Suite | Focus |
|---|---|
| `unit.mjs` | ids/fingerprints, errors/classification, autonomy policy resolution, step registry, budget counters |
| `state-machine.mjs` | all valid transitions, illegal-transition throws, retryable/terminal/recovery sets |
| `approval.mjs` | request/decide immutability, no silent approvals, deterministic approvalId, L5 auto-approval still writes a record |
| `policy.mjs` | L0–L5 mappings, gate invariants (ESCALATE never auto), provider whitelist |
| `idempotency.mjs` | same campaign/business twice → single dossier/pipeline/build/record/memory/artifact |
| `resume.mjs` | crash injection between every step → resume from last checkpoint, no redone stages, stale-lock cleanup |
| `failure-isolation.mjs` | one business VALIDATION_FAILURE / BUSINESS_FAILURE → campaign completes others |
| `concurrency.mjs` | 10 businesses, `maxConcurrent=3`, locks, queue order, no cross-corruption |
| `limits.mjs` | budgets stop campaign safely (`LIMITS_REACHED`), kill switch halts pool |
| `security.mjs` | secrets never in trace/audit/approval/artifacts; credentials never reach upstream steps |
| `determinism.mjs` | identical campaign spec → identical ids/outputs/checksums across runs |
| `campaign.mjs` | discovery→rank→queue→metrics pipeline, reject/archive/escalate routing |
| `smoke.mjs` | full E2E: 6-business campaign (3 approve, 2 reject, 1 escalate), approval flow, local-provider deploy simulation, resume, retry, trace completeness |
| `regression.mjs` | re-runs every existing module suite via the reg-all harness — must stay green (97 delivery + 20/20 modules) |

## 28. Demo Strategy

`orchestrator/demo/demo.mjs` — deterministic, offline, gitignored output
(`storage/orchestrator-demo/`):

- Campaign: Cairo cafe market, 6 businesses (simulated discovery sources),
  `autonomyLevel: 4`, `provider: local`, `allowedProviders: ['local','mock']`.
- Expected outcomes: **3 APPROVE, 2 REJECT, 1 ESCALATE**.
  - Approved → dossier → config → site → QA → delivery → local deploy
    (deployment simulation — no real production deployment).
  - Escalated → execution pauses at `ESCALATED`; demo operator calls
    `approve(...)` with a printed approval record; execution resumes and
    completes.
  - Rejected → `ARCHIVED` with brain decision trace.
- Additionally demonstrates (each a small scripted scenario):
  - **Resume** — fault injection: crash after step N, relaunch, instance
    resumes from checkpoint, completed stages not redone.
  - **Retry** — mock provider queued 500 → delivery retry → success.
  - **Failure isolation** — one business with a broken-link QA failure
    blocks only itself; others deploy.
  - **Campaign metrics** — discovered/approved/rejected/escalated/deployed/
    failed counts + budget ledger.
  - **Execution trace** — full `trace.json` printed with all ids.
- Determinism: fixed seed convention (reuse scheduler `seed`/`seededRng`
  pattern), simulated discovery, byte-stable outputs.

## 29. Risks

| Risk | Mitigation |
|---|---|
| Scope creep into new engines | hard non-goals (§3.4); steps are thin adapters; review gate per integration |
| Brain plan-runner vs orchestrator steps overlap | documented boundary (§11): brain owns decisions, orchestrator owns campaign/execution mechanics |
| Determinism leaks (timestamps/uuids in ids) | ids never contain timestamps/randomness; artifacts dedupe by key+checksum (artifact engine uses uuid ids, so dedupe is by key + content checksum) |
| Duplicate deployments from crash/re-run | `dep_<buildId>` lookup before deploy; delivery record reuse (§18.6) |
| Lock races on concurrent triggers | campaign lock + per-business lock + atomic checkpoint writes |
| Existing modules drift | regression harness re-run in CI-style step; no module file changes except additive artifact types |
| Approval UX friction at L5 | autonomy policy table is operator-editable; approvals remain explicit but fast-path for low-risk kinds |
| Campaign memory/storage growth | per-campaign retention (campaign report pruning policy, consistent with `storage/` conventions) |
| Provider misconfig in demo | `allowedProviders` whitelist + local-only default + no network in tests/demo |

## 30. Production-Readiness Checklist

- [ ] All 14 test suites green, including full regression (97 delivery + 20/20 modules).
- [ ] No module re-implemented; integration adapters only call public APIs.
- [ ] Idempotency verified by suite (double-run equivalence).
- [ ] Crash-resume verified by suite (fault injection at every step).
- [ ] Approvals: explicit, immutable, evidenced — verified by `approval.mjs`.
- [ ] Autonomy levels operator-configurable; L5 cannot bypass escalation/QA/security gates.
- [ ] Kill switch verified (file + env), incl. recovery after clear.
- [ ] Budget limits verified (safe stop, no orphaned executions).
- [ ] Trace + audit fully reconstruct the lifecycle offline.
- [ ] No secrets in trace/audit/approvals/artifacts (security suite).
- [ ] Deterministic demo runs byte-stable; campaign metrics correct.
- [ ] Docs: `orchestrator/README.md`, `orchestrator/Architecture.md`,
      `reports/PHASE4_5_ORCHESTRATOR_IMPLEMENTATION.md`, root README /
      ARCHITECTURE updates.
- [ ] Git: one commit + annotated tag `v1.6.0-orchestrator`, pushed; tree
      clean; stop before Phase 4.6 (no GitHub Release).

---

*End of design. Implementation begins only after approval of this document.*
