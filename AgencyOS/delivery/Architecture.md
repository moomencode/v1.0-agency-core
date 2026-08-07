# Delivery & Deployment Architecture — Phase 4.4

> `AgencyOS/delivery/` — Autonomous Website Delivery & Deployment. API 1.0.

## 1. Pipeline position

```
┌─────────────┐   ┌─────────────┐   ┌──────────────┐   ┌──────────────────────┐
│ Website     │   │ Build 4.3   │   │ Delivery 4.4 │   │ Provider            │
│ Engine      │ → │ prod tree + │ → │ build/QA/    │ → │ local / mock /      │
│ (4.3)       │   │ manifest    │   │ package/     │   │ vercel (offline     │
│             │   │             │   │ approve/deploy│   │ fixtures in tests)  │
└─────────────┘   └─────────────┘   └──────────────┘   └──────────────────────┘
                                        │ rollback / revert (promote previous package)
                                        ▼
                              storage/delivery/records|packages|local
                              logs/delivery/ (redacted NDJSON)
```

The delivery system consumes a production build tree plus its QA report. Its
contract with Phase 4.3 is stable: deterministic `buildId`, per-file SHA-256
manifest, and a final QA report object — anything else fails loudly.

## 2. Module inventory

| File | Responsibility |
|---|---|
| `index.js` | `DeliverySystem` facade: `deliver` `approve` `reject` `deploy` `rollback` `revert` `approveRollback` `history` `getRecord` `registerProvider` `attachScheduler` `attachBrain` `on/off/emit/close`; re-exports `DELIVERY_API_VERSION`, `PROVIDER_IDS`, `DEPLOY_MODES`, `DELIVERY_EVENTS` |
| `errors.js` | `DEL_CODES` (16 codes) + `deliveryError` (default `retryable` only for `E_TR_*` codes) |
| `utils.js` | `sha256` `buildIdFor` `recordIdFor` (deprecation `dep_<buildId>`) `sortedKeys` `stableJson` `redactPath` |
| `deployment/manager.js` | `DeploymentManager`: gate enforcement (QA exists+passed, bundle checksum, provider preflight), mode handling, dry-run plan, `deliveryRetry` + `pollUntil` on provider calls, state-machine transitions, `_fail`/`_finalizeRecord`, integration bridges, redacted audit log |
| `deployment/state.js` | states (17), `DEPLOY_EVENTS` (18 incl. `APPROVAL_NEEDED`), transition table, `applyTransition` (throws on invalid), `TERMINAL_STATES` |
| `deployment/retry.js` | `classifyProviderError` (429/5xx → retryable), `shouldRetryDelivery`, `deliveryRetry` (wraps runtime retry, records `RETRY` timeline events), `pollUntil` (READY predicate) |
| `deployment/dryrun.js` | `buildDryRunReport` — simulated plan (`simulated: true`) with provider `dryRun` |
| `rollback/index.js` | `RollbackManager`: `_previousRecord` (newest recorded sibling), `_verifyPrevious` (manifest + QA + checksum), `approveRollback` (seeds rollback + revert approvals), `rollback` (promote previous deployment), `revert` (re-promote original); previous records never mutated |
| `build/index.js` | `ProductionBuildManager`: production tree from engine output, `delivery-meta.json`, deterministic `buildId` |
| `qa/index.js` | `FinalQA`: report persistence (`loadReport` → null when missing), checksum linkage, link/asset/SEO/a11y gates |
| `qa/links.js` | internal/external link resolution against the production tree (external schemes validated) |
| `qa/assets.js` | asset presence + reference checks |
| `security/scan.js` | `scanText`/`scanFiles`: AWS access keys, known prefixes (`sk/ghp/gho/xox*/vk/glpat`), key/value secrets, bearer tokens; types `known-prefix`/`aws-access-key`/`key-value-secret`/`bearer-token` |
| `security/redaction.js` | `redact` (stable, key-aware) + `safeForLog` (always returns a string with `[REDACTED]`); entropy heuristic removed to avoid false positives on project names |
| `security/vault.js` | `SecretVault`: env-only (`DELIVERY_*`), case-sensitive, exposed via `knownSecretValues()` |
| `packaging/index.js` | `PackagingManager`: manifest (JSON), immutable zip bundle, `sha256` linkage, pruning (keeps live packages) |
| `packaging/zip.js` | `writeZip`/`readZip` (zero-dependency DEFLATE); CRC-corrupt entries silently dropped, not fatal |
| `providers/index.js` | `ProviderRegistry`: `register`/`get` (constructs with `new factory(config, ctx)`)/`has` |
| `providers/local.js` | disk provider: `validateConfig`, `deploy` (immutable dir + `current.json` alias), `verify`, `promote`, `dryRun` |
| `providers/mock.js` | test provider with `queueFailure` (status/code/retryable) for retry + auth scenarios |
| `providers/vercel.js` | Vercel client (recorded fixtures in tests, never live network) |
| `providers/vercel-fixtures/` | recorded HTTP fixtures for the vercel tests |
| `artifacts/builders.js` | `DeliveryArtifacts`: `writeRecord` (type `deployment-report`), `writeQaReport` (type `qa-report`) via the Phase 4 artifacts engine |
| `memory/bridge.js` | `DeliveryMemory.record` → `business:<id> / deployment:<recordId>` facts |
| `scheduler/jobs.js` | `deploymentJobSpec` — `delivery.deploy` job triggering `manager.executeDeploy` |
| `brain/events.js` | `DELIVERY_EVENTS` map |
| `brain/capability.js` | `DELIVERY_ACTIONS` (DEPLOY/ROLLBACK), executor registration |
| `schemas/` | 8 JSON schemas: delivery-request, deployment-record (`^dep_[0-9a-f]{16}$`), build-record, qa-report, package-manifest, provider-config, approval, rollback-record |
| `tests/` | 7 offline suites (97 tests) |
| `demo/` | offline lifecycle demo (local + mock providers) |

