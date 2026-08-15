# Phase 4.7.0 Implementation Report — Foundation & Trust

> `AgencyOS` hardening release (4.7.0): entry-criteria fixes (PRV-01, ID-1,
> scheduler cron shape + minute-boundary bug) and the observations ingestion
> pipe with retention sweeps and explicit backfill. Design:
> `PHASE4_7_DESIGN.md` (binding). Scope split per §27: this report covers
> **4.7.0 only**. 4.7.1 (evaluation/experiments) and 4.7.2 (advisory
> adaptation) are **not** implemented.

## 1. Architecture Report

### 1.1 What shipped (4.7.0 only)

| Area | Change |
|---|---|
| **PRV-01** `delivery/providers/vercel/index.js` | `verify()` now maps `readyState` through `VERCEL_KNOWN_STATES`: `READY` → ready; `INITIALIZING`/`QUEUED`/`BUILDING` → in-progress; `ERROR`/`CANCELED`/`ERRORED` → terminal (errorCode surfaced). **Missing or unknown readyState throws a retryable `PROVIDER_ERROR`** (`{retryable:true}` meta) instead of polling until the verification window burns. Dead default export removed. |
| **ID-1** `artifacts/manager.js` | New artifact ids are deterministic content addresses: `art-<sha256("key\|v<version>")[0..16]>`. Same `(project, workflow, type, name, version)` → same id on any storage. `randomUUID` no longer used. Legacy random ids remain **readable via the index** (dual-read) — existing stores stay queryable, no migration. |
| **Scheduler cron shape** `scheduler/engine.js` | `validateSchedule` accepts `{type:'cron', expr}` and normalizes it to the same shape as legacy `{cron: expr}` — JobFramework-registered intelligence jobs (which pass `{type:'cron', expr}`) now validate and auto-fire. |
| **Scheduler minute-boundary bug** `scheduler/cron.js` | 5-field (minute-granular) crons computed `nextRunAt` as now+1s → re-fired every tick. Fixed: next run starts at the next minute boundary (`setSeconds(0,0)` + 60000ms). 6-field (seconds) crons unchanged. Verified: `* * * * *` → next minute boundary; `30 6 * * *` → next 06:30. |
| **Observations pipe** `intelligence/observations/` | `ObservationStore` (daily NDJSON + watermark + LRU dedupe 10000 + persisted disk dedupe, window/kind/business reads, `count()`, `statsSnapshot()`) · `importObservations` (two-phase validate-then-apply; caps 5000 rows / 1 MB batch / 64 KB row; secret scan → whole-batch reject with per-row reasons; orphan flag via `reader.hasExecution`; payload redaction at rest; byte-stable receipts) · `errors.js` (`OBS_CODES`, `obsError`) · `index.js` facade (`OBSERVATIONS_API_VERSION = '1.0'`). |
| **Observation/batch ids** `intelligence/ids.js` | `observationIdFor` → `obs-<hex16 sha256>`; `batchIdFor` → `batch-<hex16 sha256(stableStringify(normalized))>` — pure functions of content. |
| **RecordsReader** `intelligence/jobs/records.js` | `hasExecution(executionId)` — sanitized existence check on `instances/<id>/decision.json` for orphan detection. |
| **Retention job** `intelligence/jobs/retention.js` + `engine` delegation | `runRetentionSweep({dryRun, now})`: removes expired day files (events/metrics/observations, strictly older than cutoff), insights + metric aggregates (by window.end), terminal **resolved/closed** incidents/alerts past cutoff (live never deleted), scheduler history **report-only** (scheduler-owned), artifact expiry delegated to `ArtifactManager.cleanup({expire:true,dryRun})` + `sweepExpired()`; unreadable files never deleted; atomic rewrites of `current.json`; returns `filesRemoved/bytesFreed/retentionConfig/job` + records `retention.filesRemoved`/`retention.bytesFreed` metric points. Runs as daily job `intelligence:retention` (`0 5 * * *`), completing 9-job set. |
| **Backfill** `intelligence/jobs/backfill.js` + `engine` delegation | `runBackfill({from,to,jobs,maxWindows=90,now})`: explicit range recompute, persisted marker `intelligence_backfill.json` (Windows-safe name, `rangeKey = hex16(sha256(from|to|targets|maxWindows))`), resumable (completed `name|windowStart` skipped), killswitch-abort persists `status:'aborted'`, future windows never processed, unknown job → `INT_UNKNOWN_JOB`, `from >= to` → `INT_INVALID_CONFIG`, marker written only after each window's run succeeds. |
| **Config** `intelligence/config/` + schema | `jobs.retention` (`0 5 * * *`, windowMs 86400000, maxWindows 7, version 1) and `retention` section (rawEventsDays/rawMetricsDays/observationsDays 90, incidentsDays/alertsDays/aggregatesDays 730, enableSweeps) + `observations` caps (lruCap, maxRowsPerBatch, maxBytesPerBatch, maxRowBytes); derived metrics `retention.filesRemoved`/`retention.bytesFreed`; `intelligence-config.schema.json` extended. |
| **Regression runner** `scripts/regress.mjs` | Single command discovers and runs every `*/tests/*.mjs` suite + module-root smoke/regression suites across the monorepo, per-suite pass/fail counts (`PASS`/`FAIL`, `ok N`, `N passed, N failed` patterns), aggregate totals, `--only` filter. Entry for every future phase. |
| **Docs refresh (D-1)** | root `README.md`, `ARCHITECTURE.md`, `intelligence/README.md`, `artifacts/README.md`, `scheduler/README.md`, `delivery/README.md` updated additively; this report added. |

