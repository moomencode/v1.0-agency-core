# v1.7.0 — Full Platform Audit

> Read-only architecture, security and quality review of the AgencyOS platform.
> Date: 2026-08-15. Commit audited: `a1baeb4` (tag `v1.7.0-intelligence`).
> Nothing was modified during this audit; no tests were added.

---

## 1. Executive Summary

AgencyOS v1.7.0 is a healthy, unusually well-tested monorepo of 22+ modules
spanning discovery → brain → dossier → pipeline → website-engine → delivery →
orchestrator → intelligence. The audit confirmed:

- **Repository state**: checked out exactly at `v1.7.0-intelligence` →
  `a1baeb4dcf6a92d711c10059e47b698649c9e8d9`; working tree clean.
- **67 suites executed (66 with numeric counts), 1,504 assertions, 0 failures**
  (plus a runtime smoke suite that reports ALL PASS without counts, and 112
  website-engine regression checks). Both secret scans exit 0.
- **No P0/P1 findings.** The platform has no code execution primitives, no
  tracked secrets, consistent path containment (SEC-01 class re-verified), and
  write-time redaction at every ingest boundary.
- **Scheduler SCH-01/SCH-02 are real** (verified against the code, not the
  report): persisted dispatch journal with crash-window replay, retry-timer
  cleanup on stop, and a stop flag — plus 82 regression assertions.
- **The three Phase 4.6 bug fixes are real in code**: watermark basename
  comparison (`intelligence/sinks/event-sink.js:218-219`), `health()` flat
  snapshot access (`engine.js:207-213`), and corrected integration assertions.
- **Determinism is genuine for all functional outputs** (ids, metrics,
  insights, reports, websites, deployment packages). One notable exception:
  artifact *ids* are random UUIDs (`artifacts/manager.js:124`) — content and
  checksums remain deterministic; classified P2 (metadata-level).
- **Two P2 findings, eight P3/INFO findings.** None are blockers; all are
  documented in the risk matrix (§18).

**Verdict: READY WITH CONDITIONS** — §16.

---

## 2. Repository State

| Check | Result |
|---|---|
| Branch | `main` |
| HEAD | `a1baeb4dcf6a92d711c10059e47b698649c9e8d9` — `feat(intelligence): implement operations intelligence plane (4.6.0)` |
| Tag | `v1.7.0-intelligence` → same commit |
| Remote | `origin` = github.com/moomencode/v1.0-agency-core.git; `main` up to date (a1baeb4 pushed) |
| Working tree | **clean** (`nothing to commit`) |
| Tracked files | 1,141 |
| `.gitignore` | present at repo root: covers `logs/`, `*.log`, `node_modules/`, `dist/`, `.env*`, `storage/`, `discovery-demo/` |

History (top 8): `a1baeb4` feat(intelligence) → `8030f78` feat(orchestrator) →
`0814778` fix continuation failures → `f2567aa` fix rollback/artifact
containment → `13c9bc4` rollback+verification hardening → `0c23362` scheduler &
file integrity hardening → `3b7fc9c` recovery & data-integrity hardening →
`53904c3` approval & accounting controls.

**Confirmed: `v1.7.0-intelligence → a1baeb4` is the checked-out, tagged,
pushed, clean state.**

---

## 3. Architecture Review

### 3.1 Layering and dependency direction — HEALTHY

Base layer is `runtime/` (no `runtime/index.js`; direct files) — the only
module with zero imports from other AgencyOS modules. Direction of the few
cross-module imports is strictly upstream:

- `delivery/index.js` → `../runtime/validator.js`
- `scheduler/index.js` → `../runtime/executor.js`
- `memory/index.js` → `../runtime/validator.js`
- `communication/index.js` → `../runtime/validator.js`
- `artifacts/manager.js` → `../runtime/utils.js`

No module imports a sibling module's internals. **No circular dependencies
found at module level.**

### 3.2 Orchestrator uses dependency inversion correctly

`orchestrator/index.js` wires external capabilities through `./integrations/*`
adapters (validation, discovery, brain, dossier, pipeline, website, delivery,
memory, artifacts, scheduler). The orchestrator never imports those modules
directly — coupling is injected. This is the platform's cleanest seam.

### 3.3 Intelligence is a read-mostly observer

`intelligence/engine.js` constructs an isolated `RecordsReader` over
orchestrator/delivery/scheduler paths and takes the bus, artifacts manager and
scheduler as constructor options. It writes only under its own `storageRoot`
(verified by `tests/security.mjs`, 22 PASS). No write path to shared stores
exists.

