# Phase 4.4 Implementation Report — Autonomous Website Delivery & Deployment

> `AgencyOS/delivery/` — takes an immutable, QA-passed website build and
> delivers it through an approval gate to a hosting provider, recording every
> step in a state-machine ledger with rollback support. API version 1.0.

## 1. Architecture Report

The delivery system is the last consumer in the chain:

```
Business Dossier (4.1) → Pipeline (4.2) → Website Engine (4.3)
  → Delivery & Deployment (4.4) → Provider (local / mock / vercel)
```

It consumes a production build tree plus its final QA report and produces an
immutable package, an approval-gated deployment, a persisted record, and — on
demand — a rollback/revert that re-promotes previous immutable deployments.

### 1.1 Module Inventory

| File | Responsibility |
|---|---|
| `index.js` | `DeliverySystem` facade: `deliver` `approve` `reject` `deploy` `rollback` `revert` `approveRollback` `history` `getRecord` `registerProvider` `attachScheduler` `attachBrain` `on/off/emit/close`; re-exports `DELIVERY_API_VERSION`, `PROVIDER_IDS`, `DEPLOY_MODES`, `DELIVERY_EVENTS` |
| `errors.js` | `DEL_CODES` (16 codes) + `deliveryError` |
| `utils.js` | `sha256` `buildIdFor` `recordIdFor` `stableJson` `sortedKeys` |
| `deployment/` | `manager.js` (gates, mode handling, retry+verify, transitions, audit), `state.js` (17 states, 18 events, transition table), `retry.js` (classify/retry/poll), `dryrun.js` (simulated plan) |
| `rollback/index.js` | `RollbackManager` — approve, rollback (promote), revert (re-promote) |
| `build/index.js` | `ProductionBuildManager` — deterministic production tree + `delivery-meta.json` |
| `qa/` | `FinalQA` — report persistence, links/assets/SEO/secret gates against the production tree |
| `security/` | `scan.js` (AWS keys, known prefixes, key/value, bearer), `redaction.js` (stable key-aware redact + `safeForLog`), `vault.js` (env-only `DELIVERY_*`) |
| `packaging/` | manifest + immutable zip bundle + sha256 linkage + pruning |
| `providers/` | registry + `local` (disk + `current.json` alias) + `mock` (`queueFailure`) + `vercel` (recorded fixtures) |
| `artifacts/builders.js` | `deployment-report` + `qa-report` artifacts via the Phase 4 artifacts engine |
| `memory/bridge.js` | business-scoped deployment facts |
| `scheduler/jobs.js` | `delivery.deploy` job spec |
| `brain/events.js` `brain/capability.js` | `DELIVERY_EVENTS`, DEPLOY/ROLLBACK executors |
| `schemas/` | 8 JSON schemas (deployment-record id `^dep_[0-9a-f]{16}$`) |
| `tests/` | 7 offline suites (97 tests) |
| `demo/` | offline lifecycle demo (local + mock providers) |

### 1.2 Identity & Immutability

- `buildId = sha256(businessId|dossierVersion|pipelineRunId|engineOutputChecksum).slice(0,16)`
- `recordId = dep_<buildId>` — no timestamps or randomness in identities.
- Packages are immutable zip bundles; every deploy re-verifies the bundle
  SHA-256 against the manifest before calling the provider.
- Rollback promotes a previous immutable deployment via the provider alias;
  previous records are never mutated.

### 1.3 Delivery Modes & Gates

| Mode | Behavior |
|---|---|
| `dry-run` | preflight + simulated plan (`simulated: true`), zero provider contact |
| `explicit` | `awaiting_approval` until `approve()`; `reject()` terminates |
| `auto` | immediate deploy — disabled unless `DELIVERY_AUTO_ALLOWED=true` |

Gates are enforced inside the manager, not trusted by callers:

- **QA gate** — report must exist and pass at record creation *and* again
  immediately before the provider call (`E_DEL_QA_FAILED`).
- **Secret gate** — `scanFiles` over the production tree; any hit blocks the
  delivery (`E_DEL_QA_FAILED` family).
- **Preflight** — `provider.validateConfig()` before every provider call.
- **Retry policy** — 429 / 5xx / `E_TR_*` retried with backoff (`RETRY`
  timeline events); auth failures (`E_DEL_AUTH_FAILED`) never blind-retried.
- **Verification** — `provider.verify(id)` polled until `READY` before the
  record is finalized.

### 1.4 State Machine

```
created → packaged → awaiting_approval → approved → deploying → deployed → verified → recorded
              │            │                   │          │
              │            └─ rejected          └── RETRY self-loop ─┘
              └─ simulated (dry-run)
recorded → rollback_requested → rolled_back → reverting → reverted
```

