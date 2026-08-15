# Phase 4.7 Design Proposal — Outcomes & Adaptation Loop

> Status: **PROPOSAL — planning only. Nothing in this document has been
> implemented.** No source files were modified during the audit or the
> writing of this proposal. Base: commit `a1baeb4`, tag
> `v1.7.0-intelligence`, branch `main`, origin/main in sync, one untracked
> read-only audit report (`reports/V1_7_0_PLATFORM_AUDIT.md`).
>
> This proposal was produced from a fresh audit of the repository
> (brain/decision/policy plane, orchestrator, scheduler, delivery, memory,
> artifacts, runtime, intelligence, security, observability) — not from any
> prior conversation or prior design text.

---

## 0. Audit Summary (what the repository actually contains)

Verified facts that this design is built on:

| Plane | Verified state |
|---|---|
| brain plane | `Brain.runBusiness` single decision path; verdicts APPROVE/REJECT/ESCALATE/PARK; 8 rules; 8 default policies; deterministic estimates/confidence/risk; 5 `brain.*` events; reasoning evidence chains; plan runner with gate context `{policyVerdict, decisionVerdict, decisionId, businessId}`; `executeWorkflow` returns `status:'unavailable'` without a runner; brain writes **no memory**; metrics in-memory unless rooted |
| decision-engine | pure functions; decision record carries `policySummary` but **no policy version stamp**; no policy snapshot at campaign start (verified: grep for `policySnapshot|policyVersion` in orchestrator → none) |
| orchestrator | `createOrchestratorSystem` facade; 13 steps; 20 execution states; 8 campaign states; content-hashed `cmp-/orc-/apr-` ids; budget ledger with 8 limit kinds; L0–L5 autonomy (L5 auto-grant); `EMERGENCY_STOP` killswitch; `RecoveryManager.boot()` marks, never dispatches; `attachScheduler()` subscribes `orchestrator.campaign` |
| scheduler | `createSchedulerSystem`; `validateSchedule` accepts only `{cron: <string>}`, `{intervalMs}`, `{at}` (**not** `{type:'cron', expr}`); SCH-01 dispatch journal; SCH-02 stop semantics |
| scheduler ↔ intelligence | **Gap (verified):** `intelligence/jobs/framework.js:77` registers jobs with `schedule: {type:'cron', expr}` → `validateSchedule` returns `null` → **none of the 8 intelligence jobs auto-fire**; they run only via explicit `engine.runJobs()` |
| delivery | `createDeliverySystem`; 17 deployment states; QA gate incl. secrets; immutable packaging; rollback/revert; **PRV-01 open** (vercel provider `index.js:10-12,70`: dead `default` export, unknown readyState mapped to BUILDING, burns the 120 s verify window with misleading `PROVIDER_ERROR`) — disposition C from 4.6 |
| intelligence | 9 suites / 346 PASS; sink (redact-at-write, watermark, LRU dedupe); 6 stores; 8 windowed jobs; incidents; 6 alert rules; 5 report kinds; schemas for `observation` and `observation-batch` **already exist** (`intelligence/schemas/`) but there is **no import API, no store, no job, no producer**; artifact types `experiment-report`, `observation-batch` registered but **no producer** |
| memory | `MemorySystem` 8 types, versioned key-value, atomic writes, secret-key rejection (`E_MEM_SECRET_REJECTED`), business-scoped handles |
| artifacts | `ArtifactManager`; 26 types; **ID-1 P2**: ids are `art-<randomUUID()>` (content deterministic, ids not) — policy undecided; `createWithDedupe` (checksum) in orchestrator adapter |
| security | SEC-01 run-id containment everywhere; redact-at-write via `delivery/security/redaction.js` (shared implementation, ~185 call sites); env-only SecretVault; zip-slip guards; memory secret-key rejection; approval ledgers immutable |
| observability | 19 runtime EVENTS + module-level `module.*` events (orchestrator 18, brain 5, pipeline 7, dossier 5, delivery 5, scheduler job events); intelligence sink subscribes 31; NDJSON logs; metrics; no distributed tracing, no external notifiers |

### 0.1 All documented non-blocking backlog items (collected)

From `PHASE4_6_OPERATIONS_INTELLIGENCE_DESIGN.md` §5, §35, §36; `PHASE4_5_ORCHESTRATOR_IMPLEMENTATION.md` §backlog; `V1_7_0_PLATFORM_AUDIT.md` §18–§20:

- **4.6.1 (SHOULD HAVE):** observations import (C), compare-experiment (D), priority hints (F), cost-efficiency (I), backfill job, retention job, digests polish.
- **PRV-01** (disposition C → open): vercel provider verify behavior distorts `provider.*` intelligence metrics.
- **SCH-01/scheduler**: log, Recorded B (fixed in 4.6) — plus the new **cron wiring gap** found in this audit (see §0).
- **ID-1 (P2):** artifact id randomness; policy must be decided.
- **R-2 (P2):** unbounded raw stores (events, audit, scheduler history) without retention/compaction.
- **D-1/D-2 (P3):** stale test counts in README/ARCHITECTURE; no single aggregate regression command.
- **ID-2 (P3):** buildId truncated to 64 bits — log as accepted risk or widen.
- **Q-1 (P3):** silent best-effort `catch {}` sites; **Q-2 (P3):** tracked `_debug.mjs`.
- **A-1 (P3):** sha256/hex16/atomicWrite/stableJson duplicated across 5 modules — act only if a new module becomes a third+ consumer.
- **Audit §20 entry criteria before the next phase:** (1) fix/disposition PRV-01, (2) retention decision + job, (3) resolve ID-1, (4) refresh docs counts + aggregate runner.
- **4.6 design FUTURE (explicitly not in 4.6/4.6.1):** external notifiers, dashboards/UI, distributed workers, self-adaptation, live adapters (uptime/analytics), monetary cost accounting, CRM/outreach executors.