### 3.4 Duplicated responsibilities (minor, deliberate)

Five modules maintain private copies of near-identical primitives
(`sha256`, `hex16`/`shortHash`, `atomicWrite`, `stableJson`): `runtime/utils.js`,
`orchestrator/utils.js`, `delivery/utils.js`, `intelligence/ids.js`,
`website-engine/utils.js`. Each module is self-contained and zero-dependency by
design (a stated project convention), so this is accepted duplication, not a
defect — but it is the platform's primary "copy-paste" surface. P3 / debt.

### 3.5 Named requirements check

| Question | Finding |
|---|---|
| Responsibilities separated? | Yes — each phase owns one stage; intelligence explicitly observer-only |
| Duplicated responsibilities? | Partial — validation helpers, id/atomic primitives (see 3.4); no behavioral duplication |
| Circular deps? | None found |
| Hidden coupling? | Mostly none; storage-layout knowledge is shared via documented paths (orchestrator-engine/, delivery/records, scheduler files) — a controlled, documented contract |
| Public APIs used consistently? | Consistent per module; `createXxx` facade pattern throughout |
| Modules depending on internals? | No; adapters + injected options only |
| Unnecessary abstractions? | Minor: per-module helpers (3.4); `stress`, `del78`, `_debug` suite names are opaque |
| Architectural inconsistencies? | Bus usage differs per layer: `communication/` implements its own bus; brain/delivery attach to it; intelligence subscribes to an injected bus. Intentional phase ordering, not inconsistency |
| Dependency direction healthy? | Yes — upstream only |

---

## 4. End-to-End Flow Audit

The full business lifecycle is wired in `orchestrator/integrations/*`:
Discovery → Brain (verdict) → Dossier → Pipeline (config bundle) →
Website Engine (site build) → Delivery (QA + provider deploy) → Intelligence
(observes all events/records).

| Stage | Produces | Consumed by | Contract stable? |
|---|---|---|---|
| Discovery | `record.id` (from source adapters), `record.area` as projectId | Brain, orchestrator business selection | businessId is source-provided, not normalized |
| Brain | verdict (APPROVE/REJECT/ESCALATE/PARK) | orchestrator | orchestrator never re-scores (test-enforced) |
| Dossier | `dos-<hex10>` dossierId, `v<N>` versions | pipeline | path `storage/dossiers/<businessId>/v<N>/` |
| Pipeline | runId (sanitized), 19-file config bundle | website-engine | checksum manifest |
| Website Engine | site bundle + SHA-256 manifests | delivery build | byte-deterministic |
| Delivery | `buildIdFrom(businessId, dossierVersion, pipelineRunId, engineChecksum)` = `sha256(…).slice(0,16)`; `recordId = dep_<buildId>` | orchestration | immutable; assertBuildId guards format |
| Orchestrator | `cmp-<hex16>`, `orc-<hex16>`, `apr-<hex16>` | intelligence reader, reports | content-hashed, immutable |
| Intelligence | `evt-<hex16>`, `ins-`, `alr-`, `incidentId`, `rpt-` | reports/artifacts | pure functions of content |

### Inconsistency risks found

- **businessId provenance (INFO)**: the dossier path and delivery buildId embed
  the *source* businessId verbatim (`storage/dossiers/<businessId>/`,
  joins in `buildIdFrom`). Business ids come unnormalized from discovery
  adapters; file names are `{slugify(name)}-{shortHash(record.id,8)}.json`
  (`discovery/engine.js:162`). No normalization contract exists across
  sources — two sources producing different ids for the same business would
  fragment the chain (dedupe happens on phone at discovery level).
- **Fixture divergence (INFO)**: `intelligence/tests/helpers.mjs` uses
  synthetic `biz-1..6`; `orchestrator/tests/helpers.mjs` uses its own
  simulated market ids; discovery uses `dis-<area>-<n>`. Each suite is
  hermetic, so this is a test-fixture convention difference, not a runtime bug.

---

## 5. Identity Review