`applyTransition` throws `E_DEL_BAD_STATE` on illegal moves; every transition
is appended to `record.timeline` with actor and timestamp. Terminal states:
`simulated` `rejected` `failed` `recorded` `rolled_back` `reverted`.

### 1.5 Security Model

- Secret patterns: AWS access keys (`AKIA…`), known prefixes
  (`sk-` `ghp-` `gho-` `xox*` `vk-` `glpat-`), key/value pairs, bearer tokens —
  typed `known-prefix` / `aws-access-key` / `key-value-secret` / `bearer-token`.
- `SecretVault` reads only `DELIVERY_*` env vars (case-sensitive);
  `knownSecretValues()` feed redaction so vault values never appear in
  records, manifests, artifacts, memory, or the NDJSON audit log.
- `redact()` is key-aware and byte-stable. The entropy heuristic was removed
  after it redacted ordinary provider project names (`local-demo-cafe-001`) —
  string values are now redacted only on scan/vault matches.

### 1.6 Integrations

- **Artifacts** — `writeRecord` (type `deployment-report`) and `writeQaReport`
  (type `qa-report`); `deployment-report`/`qa-report` were added to
  `artifacts/formats.js` `ARTIFACT_TYPES`/`TYPE_LABELS`.
- **Memory** — `business:<id>` / `deployment:<recordId>` facts per deployment.
- **Scheduler** — `delivery.deploy` job triggers `executeDeploy`.
- **Brain** — DEPLOY/ROLLBACK executor registration.

### 1.7 Fixed During Implementation

- **Facade property/method collision** — `this.rollback = new RollbackManager`
  shadowed the prototype `rollback()` method, producing
  `system.rollback is not a function`; renamed to `this.rollbackManager`.
- **Redaction false positives** — entropy-based redaction replaced project
  names (`local-dbg-med-001`) with `[REDACTED]`, breaking provider configs;
  entropy heuristic removed from `redact()`.
- **`_finalizeRecord` signature** — passed a bare record to a
  `{ kind, record }` API; `writeQaReport` was never called. Now writes both
  artifacts with the correct signature.
- **RETRY timeline gating** — `attempt > 1` suppressed the first retry event
  (runtime retry reports the failed attempt number); all three retry call
  sites now record every retry with the upcoming attempt number.
- **Provider registry** — `get` now constructs factories with
  `new factory(config, ctx)`.
- **Zip integrity** — `readZip` silently drops CRC-corrupt entries instead of
  throwing (deterministic; test asserts the dropped entry).
- **QA report persistence** — `loadReport` returns `null` when missing
  (manager converts to `E_DEL_QA_FAILED`); QA runs against the assembled
  production tree (incl. `delivery-meta.json`).
- **Links validator** — external schemes compared without `:` (was rejecting
  `https:` links).
- **Secret scan** — AWS access keys split into their own pattern; separator
  `[-_]` required after known prefixes.
- **Schema** — `trace.dossierVersion` persisted as Number (schema is
  integer|null, not string).
- **Artifact types** — `deployment-report` / `qa-report` registered in the
  artifacts engine type registry (`E_AR_TYPE_UNKNOWN` fixed).

## 2. Verification

```
delivery/tests/unit.mjs       27 PASS  state machine, events, errors, retry policy, redaction,
                                       vault, registry, schemas
delivery/tests/qa.mjs         17 PASS  report persistence, links/assets/SEO gates, secrets,
                                       checksum linkage, determinism
delivery/tests/packaging.mjs   9 PASS  manifests, sha256 linkage, zip write/read, pruning
delivery/tests/security.mjs   10 PASS  vault values never leak to records/manifests/logs,
                                       secret gate, scan types, stable redaction
delivery/tests/providers.mjs  13 PASS  provider interface contract, mock lifecycle + failures,
                                       local deploy/promote, vercel fixtures (no network)
delivery/tests/rollback.mjs    9 PASS  approval gate, promotion + alias flip, dry-run, revert,
                                       invalid-target rejection
delivery/tests/smoke.mjs      12 PASS  full chain, deterministic rebuild, QA/approval gates with
                                       zero provider contact, retry, auth non-retry, artifacts,
                                       memory, deployed event
```

**Delivery total: 97 PASS, 0 FAIL — all offline.**

## 3. Demo

```
node AgencyOS/delivery/demo/demo.mjs
```

Seven lifecycle scenarios (dry-run, approval gate, rejection, QA-fail block,
transient retry, auth failure, rollback + revert) run entirely against the
`local` and `mock` providers with zero network, writing to gitignored
`storage/delivery-demo/`.