---

## 1. Phase Name

**Phase 4.7 — Outcomes & Adaptation Loop (Outcome Intelligence, deterministic learning boundary).**

Delivered as three sequential sub-phases (see §27):

- **4.7.0 — Foundation & Trust**: entry-criteria hardening + observations ingestion pipe.
- **4.7.1 — Evaluation & Experimentation**: campaign evaluation (estimated vs actual) + offline compare-experiments.
- **4.7.2 — Advisory Adaptation**: cost-efficiency, priority hints, digest polish.

---

## 2. Mission / Purpose

Close the platform's last open loop: after Phase 4.6 made the agency observable
(metrics, incidents, alerts, deterministic reports), Phase 4.7 gives the agency
the ability to **receive real-world outcomes safely** (observations), to
**validate its own decisions against those outcomes** (campaign evaluation),
and to **test alternative policies offline without ever auto-applying them**
(compare-experiments), while resolving every P2 entry condition the v1.7.0
audit identified.

The platform's own extension contract is honored verbatim
(`ARCHITECTURE.md:170-176`): "decision-engine rules are plain data … a learned
model can replace weights, not code"; "reasoning produces a structured evidence
chain — a natural input contract for an LLM explainer or auto-adjustment loop".
Phase 4.7 is the deterministic half of that contract: **it builds the
measurement and experimentation machinery that makes "adjustment" safe to
consider later — while keeping all adjustment advisory and human-gated.**

## 3. Why It Is The Correct Next Phase

1. **It is the logical successor to 4.6.** 4.6 built the signal plane;
   4.7 is the first consumer-grade use of those signals (evaluation and
   experiment jobs run on the same windowed JobFramework, the same stores,
   the same report/artifact pipeline — no new infrastructure paradigms).
2. **It resolves every documented entry condition for the next phase**
   (`V1_7_0_PLATFORM_AUDIT.md §20`): PRV-01 (cond. 1), retention (cond. 2),
   ID-1 artifact-id policy (cond. 3), docs/aggregate runner (cond. 4).
3. **The alternative candidates are weaker:**
   - *Operator console/dashboard* — declared FUTURE by the 4.6 design; UI
     work with no new data would not advance the platform's capability.
   - *External notifiers* — FUTURE; they need alert/incident maturity first.
   - *More autonomy levels* — autonomy is already data-driven L0–L5; raising
     levels without outcome validation would automate unmeasured behavior.
   - *Adaptive budgets/self-adaptation* — explicitly FUTURE and explicitly
     dangerous until the deterministic experiment boundary exists. Phase 4.7
     builds that boundary *first*.
4. **It closes the only remaining conceptual gap in the five-stage pipeline**
   (discovery → decision → build → deliver → operate): with 4.7, a campaign
   that delivered sites can come back and ask "was the decision right?" —
   the estimated-revenue/ROI figures from `decision-engine` become validated
   instead of asserted.

## 4. What Problem It Solves

- **No validated decisions.** `estimatedRevenue` and `roi` are computed for
  every APPROVE but nothing ever checks them against reality; the agency
  cannot learn which policies produced good outcomes.
- **No safe ingestion path.** There is no way for an operator to feed
  outcomes (won/lost, signed, paid, rpm) into the platform — the 4.6 design
  explicitly identified this as the missing pipe.
- **No deterministic experimentation.** Policy changes are hand-edited JSON
  with no way to measure "what would have happened under policy v2" offline.
- **Production-readiness blockers still open (P2):** unbounded raw stores
  (R-2), random artifact ids (ID-1), vercel verify behavior distorting
  provider analytics (PRV-01), and the freshly-verified scheduler→job cron
  wiring gap that prevents the 8 intelligence jobs from ever auto-firing.
- **Hygiene debt:** stale test counts, no single regression command,
  duplicated utils that will grow with every new module (A-1).

## 5. What It Must NOT Do

- **Must NOT auto-apply anything.** No code path may read experiment output
  and change policies, strategies, verdicts, weights, budgets or approval
  behavior. Enforced by design and by tests (§26).
- **Must NOT change decision semantics.** Verdict precedence, rule set,
  policy evaluation, confidence/risk formulas, estimates — all byte-identical.
  Only *additive* fields (version stamps) and *advisory* ordering may change.
- **Must NOT add live adapters** (uptime checks, analytics imports, email
  arrival). Outcome ingestion is explicit, operator-invoked, offline-only.
- **Must NOT add external communication** (notifiers, dashboards, HTTP
  services) and **must NOT add runtime dependencies** (Node 24 ESM, zero npm
  deps preserved).