| Identifier | Format | Determinism | Mutability | Verification |
|---|---|---|---|---|
| campaignId | `cmp-` + hex16(sha256(canonical spec)) | deterministic | immutable | orchestrator/utils.js:26-28 |
| executionId | `orc-` + hex16(sha256(campaignId\|businessId\|workflowVersion)) | deterministic | immutable | utils.js:30-32 |
| approvalId | `apr-` + hex16(sha256(executionId\|kind\|step)) | deterministic | immutable | utils.js:34-35 |
| buildId | sha256(`businessId\|dossierVersion\|pipelineRunId` + engineChecksum).slice(0,16) | deterministic | immutable | delivery/utils.js:17-19 |
| recordId | `dep_<buildId>` | deterministic | immutable; `assertBuildId` regex-guarded | delivery/utils.js:26; records.js |
| dossierId | `dos-` + shortHash(businessId,10) | deterministic | immutable per business | dossier/engine.js:92 |
| eventId | `evt-` + hex16(sha256(event,module,at,correlation,payload)) | deterministic | immutable | intelligence/ids.js |
| insightId/alertId/reportId | content+window hashes | deterministic | immutable | intelligence/ids.js |
| artifact id | `art-` + **randomUUID()** | **NON-deterministic** | immutable once written | artifacts/manager.js:3,124 |
| memory keys | `business:<id>`, `campaign:<id>` + content/entry fingerprints | deterministic (dedupe by fingerprint) | versioned, immutable snapshots | memory/store.js:15-19 |

**Finding ID-1 (P2)**: artifact ids use `crypto.randomUUID()`. Content,
checksums, names and paths are deterministic (golden tests pass), so this does
not break byte-reproducibility of pipeline/report *content* — but
"same input → same artifact id" does not hold, and artifact records embed a
random identifier that cannot be re-derived. Acceptable for a run-record
registry; flagged because the platform's determinism story consistently
excludes only this one surface.

**Finding ID-2 (P3)**: `buildId` truncates SHA-256 to 16 hex chars (64 bits) —
collision probability negligible for realistic volumes, but lower than the
64-hex space used everywhere else (orchestrator/intelligence ids keep full or
16-hex `hex16` truncation too — same risk class, same magnitude as the rest of
the platform).

**No mutated-after-creation identities found**; no re-derivation drift between
stages (buildId → recordId linkage re-tested by `delivery/tests/regression-454.mjs`
P1-2/P1-9).

---

## 6. Determinism

### Verified deterministic (with passing tests)

- IDs: `intelligence/tests/determinism.mjs` (20 PASS) — eventId stable, changes
  with `at`; insightId/alertId pure.
- Full intelligence pipeline **byte-reproducible across two separate engine
  runs** (same file set, every file byte-identical).
- Sink ingestion byte-identical (same envelopes, same duplicate counts).
- Pipeline 100% deterministic — seeded RNG + stable JSON, verified by checksum
  in `pipeline/smoke.mjs`.
- Website-engine output byte-deterministic with per-file SHA-256 manifests
  (`website-engine/tests/regression.mjs`, 112 checks).
- Deployment packages: content-hash linkage (`delivery/tests/packaging.mjs`).
- Reports: `reportId = rpt-<sha256(kind|now)>`, byte-identical for same state +
  `now` (`intelligence/tests/reports.mjs`).
- Golden insight values byte-stable (`tests/jobs.mjs`, 79 PASS).

### Real violations found

- **ID-1 / D-1 (P2)**: artifact ids random (see §5). Content unaffected.

### Expected runtime metadata (NOT violations)

- `createdAt`/`updatedAt`/`generatedAt` timestamps on records, artifacts,
  reports, build records — allowed wall-clock metadata.
- Scheduled run `startedAt`/`durationMs` in scheduler history.
- Audit log timestamps.
- `randomUUID` in artifact ids only; **no other `randomUUID`/`Date.now`/
  `Math.random` use found in id paths** (verified by grep across id forgers).

---

## 7. Idempotency / Replay

| Mechanism | Location | Verified |
|---|---|---|
| Event sink dedupe (LRU + watermark replay) | intelligence/sinks/event-sink.js | determinism.mjs + integration.mjs (replay 0 after clean stop; duplicates counted) |
| Job markers — recompute-over-write, no future windows | jobs/framework.js:95-101 | jobs.mjs, integration.mjs, determinism.mjs |
| Incident/alert dedupe by deterministic keys | stores/incidents.js, stores/alerts.js | incidents.mjs (20), alerts.mjs (30) |
| Delivery: identical-build re-request refused | delivery regression-454 P1-2 | 12 PASS |
| Delivery rollback/revert re-promotion | rollback.mjs | 13 PASS |
| Orchestrator checkpoint resume, stale-lock breaking, pending approvals survive restart | orchestrator/resume.mjs + idempotency.mjs | 4 + 6 PASS |
| Memory content-fingerprint dedupe + immutable version history | memory/store.js | memory smoke 36 PASS |
| Artifact dedupe | artifacts smoke | 33 PASS |
| Scheduler dispatch journal (SCH-01) | scheduler/store.js + engine.js | regression-460 (21 PASS) |
| Intelligence recompute | jobs + stores | jobs.mjs (79), determinism.mjs (20) |

