# Orchestrator Architecture (`orchestrator/Architecture.md`)

The orchestrator is a **coordination layer only**. It never scores, never
invents policy, and never overrides a Brain verdict — it routes work through
the existing engines, gates every sensitive transition, and persists
everything.

## Module map

```
orchestrator/
  ├── index.js               facade — OrchestratorSystem (API version 1.0)
  ├── utils.js               deterministic ids (cmp-/orc-/apr-), file helpers, sanitizeRunId
  ├── errors.js              ORC_CODES + failure classification
  ├── state/machine.js       20 execution + 8 campaign states, legal transitions
  ├── workflow/engine.js     StepEngine — step runner with per-step retry + budget hooks
  ├── workflow/steps.js      WORKFLOW_VERSION, 13 STEP_IDS, step definitions
  ├── policy/gate.js         PolicyGate — autonomy levels L0–L5, human-approval kinds
  ├── approval/store.js      ApprovalStore — immutable, disk-persisted approval records
  ├── limits/budget.js       campaign budget (7 limit kinds) + counters
  ├── recovery/resume.js     RecoveryManager — boot(): stale locks, resumable scan
  ├── campaign/index.js      CampaignManager — lifecycle, queue, pool, approvals, rollback
  ├── campaign/queue.js      CandidateQueue — deterministic order, maxBusinesses
  ├── concurrency/pool.js    BoundedPool — maxConcurrent × hardCap
  ├── concurrency/lock.js    LockManager — per-business lock files, stale-lock TTL break
  ├── execution/checkpoint.js CheckpointStore — instance state files (atomicWrite)
  ├── execution/trace.js     TraceCollector — redacted NDJSON + assembled trace
  ├── observability/audit.js AuditLog — redacted daily NDJSON
  ├── observability/events.js OrchestratorEvents + ORC_EVENTS (shared bus bridge)
  ├── safety/killswitch.js   EMERGENCY_STOP file + ORC_EMERGENCY_STOP env
  ├── integrations/          adapters: discovery, brain, dossier, pipeline, website,
  │                          delivery, memory, artifacts, scheduler, validation
  ├── demo/demo.mjs          end-to-end demo (6 businesses, L4, offline)
  └── tests/                 18 offline suites (helpers.mjs = fixture stack)
```

## Dependencies (all injected, never duplicated)

```
orchestrator/
  ├── discovery/      (adapters.discovery — records + weakness detection)
  ├── brain/          (adapters.brain — verdicts: APPROVE/REJECT/ESCALATE/PARK)
  ├── dossier/        (adapters.dossier — 20-document knowledge layer)
  ├── pipeline/       (adapters.pipeline — 13-stage config bundle)
  ├── website-engine/ (adapters.website — renders + validates the site)
  ├── delivery/       (adapters.delivery — final QA, packaging, providers, rollback)
  ├── artifacts/      (adapters.artifacts — decision/trace/report/campaign artifacts)
  ├── memory/         (adapters.memory — business + campaign facts)
  ├── scheduler/      (adapters.scheduler — campaign run/resume jobs)
  └── runtime/        (shared bus + validation services)
```

## Key contracts

| Contract | Shape |
|---|---|
| Execution id | `orc-<hex>` = hash(campaignId \| businessId \| workflowVersion) — never raw inputs |
| Campaign id | `cmp-<hex>` = hash(canonical spec) — same spec → same campaign |
| Approval id | `apr-<hex>` = hash(executionId \| kind \| step) — one decision, immutable |
| Instance dir | `storage/orchestrator-engine/instances/<executionId>/` — checkpoint.json, record.json, decision.json, pipeline.json, site.json, trace.ndjson, trace.json, execution-report.json |
| Campaign file | `storage/orchestrator-engine/campaigns/<campaignId>.json` |
| Approval file | `storage/orchestrator-engine/approvals/<approvalId>.json` |
| Locks | `storage/orchestrator-engine/locks/<lockId>.lock` — lockId sanitized, `..` rejected |
| Killswitch | `storage/orchestrator-engine/EMERGENCY_STOP` or `ORC_EMERGENCY_STOP=1` |

## Security model (SEC-01)

All caller-controlled identifiers (runId, businessId, campaign name) reach the
filesystem only through `sanitizeRunId`/hashed ids:

- `runtime/contextManager.js` — `create()` replaces any runId that does not
  survive sanitization unchanged with a fresh generated id; `_runDir()` (and
  therefore `_contextFile`, `persist`, `writeSummary`, `load`) sanitizes
  again as a second line of defense.
- `runtime/logger.js`, `runtime/workflowRunner.js` (`_runBus`,
  `_writeArtifacts`), `runtime/agentRunner.js` (command input file),
  `pipeline/runner.js` (`_safeRunId`, checkpoint dirs) — every join goes
  through `sanitizeRunId`.
- Orchestrator ids are hashed (`orc-`/`cmp-`/`apr-`), so hostile businessIds
  cannot influence paths; `LockManager.lockIdFor` rejects traversal outright.
- Secret hygiene: `safeForLog` redacts scan-pattern matches (tokens, bearer,
  `sk-…`, AWS keys) and vault-known values in traces, audits and reports; the
  delivery final QA runs a secret scan on the production tree, blocking
  credential-bearing content before deployment.

Coverage: `orchestrator/tests/security.mjs` (13 tests, incl. hostile
businessId campaigns and credential-content QA blocking).

## Lifecycle of one campaign

1. `startCampaign(spec)` — canonicalize + hash → `cmp-` id, persist DRAFT.
2. `runCampaign(id)` — QUEUE → START; discovery adapter; qualify; admit up to
   `maxBusinesses` in deterministic opportunity order; create executions.
3. `_dispatchAll` — BoundedPool (`min(maxConcurrent, hardCap)`), one
   execution per business at a time (per-business lock files); each
   `_continueExecution` runs the StepEngine until it hits a human gate
   (approval), a limit, or a terminal state.
4. Humans decide via `approve()`/`deny()`; granted DEPLOY continues the
   execution; ESCALATE requires an explicit approval before deploy.
5. `_finalize` — recomputes metrics, emits COMPLETE/LIMITS/STOP, writes the
   campaign report artifact. Waiting executions (AWAITING_APPROVAL,
   QA_FAILED, ESCALATED) keep the campaign RUNNING on purpose.
6. On restart, `RecoveryManager.boot()` reconciles campaigns + executions and
   breaks stale locks; `resumeCampaign()` re-dispatches remaining work.

## Extension points

- Providers: register any `delivery` provider via `sys.registerProvider(id, p)`.
- Scheduler: `sys.attachScheduler()` wires `orchestrator.campaign` jobs
  (run / resume actions) to the Phase 3.5 scheduler.
- Autonomy: `AUTONOMY_CONFIG` maps levels → auto steps + human approval kinds;
  operators can tighten levels without code changes.
- Adapters: every engine boundary is an adapter object — swap discovery
  sources, policies, or providers without touching the state machine.