- **Must NOT rewrite existing modules.** All changes are additive: new
  files, new additive fields, new registered jobs/artifact types/config
  entries. Existing public contracts (API version 1.0 strings, events, id
  schemes, storage layouts, schemas, error codes) are preserved (§12).
- **Must NOT implement self-adaptation, distributed workers, or monetary
  cost accounting** (all FUTURE).
- **Must NOT execute experiments during a live campaign** in a way that
  touches state; experiments are pure offline re-runs over stored records.

## 6. Architecture

No new top-level module. Phase 4.7 is an **additive expansion of the
intelligence plane** plus **four small additive patches** (decision-engine
version stamping, an orchestrator admission-ordering hook, a scheduler
schedule-shape fix, a delivery provider fix). This follows the platform rule:
facade + injected runtime seam + storageRoot isolation + scheduler
registration + artifacts, never a parallel infrastructure.

```
                    ┌────────────────────────────────────────────────────┐
                    │            Phase 4.7 additions (shaded)             │
                    │                                                    │
 operator CLI       │  importObservations(batch)     experiments spec    │
   ───────────────▶ │  ┌──────────────────┐   offline   ┌──────────────┐ │
 (explicit, safe)   │  │ observations/    │◀────────────▶│ jobs/        │ │
                    │  │  store + import  │   read-only  │ campaign-    │ │
                    │  └──────┬───────────┘              │ evaluation   │ │
                    │         │ out/697f... .json        ├──────────────┤ │
                    │  ┌──────▼───────────┐              │ compare-     │ │
                    │  │ jobs/retention   │              │ experiment   │ │
                    │  │ jobs/backfill    │              ├──────────────┤ │
                    │  │ jobs/cost-eff.   │              │ cost-        │ │
                    │  └──────────────────┘              │ efficiency   │ │
                    │        │                           └──────┬───────┘ │
                    │        ▼                                  ▼         │
                    │  ┌───────────────────────────────────────────────┐  │
                    │  │ tools/: evaluation-report, experiment-report  │  │
                    │  │ → artifacts (evaluation-report,               │  │
                    │  │   experiment-report, observation-batch)       │  │
                    │  └───────────────────────────────────────────────┘  │
                    └────────────────────────────────────────────────────┘

 existing (unchanged)                  additive patches
 ─────────────────────        ──────────────────────────────────────────
 EventBus/EventSink           decision-engine: policyVersion stamping
 MetricStore/InsightStore     orchestrator: admission priority-hint hook
 Incident/Alert stores        scheduler: validateSchedule {type:'cron'}
 JobFramework (markers)       delivery/vercel: PRV-01 readyState fix
 ArtifactManager/Memory       artifacts: ID-1 content-addressed ids
```

## 7. Module Boundaries

| Path (new) | Responsibility | Phase |
|---|---|---|
| `intelligence/observations/store.js` | ObservationStore: daily rollover, watermark, dedupe by `observationId`, orphan flag, retention-aware reads | 4.7.0 |
| `intelligence/observations/import.js` | `importObservations(batch)` API: schema validation, size caps, secret scan (reject), batched receipts, idempotent apply | 4.7.0 |
| `intelligence/observations/index.js` | sub-plane facade + `OBSERVATIONS_API_VERSION='1.0'` | 4.7.0 |
| `intelligence/jobs/retention.js` | retention/compaction job (raw events/metrics/observations, aggregates; scheduler history trimming is scheduler-owned, job only *reports* its size) | 4.7.0 |
| `intelligence/jobs/backfill.js` | explicit recompute of job windows over a requested range (uses existing markers; never replays future windows) | 4.7.0 |
| `intelligence/jobs/campaign-evaluation.js` | estimated vs actual per campaign; validation report inputs | 4.7.1 |
| `intelligence/jobs/compare-experiment.js` | offline re-run of pure `DecisionEngine` under alternative policy/strategy versions; diff tables | 4.7.1 |
| `intelligence/jobs/cost-efficiency.js` | resource units per deployed site (providerCalls, aiCalls, buildTimeMs, storage bytes) | 4.7.2 |
| `intelligence/tools/evaluation.mjs`, `tools/experiment.mjs` | deterministic report builders → artifacts | 4.7.1 |
| `intelligence/schemas/observation.schema.json` (exists), `observation-batch.schema.json` (exists) | **no new schema files required for observations**; add `evaluation-report` and `experiment` spec schemas | 4.7.0/4.7.1 |
| `scripts/regress.mjs` | single aggregate regression runner (D-2) | 4.7.0 |

| Path (patch, existing file) | Change | Phase |
|---|---|---|
| `decision-engine/engine.js` + `schemas/decision.schema.json` | additive `policyVersion` (hash of applied policy set) + `strategyVersion` in decision records; `materializeVersion()` helper (pure, no storage) | 4.7.1 |
| `orchestrator/workflow/steps.js` | stamp decision record with the version at decision time (additive field, back-compat) | 4.7.1 |
| `orchestrator/campaign/index.js` + `queue.js` | deterministic `priorityHint` ordering of the pending admission queue (advisory; approvals and verdicts untouched) | 4.7.2 |
| `scheduler/engine.js` `validateSchedule` | accept `{type:'cron', expr}` (mirror `{cron: expr}`); regression added | 4.7.0 |
| `delivery/providers/vercel/index.js` + `client.js` | PRV-01: remove dead `default` export, full readyState taxonomy, fast-fail on terminal states, no BUILDING-by-default fallback | 4.7.0 |
| `artifacts/manager.js` | ID-1 resolution: content-addressed ids (`art-<sha256(project|workflow|type|name|version)>`) for new records; legacy random ids remain readable | 4.7.0 |