**No duplicate-deployment, duplicate-artifact, duplicate-memory,
duplicate-incident, duplicate-alert, phantom-retry, or replay-corruption
behavior found.** The scheduler replay path is additionally guarded: recovery
only runs when the in-memory queue is empty at boot (fresh process), dispatch
intents are removed after enqueue, and run numbers are reconciled from the
journal.

---

## 8. Security

### Verified protections

- **No code execution primitives**: grep for `child_process|execSync|
  spawnSync|eval(|new Function` across all source — **0 hits** (excluding
  storage/demo/tests dirs).
- **SEC-01 class re-audited**: caller-supplied ids are sanitized at every
  filesystem boundary — pipeline `sanitizeRunId` (runtime/utils.js, used by
  pipeline/runner.js:17), intelligence `sanitizeScopeId`, orchestrator
  `sanitizeRunId` + lock `lockIdFor` rejects traversal, delivery `assertBuildId`.
- **Path containment suites green**: artifacts/tests/path-containment.mjs
  (56 PASS), delivery/tests/zip-slip.mjs (10 PASS), orchestrator/tests/security.mjs
  (13 PASS), intelligence/tests/security.mjs (22 PASS, includes storage-diff
  scan proving no cross-store writes), delivery/tests/security.mjs (13 PASS).
- **Redaction at write time**: `delivery/security/redaction.js` applied at
  event-sink ingestion, audit log, failure notes (regression-454 P1-8) —
  and raw stores are grep-checked by tests.
- **SecretVault**: environment-only secret loading (env or file); no defaults,
  no logging of values.
- **Secret scans**: `delivery/security/scan.js` and `delivery/qa/secret-scan.js`
  both **exit 0**; no tracked `.env/.pem/.key/credential` files in `git ls-files`.
- **Env gates**: `DELIVERY_AUTO_ALLOWED` required for auto mode;
  `ORC_EMERGENCY_STOP`/`EMERGENCY_STOP` abort paths.

### Findings

No P0/P1. All P2/P3 findings are listed in §18 (risk matrix); the
highest-severity security-adjacent observation is **ID-1 (artifact ids)**
and **R-2 (unbounded raw stores without retention)** — neither is a
credential/containment issue.

---

## 9. Scheduler SCH-01 / SCH-02

### Implementation verification (re-read the code, not the report)

`git diff 8030f78..HEAD -- scheduler/`:

- **SCH-01 — atomic persist+enqueue with crash replay**:
  - `store.js` gains `listDispatches()` / `saveDispatch()` / `removeDispatch()`
    (dispatch intent journal).
  - `engine.js` `start()`: when `queue.peek() === null`, calls
    `_recoverDispatches()` — re-enqueues persisted intents exactly once,
    reconciles `runNumber`/`lastRunAt`/`nextRunAt`, resets `attempts`, saves
    job, enqueues with `dueAt = now`, then removes the dispatch intent.
  - Manual and scheduled trigger paths persist the dispatch intent **before**
    enqueue.
  - Retry path persists a `disp-<id>-r<N>` intent before enqueue.
  - Completion removes the dispatch intent (`_drain` completion path,
    keyed on `dispatchId || id.startsWith('disp-')`).
- **SCH-02 — stop semantics**: `stop()` sets `this.stopped = true` and calls
  `_clearRetryTimers()` (clears + empties the `retryTimers` Set); the tick
  loop and non-forced drains bail on `stopped`; `close()` delegates to
  `stop()`. Retry timers re-drain with `_drain(true)` bounded by
  `setTimeout(…, Math.min(delay, 30000))`.
- **Bridge**: optional `bridge(event, payload)` invoked best-effort after local
  listeners — additive, not a behavior change.

### Test results

`regression-460.mjs`: **21 PASS** · `regression-455.mjs`: **12 PASS** ·
`smoke.mjs`: **49 PASS** — all green, no regressions observed in delivery /
orchestrator / intelligence runs that schedule against this engine.