## 3. Delivery state machine

```
created → packaged → awaiting_approval → approved → deploying → deployed → verified → recorded (terminal)
              │            │                   │           │
              │            └─ rejected (terminal)          ├─ RETRY self-loop (backoff)
              │                                            └─ deploy fail → failed (terminal)
              └─ simulated (terminal, dry-run)

recorded → rollback_requested → rolled_back (terminal, dry-run) → reverting → reverted (terminal)
```

Transitions are enforced by `applyTransition`, which throws `E_DEL_BAD_STATE`
on illegal moves; every transition is appended to `record.timeline` with
actor/timestamp.

## 4. Deployment flow (explicit mode)

```
deliver({ buildId, mode:'explicit' })
  ├─ buildRecord + QA report must exist and pass (E_DEL_QA_FAILED otherwise)
  ├─ packageBuild → immutable manifest + zip (deterministic buildId)
  ├─ record created → PACKAGED → APPROVAL_NEEDED → awaiting_approval (persisted)
approve(recordId)
  ├─ validates approval schema, gates still re-checked inside executeDeploy:
  │    QA report re-load + passed, bundle sha256 vs manifest, provider.validateConfig
  ├─ provider.deploy(bundle) inside deliveryRetry (429/5xx/E_TR_* retried, RETRY events)
  ├─ provider.verify(deploymentId) → READY via pollUntil
  └─ RECORDED → _finalizeRecord: artifacts (deployment-report + qa-report), memory facts,
       delivery.deployed event, redacted audit line
```

Failure at any step persists `record.error` (redacted), emits `delivery.failed`,
and rethrows — the record is terminal `failed`, never retried by callers.

## 5. Rollback flow

```
approveRollback(recordId)          → record.approvals += rollback approval; seeds revertApproval
rollback({ recordId, mode })       → requires explicit approval in explicit mode
  ├─ _previousRecord: newest recorded sibling (same business, older buildId)
  ├─ _verifyPrevious: manifest + QA + checksum of previous package
  ├─ dry-run: provider.dryRun({packageId}) → record.dryRun (simulated), still rolled_back
  └─ real: deliveryRetry(provider.promote(prev.deploymentId)) → verify READY → rolled_back
revert({ recordId, mode })         → only from rolled_back; re-promotes original deployment → reverted
```

The provider's alias (`current.json` on local) is flipped; the previous record
is never touched, so history stays immutable.

## 6. Security model

- Secrets are scanned on the production tree at QA time (`scanFiles`) — any hit
  fails the gate (`E_DEL_QA_FAILED` family).
- `SecretVault` reads only `DELIVERY_*` env vars; `knownSecretValues()` feeds
  redaction so vault values never appear in records, manifests, artifacts,
  memory, or audit logs.
- `redact()` is key-aware and byte-stable; string values are redacted only when
  they match a scan pattern or vault value (no entropy heuristic → provider
  project names like `local-demo-cafe-001` survive unchanged).
- Audit log: NDJSON, one file per day, every line passed through `safeForLog`
  (guaranteed string with `[REDACTED]`).
- Providers never receive credentials from records — `target` is redacted at
  record time and re-validated by `validateConfig` preflight.

## 7. Integration contract

| Integration | Facade wiring |
|---|---|
| Artifacts (Phase 4) | `setIntegrations({ artifacts: DeliveryArtifacts })` → `deployment-report` + `qa-report` types |
| Memory (Phase 4) | `setIntegrations({ memory: DeliveryMemory })` → business-scoped deployment facts |
| Scheduler | `attachScheduler(scheduler)` → `delivery.deploy` job spec |
| Brain | `attachBrain(brain)` → DEPLOY/ROLLBACK executors |

Integration failures are logged and never break deployment finalization.