### 1.2 Storage + wiring

`IntelligenceEngine` constructs `ObservationStore` from `storageRoot`, loads the
two observation schemas via the existing validator, exposes
`engine.importObservations({items, source, batchId, caps})`,
`engine.runRetentionSweep({dryRun, now})`, `engine.backfill({from, to, jobs,
maxWindows, now})`, `ctx.observations`, `ctx.root`, and reports
`observations`/`observationsBytes` in snapshot + health. Observation schemas
were already present in `intelligence/schemas/` (no new schema files).

## 2. Determinism / Idempotency

- `observationId`/`batchId` are pure content hashes (schema-required:
  `^obs-[0-9a-f]{16}$`, `^batch-[0-9a-f]{16}$`). Re-importing the same batch
  yields `accepted=0, duplicates=N`; importing identical content on a fresh
  store under a fixed clock yields a **byte-identical receipt**.
- Re-running the retention job over already-swept storage is a no-op; dry-run
  never mutates; scheduler history is not touched by sweeps.
- Backfill re-runs over a completed range return 0 windows; the marker is keyed
  by the full range + job set, so a different range starts its own session.
- Integration suite updated to the 9-job set (32 PASS).

## 3. Security

- Whole-batch rejection on any secret-pattern match (`sk-` known-prefix etc.),
  with defense-in-depth redaction at rest — `tests/security-470.mjs` runs the
  full jobs + retention + imports + backfill cycle and diff-scans storage:
  **nothing outside intel-storage changed**; brain verdicts/config/policy
  untouched by observations; `scanText` finds no secrets in stores.
- Path containment + id sanitization reused everywhere (`hasExecution`,
  retention paths, marker filenames — `intelligence_backfill.json` avoids the
  Windows-illegal `:`).

## 4. Verification