**Observation (INFO)**: `_recoverDispatches` only runs when the queue is empty
at boot — correct for crash recovery (fresh process), but a restart *into a
non-empty queue* would defer recovery; acceptable since the journal is
drained per intent.

---

## 10. Intelligence

### Verified in code (the Phase 4.6 bug fixes)

1. **Watermark basename comparison** — `sinks/event-sink.js:218-219`:
   `const relative = path.basename(file); let lineNo = this.watermark.file === relative ? this.watermark.lastLine + 1 : 1;`
   and `_saveWatermark` persists the relative name (`:152-153`). Replay math is
   correct across day rollover.
2. **`health()` flat snapshot access** — `engine.js:207-213`:
   `const sink = this.sink.statsSnapshot(); … watermarkAgeMs = sink.watermark && sink.lastEventAt ? nowMs - new Date(sink.lastEventAt).getTime() : null;`
   — no `.stats` dereference; exercised by `integration.mjs` (health surface
   section, PASS).
3. **Integration assertions** — day-2 campaign fixture
   (`campaigns/camp-2.json` on day 2), disk-backed point counts
   (`first.metrics.readPoints().length` vs `afterDisk`), `replayed === 0`
   after clean stop; first processed reliability window
   (`08-10T10:00→11:00`) for records-only mode.

Plus (from §2–7): pure ids, byte-reproducible pipeline, single-writer rule for
`provider.*`/`scheduler.*` points, write-time redaction, path containment,
killswitch abort (demo + jobs.mjs), watermark resume (0 replayed on clean
restart), incident/alert lifecycle (integration.mjs PASS), reports with
kind-specific artifact types and mirrors (`reports.mjs`, 57 PASS).

**Intelligence totals: 346 PASS / 0 FAIL across 9 suites.**

---

## 11. Testing

All suites executed read-only on this checkout (`node <file>`); counts are the
suites' own reported totals — nothing inflated, nothing added.

| Area | Suite(s) | PASS | FAIL |
|---|---|---|---|
| Intelligence | models 36 · sink 50 · jobs 79 · incidents 20 · alerts 30 · security 22 · reports 57 · determinism 20 · integration 32 | **346** | 0 |
| Scheduler | smoke 49 · regression-455 12 · regression-460 21 | **82** | 0 |
| Delivery | unit 29 · qa 17 · packaging 9 · security 13 · providers 13 · rollback 13 · accounting 6 · del78 7 · smoke 16 · verify-window 6 · zip-slip 10 · regression-454 12 | **151** | 0 |
| Orchestrator | unit 13 · state-machine 12 · approval 9 · policy 10 · accounting 7 · limits 10 · resume 4 · concurrency 11 · failure-isolation 3 · idempotency 6 · security 13 · regression-454 8 · regression-456 1 · regression-457 3 · regression-458 5 · smoke 1 · stress 1 · chain1 2 | **119** | 0 |
| Website Engine | unit 22 · smoke 10 · visual 2 · regression 2 (112 checks) | **36** | 0 |
| Brain package | brain 45 · context 32 · decision-engine 38 · execution-plans 31 · metrics 18 · planner 34 · policies 25 · reasoning 29 · rules 18 · state-machine 39 · strategy 19 | **328** | 0 |
| Other platform | runtime smoke (ALL PASS, uncounted) · communication 25 · memory 36 · artifacts 33 · validation 56 · discovery 145 · dossier 75 · pipeline 9 | **379** | 0 |
| Extra | artifacts/tests/path-containment 56 · pipeline/tests/checkpoint-isolation 7 | **63** | 0 |
| Secret scans | delivery/security/scan.js · delivery/qa/secret-scan.js | exit 0 ×2 | — |
| **TOTAL** | 66 counted suites + runtime smoke (67 files run) | **1,504** | **0** |

Warnings: none emitted by any suite. Skips: none. Notes: `runtime/smoke.mjs`
prints `ALL PASS` without a numeric count (no per-assert counter —
**T-1, P3/INFO**); website regression reports "2 PASS (112 checks total)".

There is **no documented single command for the full regression**; suites are
run per module. **T-2 (INFO)**: documenting the aggregate runner would make the
"51 existing suites + new" claim independently verifiable.

---

## 12. Storage / Data Integrity

- **Atomic writes**: temp-file + rename everywhere (`delivery/utils.js:46-49`,
  same pattern in orchestrator/intelligence/runtime/artifacts) — no torn
  writes.