**Explicitly untouched:** `brain/` core, `pipeline/`, `website-engine/`,
`dossier/`, `state-machine/`, `execution-plans/`, `policies/` default files,
`memory/`, `runtime/` core, every existing intelligence store/job, all
existing schemas' required fields.

## 8. Data Flow

```
operator (CLI)  ──importObservations(batch)──▶  Validation
   │                                             │ schema (existing)
   │                                             │ size caps (per-batch,
   │                                             │  per-day)
   │                                             │ secret scan → reject
   │                                             ▼
   │                                  ObservationStore (daily NDJSON +
   │                                  watermark + dedupe by observationId)
   │                                             │
   ▼                                             ▼
receipts (artifact observation-batch)   jobs (marked, windowed):
   └─ dedupe/errors per row             campaign-evaluation: obs ∩ executions
                                        compare-experiment: decision.json ×
                                          policy/strategy version files
                                        cost-efficiency: delivery records +
                                          provider/ai counters + build times
                                        retention/backfill: stores + markers
                                                        │
                                                        ▼
                                        InsightStore / report tools
                                                        │
                                                        ▼ structure artifact:
                                        evaluation-report / experiment-report
                                        (+ readable markdown mirrors)
```

- Observations are **records-only read** for every job; jobs never write
  back into observations.
- Experiment output is a **pure derived report**: `decision.json` + version
  files in, diff tables out, nothing else touched.
- Single-writer rule extends: `observations.*` metric points only from the
  observation import path; `evaluation.*` only from the evaluation job;
  `experiment.*` only from the experiment job (sink never maps events into
  these namespaces).

## 9. State Flow

**Observation lifecycle:** `imported → validated → stored (daily rollover) →
linked (businessId/executionId/campaignId cross-reference) → evaluated →
retained (retention window) → expired (sweep, count in stats)`. Each
observation carries at most one `status` transition recorded in its row;
imports are idempotent — re-import of the same `observationId` is a
no-op + `duplicateOf` reference.

**Policy/strategy versioning:** a version is `sha256` of the canonical
(stable-stringified) policy/strategy document set. Snapshots are materialized
once per campaign start (`policyVersionRef`, additive campaign field) and
stamped into each decision record. Old version files are never deleted —
they are the immutable experiment base. This is what makes compare-experiments
exact: inputs are frozen at decision time.

**Experiment lifecycle:** `spec (version a vs version b, scope) → snapshot
input set (stored decisions) → pure re-run → diff report → artifact → no
state change`. Experiments never transition system state.

## 10. APIs / Contracts

**New public APIs (additive; nothing existing changes):**

- `intelligence.importObservations(batch, { source })`
  → `{ receiptId, imported, duplicates, rejected, errors[], total }`
  (`intelligence/observations/import.js`). Errors: `E_OBS_INVALID_BATCH`,
  `E_OBS_SECRET_REJECTED`, `E_OBS_SIZE_EXCEEDED`, `E_OBS_STORE_ERROR`
  (new `OBS_CODES` in `intelligence/observations/errors.js`, following the
  `INT_CODES` pattern).
- `intelligence.compareExperiment(spec)` → experiment result object
  (spec: `{ name, basePolicyVersion, altPolicyVersion, scope, maxDecisions }`).
- `intelligence.runRetention({ maxAgeRawDays, maxAgeAggregateDays, dryRun })`
  → summary.
- `decisionEngine.materializeVersion(policySet)` → `{ id, sha256, count }`
  (pure helper; no state).
- Report kinds added: `evaluation-report`, `experiment-report` (artifact
  types `evaluation-report`, `experiment-report`, `observation-batch` —
  matching the 4.6 registry additions).

**Existing contracts that MUST be preserved (inventory):**

- API version strings: `ORCHESTRATOR_API_VERSION/DELIVERY_API_VERSION/
  BRAIN_API_VERSION/PIPELINE_API_VERSION/INTELLIGENCE_API_VERSION/
  SCHEDULER_API_VERSION = '1.0'` and friends — unchanged.
- Facade signatures: `createOrchestratorSystem`, `createDeliverySystem`,
  `createBrain`, `createSchedulerSystem`, `createIntelligence`,
  `createMemorySystem`, `createArtifactSystem` — unchanged.
- Id schemes: `cmp-/orc-/apr-` (hashed), `stm-`, `dec-`, `ins-`, `alr-`,
  `evt-`, `rpt-`, `dep_<buildId>` — unchanged (only artifact ids gain a new
  deterministic form for *new* records).
- Event names: all 19 runtime EVENTS + `orchestrator.*` (18), `brain.*` (5),
  `pipeline.*` (7), `dossier.*` (5), `delivery.*` (5), `scheduler.job_*`,
  `orchestrator.kill_switch` — unchanged; new events are additive only.
- Error codes: `BRN*`, `E_DEC_*`, `E_XPL_*`, `E_STM_*`, `DEL_CODES`,
  `SCH_CODES`, `INT_CODES`, `E_MEM_*`, `E_AR_*`, global `CODES` — unchanged.