| Suite | Result | Coverage |
|---|---|---|
| `intelligence/tests/observations.mjs` | 41 PASS | valid import, idempotent re-import, byte-stable receipts across fresh storages, persisted dedupe across restarts, pure ids, row/batch rejection, size caps, secret whole-batch rejection, orphan flags, redaction at rest, window/kind reads, store snapshot+watermark |
| `intelligence/tests/retention.mjs` | 30 PASS | dry-run reports/doesn't delete, sweep of 7 expired files across all areas, live incident/alert preserved, idempotent re-run, scheduler history report-only + untouched, job via framework (marker + metric points + insight), disabled-by-config insight |
| `intelligence/tests/backfill.mjs` | 11 PASS | 2 daily windows, deterministic rangeKey, no-op resume, killswitch abort persisted (`aborted`), full range after marker removal, future windows never processed, arg validation, recompute-over-write |
| `scheduler/tests/cron-shape.mjs` | 16 PASS | legacy `{cron}` normalized, `{type:'cron',expr}` accepted + `cronExpr` surfaced, due cron auto-fires exactly once via scheduler tick with advanced nextRunAt, dispatches journaled, **E2E: `intelligence:retention` registers in the scheduler and executes through the tick** (marker completed + insights), invalid expr → `E_SCH_CRON_INVALID` |
| `delivery/tests/vercel-verify.mjs` | 17 PASS | READY→ready, in-progress states, terminal states, errorCode surfaced, missing/unknown→retryable `PROVIDER_ERROR`, provider id/dryRun/deploy guard unchanged |
| `artifacts/tests/deterministic-ids.mjs` | 6 PASS | `art-<16hex>` pattern, pure across storages, deterministic v2, legacy random id readable via index |
| `intelligence/tests/security-470.mjs` | 14 PASS | storage-diff after full cycle, brain/config untouched, secrets redacted + `scanText` clean, golden-file determinism after marker wipe + rerun, retention guards, empty sweep no-op |
| `intelligence/tests/integration.mjs` | 32 PASS (updated) | 9-job assertions for `runJobs` + `health.markers` |
| **Full platform regression** | **74 suites — 1661 PASS, 0 FAIL** | `node AgencyOS/scripts/regress.mjs` — exit 0, 0 suites with failures |

Secret scans: `delivery/security/scan.js` + `delivery/qa/secret-scan.js` clean
(re-run green during regression; scanText-based checks in security-470 green).

## 5. Demo

`node intelligence/demo-470.mjs` — deterministic, offline evidence:

1. boot on fixed fixtures (9 jobs, 9 scheduler registrations, 77 insights)
2. observation ingestion: accepted 3/0 rejected, deterministic batch + obs ids,
   re-import → 3 duplicates, **byte-identical receipt on fresh storage**,
   secret row rejected (`known-prefix`), orphan flags
3. PRV-01 taxonomy across 8 readyStates: READY/4 in-progress/2 terminal +
   missing & unknown → retryable `PROVIDER_ERROR`
4. ID-1: identical artifact ids on two independent storages; legacy id dual-read
5. retention: dry-run `would remove 4 files`, real sweep removes 4, live
   incident kept, scheduler history report-only
6. **scheduler auto-fire**: `intelligence:retention` `0 5 * * *` registered;
   due job fires through the scheduler tick → marker `completed`, retention
   insights written, journaled history — proof the framework → scheduler cron
   wiring executes jobs, not just direct `runJob` invocation
7. backfill: 2 windows, re-run 0 (idempotent), future range 0

Scheduler minute-boundary verification: `* * * * *` → next minute boundary,
isolation test fired exactly once with nextRunAt advanced.

## 6. Rollout & Backlog Disposition

- **PRV-01** — disposition **A/B** (fixed in 4.7.0; audit condition §20.1 closed).
- **ID-1** — fixed in 4.7.0; legacy records readable — no migration needed.
- **Retention job** — shipped as a daily job + engine delegation (audit
  condition 2 of the v1.7.0 audit closed).
- **4.7.1 / 4.7.2** — explicitly **not implemented**: compare-experiment,
  campaign-evaluation, policy/strategy version stamping, cost-efficiency,
  priority hints, digest polish, auto-learning, auto-apply. No decision-version
  fields, no hint ordering, no budget/policy mutation paths were added.

## 7. Production Readiness Checklist (4.7.0 DoD)

- [x] All 7 new suites green (observations 41, retention 30, backfill 11,
      cron-shape 16, vercel-verify 17, deterministic-ids 6, security-470 14)
      + integration updated (32) + full platform regression 1661 PASS / 0 FAIL.
- [x] Receipts golden byte-stable; determinism pipeline extended.
- [x] Zero cross-store writes (storage-diff), no brain/config mutation, secret
      scan exit 0.
- [x] PRV-01 taxonomy verified; provider metrics uncontaminated.
- [x] All 9 intelligence jobs register with the scheduler; cron auto-fire E2E
      proven through the tick (journaled); killswitch abort honored by
      backfill + retention (flow-through + tests).
- [x] Demos offline (demo.mjs + demo-470.mjs); artifact ids deterministic;
      legacy ids readable.
- [x] Docs refreshed; backlog disposition recorded; 4.7.1 NOT started.