- **Partitioning**: events, metrics and audit logs are day-partitioned NDJSON;
  scheduler state is a single `_jobs.json` + `_history.json`; orchestrator
  instance state is per-execution files with checkpoints; dossiers are
  versioned `v<N>` immutable sets.
- **Corruption handling**: `readJson`/`readNdjson` catch parse errors and
  return null/[] (empty-tolerant), locks have stale-TTL breaking
  (orchestrator lock manager).
- **Orphan/stale records**: no GC/retention job exists for intelligence event
  files, scheduler history, or audit logs; growth is unbounded by design until
  Phase 4.6.1 retention. **R-2 (P2)**.
- **Memory**: immutable version history with gzip of old versions + TTL
  expiration + regeneration of indexes on load; fingerprint indexes rebuilt
  from entries (no duplicate records).
- **Indexing**: discovery index, memory indexes, artifacts `_index.json`
  rebuildable; intelligence aggregates keyed deterministically
  (recompute-over-write, no duplicate aggregates).

---

## 13. Scalability (code-level review)

| Risk | Severity | Evidence / note |
|---|---|---|
| Whole-file NDJSON reads per query (events read, metrics readPoints, scheduler history rewrite) | P3 | `runtime/utils.js:63-67` readFileSync of full file; bounded per day, but a query over many days re-reads each file fully. Linear in days, acceptable at this scale |
| Unbounded raw stores (events, audit, scheduler history) without retention/compaction | P2 | design §31/§33 "retention/compaction job (4.6.1)"; daily partition growth |
| Caps enforce job cost | OK | intelligence config: lruCap 10000, bufferCap 1000, maxRows 50000, maxExecutions 500, maxRecords 2000, evidenceCap 50, maxWindows 7–48 |
| Sync, single-threaded file IO by design | INFO | deterministic by construction; no async race surface |
| Retry storms | none | backoff + maxAttempts everywhere; scheduler retries re-persist intent, bounded by `min(delay, 30000)` re-drain |
| O(n²) patterns | none found | all scans are single-pass over windowed inputs |
| Concurrency bottlenecks | none | per-business lock files (orchestrator) + single-writer rule (intelligence); serialized job kinds |

---

## 14. Code Quality

- **Dead code / unused exports**: no `TODO/FIXME/HACK/XXX` in source (grep
  0 hits); one tracked debug script `orchestrator/tests/_debug.mjs` (Q-2).
- **Swallowed exceptions**: catches are consistently comment-marked
  ("best-effort") — e.g. `pipeline/runner.js:55-61` (verified: single
  dispatch path with `if/else`, *not* a dual-emit; the empty `catch { }`
  there is intentional best-effort, Q-1/INFO).
- **Duplicated helpers**: sha256/hex16/atomicWrite/stableJson duplicated
  across 5 modules (see §3.4) — accepted by convention, worth a shared
  internal package only if a future phase creates a cross-module contract.
- **Naming**: consistent `createX` facades, `*-report` artifact types,
  `INT_/ORC_/DEL_/SCH_/MEM_/DIS_/WEB_` error-code prefixes. Opaque suite
  names (`del78`, `chain1-integrity`) are test-internal only.
- **Error handling**: typed error factories everywhere; unknown report kind /
  alert metric / job name throw typed errors.
- **Stale docs** flagged separately (§16).

---

## 15. Git / Repository Hygiene

| Check | Result |
|---|---|
| `.gitignore` | present, covers logs/node_modules/dist/.env/storage — consistent with convention |
| Tracked secrets | none (`git ls-files` grep for env/pem/key/credential/password/token → 0) |
| Tracked generated output | **436 files** under `website-engine/demo/sites/` (7 sites × static/react/vercel/preview/json) — deliberately committed demo artifacts earlier; consistent with the repo's "demo outputs are committed" convention, but inflates the tree and would stale-churn on re-demoo (INFO/P3) |
| Tracked debug scripts | `orchestrator/tests/_debug.mjs` (Q-2, P3) — remove from tracking when the convention tightens |
| Tracked storage/smoke internals | 0 (`storage/` ignored; `engine-smoke` untracked) |
| Large files | no `.zip`/`.ndjson`/`*.log` tracked; largest entries are the demo site bundles (SVG/HTML) — none above trivial size |
| node_modules / caches / .env | untracked |

---

## 16. Documentation Consistency