- State enums: 20 execution states, 8 campaign states, 17 delivery states,
  17 brain states — unchanged.
- Storage layouts: `storage/<root>/orchestrator-engine/…`,
  `storage/delivery/…`, `storage/memory-engine/…`, `storage/artifacts-engine/…`,
  `storage/intelligence/…` — unchanged; new stores are additive directories.
- Policy/strategy/plan catalogs: operator-editable JSON — unchanged shape
  (new optional fields allowed).
- Killswitch semantics (`EMERGENCY_STOP` file/env) — unchanged, and must
  also gate 4.7 jobs (JobFramework already honors it).

## 11. Integration Points

- **Scheduler:** 4 new jobs registered via `JobFramework.define` with
  schedules (`cron` shapes fixed by the 4.7.0 patch, so they auto-fire);
  dispatch journaling + SCH-01 replay already cover at-least-once.
- **Brain:** no runtime integration; experiments *import* the pure
  `DecisionEngine`/`StrategyEngine`/`PolicyEngine` as libraries under
  controlled fixtures (same pattern as `tests/fixtures` but reader-only).
- **Orchestrator:** reads campaign files + `decision.json` (evaluation,
  experiments); 4.7.2 advisory ordering hook at admission; 4.7.1 writes the
  additive `policyVersion` stamp.
- **Delivery:** PRV-01 fix only; evaluation jobs read `delivery/records`
  (records already carry trace/buildId); no delivery API changes.
- **Intelligence:** new stores/jobs/tools plugged into the existing engine
  (`engine.js` gains `importObservations`, `compareExperiment`,
  `runRetention` delegations; start/stop lifecycle unchanged); config gains
  observation/experiment/retention sections (additive keys).
- **Memory/Artifacts:** evaluation/experiment summaries as business-scoped
  memory facts (optional, additive); artifacts per existing `ArtifactManager`
  + `createWithDedupe` pattern; retention reach includes artifact expiry
  (`sweepExpired` already exists), only wired into the retention job.

## 12. Security Model

- **Import-time security** (observations): schema validation; hard size caps
  (batch ≤ 1 MB, ≤ 5,000 rows, per-day cap in config); secret scan
  (scanText against the shared scan patterns + known vault values) → the
  whole batch is **rejected** with per-row error codes (secure default:
  no redaction-on-ingest; opaque rejection instead); observation `id` and
  `scope` sanitized (`sanitizeScopeId` / path containment) before any
  path use; `source` label sanitized (SEC-01 pattern).
- **At-rest:** observations stored redacted-at-write? No — observations are
  *already redacted upstream* (they carry outcome numbers, not credentials);
  the store still applies the shared `redact()` as a defense-in-depth pass,
  and the memory bridge respects `E_MEM_SECRET_REJECTED`.
- **Experiments are read-only** over stored records — cannot write policy,
  strategy, budgets, approvals, or any orchestrator/delivery state
  (test-enforced by storage-diff scanning, same technique as
  `intelligence/tests/security.mjs`).
- **No new credentials.** Observation import has no auth/adapter; operators
  run it in-process. No HTTP surface, no tokens.
- **Killswitch** halts all 4.7 jobs (inherited from JobFramework).
- `POLICY_VIOLATION` approval kind: out of scope (see §28 non-goals) — noted
  because experiments must NOT try to raise it either.

## 13. Determinism / Idempotency Model

- `observationId = obs-<sha256(source|type|businessId|period|value fields)>`
  computed at import → idempotent re-import (no-op + `duplicateOf`), receipts
  byte-stable given the same batch.
- Version stamps are content hashes of canonical JSON → same policies ⇒ same
  `policyVersion` ⇒ byte-stable experiment inputs.
- Experiment output: the DecisionEngine is a pure function of
  (record, context, policy, strategy); re-running under fixed inputs yields
  byte-identical diff tables (golden-file tested).
- Evaluation job: windowed recompute-over-write with JobFramework markers;
  never processes a future window; clean-restart replays nothing.
- Retention/backfill: marker-driven; backfill range is explicit and capped;
  both are idempotent by marker semantics.
- Accepted non-determinism (unchanged from platform policy): wall-clock
  timestamps, durationMs, and legacy random artifact ids.

## 14. Failure / Retry / Recovery Model

- **Import:** atomic per-batch (write rows + watermark together); a failed
  batch writes nothing and returns row-level `errors[]`; partial-batch
  failures are reported, never half-applied (two-phase: validate-all →
  apply-all).
- **Jobs:** inherit JobFramework — killswitch abort, marker crash recovery,
  `maxWindows` caps, retries via scheduler (maxAttempts 2, backoff).
- **Retention:** runs in `dryRun` first, then sweeps oldest-first;
  a crash mid-sweep restarts from markers; deletions are per-day files
  (atomic unlink), never partial files.
- **Experiments:** pure functions — a crash leaves no state; results are
  intermediate files written atomically, then promoted to artifacts.
- **PRV-01 fix:** removes the misleading `PROVIDER_ERROR` path; retry policy
  unchanged (transient 429/5xx); the fast-fail taxonomy shortens verify.
- **Recovery boundary:** RecoveryManager boot semantics unchanged; 4.7 adds
  no locks, no new restart state.

## 15. Observability