| Claim | Source | Actual | Verdict |
|---|---|---|---|
| Delivery "7 test suites — 97 PASS" | README + ARCHITECTURE inventory | 12 suites, **151 PASS** | **STALE (D-1, P3)** |
| Orchestrator "18 suites — 119 PASS" | README/ARCHITECTURE | 18 suites, 119 PASS | accurate |
| Intelligence "9 suites — 346 PASS" | README/ARCHITECTURE | 346 PASS | accurate |
| Brain totals (328) | ARCHITECTURE | 328 | accurate |
| Scheduler regression 82 | ARCHITECTURE | 82 | accurate |
| Website engine 36 (+22 unit etc.) | README | 36 (+112 checks) | accurate |
| Full regression "1148+"/"1576+" | ARCHITECTURE (two versions) | measured 1,504 + runtime + 112 checks | approximate (variant counts, runtime uncounted) — **allow slop (INFO)** |
| Module inventory lists all 14 current modules | ARCHITECTURE | intelligence row added; all present | accurate |
| Design doc §36.2 checklist | design | all items verified in this audit | accurate |

Undocumented public API surface (INFO): full option tables of
`createIntelligence` and `createOrchestratorSystem` are partially documented
in READMEs; constructor options are discoverable from code (`engine.js:24`,
orchestrator index) — acceptable, minor.

---

## 17. Backlog Review

| Item | Source | Status | Verdict |
|---|---|---|---|
| **SCH-01** (atomic persist+enqueue, replay) | design §6 | fixed + regression-460 (21 PASS) | resolved — verified in code (§9) |
| **SCH-02** (stop/close timer cleanup) | design §6 | fixed + regression-455 (12 PASS) | resolved — verified in code (§9) |
| **PRV-01** (vercel provider: dead `default` export + unknown readyState mapped to BUILDING, burning the 120 s verify window with misleading `PROVIDER_ERROR` — `delivery/providers/vercel/index.js:11, :70`) | design §6/§36.3 | disposition **C** — tracked separately in delivery maintenance | still valid; **should be fixed in the next phase before delivery analytics are trusted** (interacts with intelligence provider metrics) |
| 4.6.1 SHOULD HAVE: observations import, compare-experiment, priority hints, cost-efficiency, backfill job, retention job, digests | §36.1 | deferred | still valid |
| §34 open questions (retention durations, metrics series mode, brain metrics bridge, alert surfacing, backfill scope, artifact-type names, priority hints, report schedule) | design §34 | open, non-blocking; artifact-type names were decided (shipped in formats.js) | 1 resolved (artifact names); rest deferrable |
| §35 FUTURE (live adapters, dashboards, distributed workers, self-adaptation) | design §35 | backlog | still valid, deferred |
| Intelligence observability gaps (marker age in health report, alert surfacing = audit + digest + console) | §34.4 | shipped in 4.6.0 (health marker ages, alert-digest) | resolved for 4.6 |

**Blocking-before-next-phase: none.** Recommended-before-next-phase: PRV-01,
retention decision (start dates for retention enforcement).

---

## 18. Risk Matrix

### Blockers

None.

### Recommended fixes (P2)

| ID | Area | Finding | Severity | Evidence | Action |
|---|---|---|---|---|---|
| ID-1/D-1 | Determinism | Artifact ids are random UUIDs (`art-${randomUUID()}`) — content deterministic, ids not | P2 | artifacts/manager.js:3,124 | Decide policy: keep (run-registry semantics) or derive id from content hash; document explicitly either way |
| R-2 | Scalability/Storage | Unbounded growth of raw event/audit/scheduler-history partitions; no retention or compaction | P2 | design §31, §33 R-2; intelligence sink daily files; scheduler `_history.json` | Commit to retention policy (proposed 90 d events) and schedule 4.6.1 retention/backfill job |

### Technical debt (P3)

| ID | Area | Finding | Severity | Evidence | Action |
|---|---|---|---|---|---|
| ID-2 | Identity | buildId truncated to 64-bit hex (slice 16) | P3 | delivery/utils.js:19 | Log as accepted risk or widen to full hash |
| D-1 | Docs | Delivery test counts stale in README/ARCHITECTURE (97 → actual 151, 12 suites) | P3 | README (line ~208), ARCHITECTURE inventory | Refresh counts at commit time |
| D-2 | Docs | Full-regression totals are approximate; no single documented command runs everything; runtime smoke uncounted | P3 | ARCHITECTURE totals line; runtime/smoke.mjs | Add aggregate runner script + count runtime assertions |
| Q-1 | Quality | Best-effort `catch { }` sites (e.g. pipeline/runner.js:59) log nothing | P3 | pipeline/runner.js:55-61 | Log at debug level when a logger is present |
| Q-2 | Hygiene | `orchestrator/tests/_debug.mjs` tracked | P3 | git ls-files | Untrack when convention allows |
| H-1 | Hygiene | 436 generated demo-site files tracked | P3 | git ls-files (demo/sites) | Keep as convention or move to generated-ignored dir; document choice |
| A-1 | Architecture | sha256/hex16/atomicWrite/stableJson duplicated across 5 modules | P3 | runtime/utils.js, orchestrator/utils.js, delivery/utils.js, intelligence/ids.js, website-engine/utils.js | Consider a shared internal `platform-utils` only if a new phase adds a third consumer |