- New events (additive, on the shared bus): `intelligence.observations_imported`
  (receipt summary), `intelligence.evaluation_completed`,
  `intelligence.experiment_completed`, `intelligence.retention_completed`.
- New metric namespaces (registry-validated, typo-proof like the existing
  registry): `observations.*` (imported, duplicates, rejected, linked),
  `evaluation.*` (validated, deltaPct per outcome metric),
  `experiment.*` (decisions re-run, flips, agreements),
  `retention.*` (bytes freed, days swept).
- New artifacts: `observation-batch` (receipt), `evaluation-report`,
  `experiment-report` + readable markdown mirrors (existing reports pattern).
- Everything write-time redacted, `safeForLog` in audits, storage-diff
  scanned by `security.mjs`-style suites.

## 16. Scheduler Interaction

- **4.7.0 patch:** `validateSchedule` accepts `{type:'cron', expr}` —
  this fixes the verified gap so the existing 8 jobs and the 4 new jobs
  auto-fire on schedule instead of requiring manual `engine.runJobs()`.
  Regression suite added (schedule parsing + an auto-fired job).
- 4 new jobs register with cron schedules + priority 3 (retention/backfill
  priority 1 — maintenance first), maxAttempts 2, timeoutMs ≤ 120 s, and
  `dispatch journal` covers their fire records (SCH-01).
- Jobs remain killswitch-aware; stop/close semantics (SCH-02) unchanged.

## 17. Brain Interaction

- **Additive stamping only:** `runBusiness`-produced `decision` gains
  `policyVersion`/`strategyVersion` (computed by `materializeVersion`),
  validated by an additive-optional schema field. No verdict, estimate,
  risk, confidence, rule, policy, or gate behavior changes; `brain-smoke`
  golden decision ids remain identical.
- **Experiments reuse the engines as pure libraries** with fixture policy
  sets (no bus, no memory, no metrics). Asserted by a test that the
  experiment module performs zero writes outside its own storageRoot.

## 18. Orchestrator Interaction

- 4.7.1: campaign start writes `policyVersionRef` (additive campaign
  field); execution `decision.json` stamped (additive).