### Informational (INFO)

| ID | Area | Finding | Evidence |
|---|---|---|---|
| I-1 | Identity | businessId provenance unnormalized across discovery sources; fixture conventions diverge (`biz-N` vs `dis-<area>-N`) | discovery/engine.js:162; orchestrator/tests/helpers.mjs; intelligence/tests/helpers.mjs |
| I-2 | Scheduler | Dispatch recovery runs only when boot queue is empty | scheduler/engine.js `_recoverDispatches` |
| I-3 | Bus | Different bus conventions by phase (own bus in communication; injected bus in intelligence) | communication/bus.js; intelligence/engine.js:50-62 |
| I-4 | Docs | Module option tables partially documented | createIntelligence options (intelligence/engine.js:24) |

---

## 19. Scores

| Dimension | Score | Rationale |
|---|---|---|
| Architecture | 9.0 | Clean upstream-only layering, adapter-based inversion, one deliberate duplication surface |
| Security | 9.0 | No exec, no secrets, containment suites green, redaction at write; no P0/P1 |
| Determinism | 8.0 | Full byte-reproducibility verified; artifact-id randomness is the sole gap (P2) |
| Idempotency | 9.0 | Watermarks, markers, locks, fingerprints, journals — all with passing tests |
| Reliability | 9.0 | Crash recovery across scheduler/orchestrator/intelligence; killswitch everywhere |
| Data Integrity | 8.0 | Atomic writes + immutable versions; retention gap (R-2) keeps it under 9 |
| Testing | 9.0 | 1,504 assertions green, security + determinism + crash-injection coverage; lacks one documented aggregate runner |
| Observability | 8.0 | Redacted audit/traces everywhere, intelligence health + reports; brain metrics bridge still an open question |
| Scalability | 7.0 | Capped jobs, partitioned stores, no O(n²); whole-file reads + unbounded retention hold it back |
| Documentation | 7.0 | Accurate at module level; stale delivery counts + approximate regression totals |
| Repository Hygiene | 7.0 | Clean ignore rules and no secrets; 436 generated demo files + a debug script tracked |

**OVERALL PLATFORM SCORE: 8.2 / 10.**

---

## 20. Next-Phase Readiness

**READY WITH CONDITIONS**

The v1.7.0 architecture is structurally ready for another major phase:

- Any new module can plug in through the existing patterns (facade + injected
  runtime seam + artifacts + scheduler registration + storageRoot isolation).
- Observability is in place for a phase that needs signals (metrics, events,
  incidents, deterministic reports).
- CI-able test surface is uniform.

Conditions before committing to the next phase:

1. **Fix or formally disposition PRV-01** (vercel provider verify behavior) —
   it directly distorts `provider.*` intelligence metrics.
2. **Make and record the retention decision** (event/audit retention window)
   — required before long-running production use; 4.6.1 retention job is the
   vehicle.
3. **Resolve ID-1 policy** (deterministic vs random artifact ids) so the
   next phase's contracts can rely on one convention.
4. **Refresh documentation counts** and add the single aggregate regression
   command (D-1/D-2 — cheap, mechanical).

None of these block *starting* design work; they prevent silently carrying two
P2s into the next phase.

---

## 21. Final Recommendation

Proceed with the next phase on the v1.7.0 base. The platform's strongest
assets — deterministic identity + byte-reproducible outputs, crash-injected
idempotency, and a uniformly green 1,500-assertion test surface — are exactly
what a five-stage autonomous pipeline needs. Treat the four conditions in §20
as entry criteria rather than blockers: handle PRV-01 + retention in the
first hardening slice of the next phase, decide the artifact-id policy, and
refresh the documentation counts alongside. No architecture change is
required or recommended from this audit.