- 4.7.2: `priorityHint` = deterministic sort key (opportunity tier desc,
  businessId hash asc — the 4.6 design's exact advisory rule) applied to
  the pending admission queue. It orders *within* the existing budget-gated
  admission; it never skips approvals, never re-scores, never changes
  verdicts, and is visible in a report column.
- No step, state, approval-kind, or autonomy-config changes.

## 19. Delivery Interaction

- **PRV-01 only.** Vercel provider: remove the dead `default` export;
  map the full readyState set explicitly (IN_PROGRESS poll set, terminal
  fast-fail set incl. previously unknown states); unknown states → explicit
  transient error classification (retryable) instead of silent BUILDING.
  Provider metrics (`provider.*`) become trustworthy; delivery API,
  records, QA, packaging, rollback untouched.

## 20. Intelligence Interaction

- Engine facade gains delegations (`importObservations`, `compareExperiment`,
  `runRetention`, `runBackfill`) — start/stop/health/snapshot unchanged.
- Config: additive sections `observations`, `experiments`, `retention`,
  plus registry additions for the new metric namespaces.
- Stores: `ObservationStore` new; existing stores untouched.
- Jobs: 4 new job files registered in `jobs/index.js` (additive entries).
- Sink: unchanged; it must NOT map anything into the new namespaces
  (single-writer rule, test-enforced).

## 21. Memory / Artifacts Interaction

- Memory: optional additive facts `business:<id>` →
  `evaluation.summary` / `experiment.summary` (prevents stale duplicates —
  latest-only per key, existing versioning handles history).
- Artifacts: new types `evaluation-report`, `experiment-report`,
  `observation-batch` (already registered in the 4.6 registry — producers
  now exist); **ID-1 resolution**: new records get deterministic
  `art-<sha256(project|workflow|type|name|version).slice(0,16)>` ids,
  legacy random ids remain valid on read/lookup (dual-read path,
  lookup-by-key first), decision documented in `artifacts/README.md`.
- Retention job invokes existing `sweepExpired`; artifact expiry config
  additive.

## 22. Testing Strategy

New suites (all offline, fixture-driven, golden-file where applicable):

| Suite | Phase | Coverage |
|---|---|---|
| `intelligence/tests/observations.mjs` | 4.7.0 | import happy path; rejects (schema, secrets, size, scope/path); idempotent re-import; receipts byte-stable; orphan flag; watermark resume |
| `intelligence/tests/retention.mjs` | 4.7.0 | bounds, dry-run, sweep oldest-first, marker recovery mid-sweep, kills no live data |
| `intelligence/tests/backfill.mjs` | 4.7.0 | explicit range, cap enforcement, marker idempotency, no future windows |
| `scheduler/tests/cron-shape.mjs` | 4.7.0 | `{type:'cron',expr}` parity with `{cron:expr}`; auto-fired job with journal |
| `delivery/tests/vercel-verify.mjs` | 4.7.0 | readyState taxonomy table; fast-fail; no silent BUILDING; regression-454 still green |
| `artifacts/tests/deterministic-ids.mjs` | 4.7.0 | new ids deterministic; legacy ids readable; lookup-by-key; path containment intact |
| `intelligence/tests/evaluation.mjs` | 4.7.1 | estimated vs actual deltas; per-campaign golden report; link/join edge cases |
| `intelligence/tests/experiments.mjs` | 4.7.1 | pure re-run diff tables byte-stable; version stamps stable; **zero-auto-apply** (attempts to mutate policy/strategy/budget from experiment context throw); scope/max caps |
| `intelligence/tests/security-470.mjs` | 4.7.x | storage-diff: experiments/observations never write outside own stores; secret rejection; containment |
| `orchestrator/tests/priority-hint.mjs` | 4.7.2 | deterministic ordering; budget gates intact; approvals untouched |
| `scripts/regress.mjs` | 4.7.0 | runs every suite in the monorepo, counts assertions, prints totals (D-2) |

Extension of existing suites: `determinism.mjs` (full pipeline + new jobs
byte-reproducible), `integration.mjs` (day-2 cycle with observations and an
experiment), `models.mjs` (new schemas), orchestrator `idempotency.mjs`
(stamped decision records), plus **all prior suites must stay green**
(full regression: 1,576+ assertions today).

## 23. Offline / Demo Strategy

- `node AgencyOS/intelligence/demo-470.mjs` (extended existing demo): boot →
  simulated campaign → observations import (fixture batch with valid,
  duplicate, rejected rows) → evaluation → experiment (alt policy v2) →
  retention dry-run → five reports → artifacts + mirrors. Zero network.
- Every new suite runs without any external service; vercel verify tests use
  a fixture HTTP stub (existing `setHttp` seam).

## 24. Rollback Strategy

- All changes are additive; rollback = delete the phase's files and revert
  the four small patches — there is no data migration to undo.
- New stores/artifacts are isolated (`storage/intelligence/observations/…`,
  artifact types distinct) — old code ignores them.
- The scheduler patch is behavior-reversible (default remains
  `{cron: expr}`-shaped *and* `{type:'cron',expr}`); failing the patch
  revokes to the 4.6 behavior with zero changes elsewhere.
- ID-1: dual-read keeps old tooling working even if the patch is reverted.
- No release, tag, push, or commit happens until the user approves (§30).

## 25. Migration / Backward Compatibility

- Decision records: `policyVersion` optional — old records (without it)
  still evaluate and experiment (experiment marks them `unversioned` and
  re-runs under the recorded policySummary only).
- Campaign files: `policyVersionRef` optional field.
- Artifact ids: dual-read (content-addressed new, random legacy).
- Scheduler job specs: previously-registered specs unchanged; the fix adds
  an accepted shape only.
- Observations: brand-new store — no migration.
- All schemas: additive-optional fields only; no required-field changes.
- Docs: README/ARCHITECTURE inventory refreshed in 4.7.0 (D-1).

## 26. Performance / Resource Limits

- Import: batch ≤ 1 MB / 5,000 rows; per-day observations cap (config,
  default 50,000 rows); synchronous atomic writes (same cost class as the
  sink).
- Jobs: JobFramework `windowMs`/`maxWindows` caps; retention runs
  oldest-first in day-granular batches; backfill capped per run (e.g.
  90 days × 8 jobs).
- Experiments: `maxDecisions` per run (default 5,000) + wall-clock budget
  (default 60 s); pure CPU — no I/O beyond fixed reads.
- Storage: retention defaults raw 90 days / aggregates 2 years; artifact
  expiry via existing sweeper; scheduler history already capped
  (100 runs/job, 2,000 total).
- Single-writer + registry validation keep the new namespaces free of
  event-driven bloat.

## 27. 4.7.x Sub-Phases

- **4.7.0 — Foundation & Trust** (entry criteria): PRV-01 fix; scheduler
  cron-shape fix; ID-1 artifact id policy; retention + backfill jobs;
  observations store + import API + receipts; `scripts/regress.mjs`; docs
  count refresh. *Exit: all P2s closed, 4.6 suites green + new suites.*
- **4.7.1 — Evaluation & Experimentation** (the core): policy/strategy
  version stamping; `campaign-evaluation` job + `evaluation-report`;
  `compare-experiment` job + `experiment-report`; zero-auto-apply
  enforcement. *Exit: byte-stable golden reports for a fixture campaign.*
- **4.7.2 — Advisory Adaptation**: `cost-efficiency` job; priority-hint
  admission ordering; digest polish tying evaluation/experiment results into
  `agency-health`. *Exit: full platform regression green on the final tag.*

## 28. Non-Goals (explicit)

- Auto-adaptation / auto-applied learning; LLM/ML training of any weight.
- Live outcome adapters (uptime, analytics, CRM import, email).
- External notifiers, dashboards/UI/console, HTTP services.
- Distributed workers / horizontal scheduling.
- Monetary cost accounting (kept FUTURE); new approval kinds
  (incl. `POLICY_VIOLATION` surfacing).
- Real CRM/outreach executors; new website-engine/dossier/pipeline features.
- Changing verdicts, limits, autonomy levels, or any budget semantics.

## 29. Risks & Mitigations

| Risk | L | Mitigation |
|---|---|---|
| Scope creep (the 4.6 lesson: 36 design sections vs one delivery) | H | Frozen MUST/SHOULD cut; three sub-phases with explicit exit criteria; every import/job gated by tests |
| Experiments misread as authority → operator auto-applies bad policy | H | Zero-auto-apply enforced by tests; advisory-only labeling in artifacts; experiments never touch live state |
| Observation poisoning (bad operator data) | M | Schema + secret scan + size caps + explicit `source` + orphan flag + receipts; evaluation reports show sample counts |
| Storage growth unbounded (R-2) | M | Retention defaults + dry-run sweeps + marker crash recovery + artifact expiry |
| Scheduler cron patch regressions | M | Shape-parity regression suite; behavior reversible; SCH-01 journal covers fired jobs |
| ID-1 change ripples through artifact consumers | M | Dual-read path; lookup-by-key; containment tests; documented in artifacts README |
| PRV-01 fix interacts with verify retry accounting | M | Dedicated readyState-table suite + existing delivery regression (151 PASS) re-run |
| New event/metric names collision | L | Registry validation (unknown key → error) + single-writer tests |
| Version stamping changes decision bytes | L | `materializeVersion` pure + additive schema field; brain-smoke golden ids unchanged |

## 30. Acceptance Criteria & Definition of Done

**Acceptance (all sub-phases):**
1. All 11 new/extension suites green; full platform regression green under
   `scripts/regress.mjs` (single command, counted).
2. Golden files byte-stable for observations receipts, evaluation and
   experiment reports, and the extended determinism pipeline.
3. Zero-auto-apply and storage-diff assertions pass (no writes outside
   own stores; no policy/strategy/budget mutation from any 4.7 code path).
4. PRV-01 demo test shows correct fast-fail vs poll taxonomy; provider
   metrics uncontaminated.
5. 8 original + 4 new jobs auto-fire from the scheduler with journaled
   dispatch and killswitch abort honored.
6. Demos run offline; secret scan exit 0; IDs deterministic for new
   artifacts; legacy ids readable.
7. Docs (README, ARCHITECTURE, intelligence/README, this design) updated
   additively; audit conditions §20 all closed.

**Definition of done:** code + tests + demo + reports (design/implementation
per sub-phase) + doc refresh + backlog disposition recorded — matching the
convention of every prior phase (e.g., 4.6's implementation report).

## 31. Recommendation on the Phase 4.6.1 Backlog (A/B/C/D)

**Option D — split across Phase 4.7 sub-phases. Reasons (architectural, not
convenience):**

- **Dependencies form a chain: observations → evaluation → experiments.**
  The four "4.6.1" items are not independent: `observations import` has no
  consumer until `compare-experiment`/`campaign-evaluation` exist, and
  `compare-experiment` has no actuals until observations exist. Shipping
  observations alone (option A) would deliver dead infrastructure;
  shipping experiments alone would run against empty stores.
- **Retention is a production precondition, not a feature.** The v1.7.0
  audit conditions the *next phase* start on it (condition 2) and R-2 is
  P2. Option C would carry a P2 into the phase, and doing it "before 4.7"
  (A) would expand its scope with no consumer either (compaction pays off
  only when the platform runs — the same runtime it gates).
- **A single 4.7 release absorbing all of 4.6.1 (B) repeats the 4.6 scope
  mistake** that the 4.6 design itself documented (36 sections vs one
  phase, MUST/SHOULD/FUTURE cut). Evaluation + experiments + retention +
  observations + advisory items in one delivery would exceed any realistic
  single delivery in this codebase's rhythm.
- **Priority hints and cost-efficiency are advisory and value-ordered
  last**: they consume evaluation insights (cost-efficiency should use
  validated delivery data; priority hints should land only after decisions
  are measurable) — placement in 4.7.2 is dependency-driven, not cosmetic.
- **Digests polish** trails everything by definition (it formats results).

Hence: observations/retention/backfill → **4.7.0** (foundation);
compare-experiment → **4.7.1** (core, with version stamping);
cost-efficiency + priority hints + digest polish → **4.7.2** (advisory).
Nothing from 4.6.1 is deferred wholesale (C) — each item lands in the
sub-phase where its consumer exists. (FUTURE items — notifiers, dashboards,
adapters, self-adaptation, monetary accounting — remain FUTURE.)

## 32. Recommended Commit / Tag Strategy

- Branch: `main` (single linear history, matching repo convention; no
  feature branches). Commits conventional-style, module-scoped, e.g.
  `feat(observations): safe outcome ingestion pipe`, `fix(scheduler): accept
  {type:'cron'} schedule shape`, `fix(delivery): vercel readyState taxonomy`,
  `feat(intelligence): campaign evaluation job`, `feat(intelligence):
  offline compare-experiment job`, `feat(orchestrator): advisory priority-hint
  ordering`.
- **No commit, tag, push, or release until the user approves this design**
  and explicitly authorizes each step.
- Suggested tags at sub-phase exits (following `v1.X.Y-<name>` convention):
  `v1.8.0-foundation-trust` (4.7.0), `v1.8.0-evaluation` (4.7.1),
  `v1.8.0-adaptation` (4.7.2) — or, if kept atomic, a single final tag
  `v1.8.0-outcomes` at the last sub-phase with interim commits only. The
  exact scheme is decided at approval time.
- Each sub-phase closes with its implementation report in `reports/`
  (4.7.0/4.7.1/4.7.2 implementation docs) and pass counts recorded in
  ARCHITECTURE.md, matching prior-phase convention.