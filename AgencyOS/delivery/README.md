# Autonomous Website Delivery & Deployment — Phase 4.4

`AgencyOS/delivery/` — takes an immutable, QA-passed website build and delivers
it through an approval gate to a hosting provider, recording every step in a
state-machine ledger with full rollback support. API version 1.0.

```
Production Build → Final QA → Immutable Package → Approval Gate → Provider Deploy → Record
```

## Quick start

```js
import { createDeliverySystem } from './delivery/index.js';

const system = createDeliverySystem({ root: './storage/delivery' });

// 1. production build + final QA + immutable package (buildId = content hash)
const { buildId } = await system.builds.build(businessId, { site, validation, trace });
const tree = system.builds.readTree(buildId);
const qaReport = system.qa.run({ buildId, site, validation, buildRecord, files: tree });
system.packaging.packageBuild({ buildId, buildRecord, qaReport, tree });

// 2. request a delivery — dry-run is the default, provider untouched
const pending = await system.deliver({ buildId, mode: 'explicit', provider: 'local', target: { project } });

// 3. human approval gate — only then does the provider get called
const record = await system.approve(pending.id, { by: 'operator' });
// record.status === 'recorded', record.timeline shows DEPLOY_START → DEPLOY_OK → VERIFY_OK → RECORDED

// 4. rollback (explicit mode requires its own approval) and revert
await system.approveRollback(record.id, { by: 'ops' });
const { original, previous } = await system.rollback({ recordId: record.id, mode: 'explicit', by: 'operator' });
const reverted = await system.revert({ recordId: record.id, mode: 'explicit', by: 'operator' });
```

## Delivery modes

| Mode | Behavior |
|---|---|
| `dry-run` | Full preflight (QA re-check, package checksum, provider config) — produces a simulated plan, never calls the provider |
| `explicit` | Record enters `awaiting_approval`; `approve()` must be called before any provider contact; `reject()` terminates |
| `auto` | Deploys immediately — disabled unless `DELIVERY_AUTO_ALLOWED=true` |

## Guards (all enforced inside the manager, not trusted by callers)

- **QA gate** — the final QA report must exist and pass at `createDeployment` time
  and again immediately before the provider call; a broken link or detected
  secret (`sk-…`, AWS keys, tokens, key/value pairs) blocks with
  `E_DEL_QA_FAILED` / `E_DEL_SECRET_DETECTED`.
- **Immutable packages** — `buildId = sha256(businessId|dossierVersion|pipelineRunId|engineOutputChecksum).slice(0,16)`;
  every deploy re-verifies the bundle SHA-256 against the package manifest.
- **Approval gate** — explicit mode persists `awaiting_approval` until
  `approve()`; rollback/revert in explicit mode each require their own
  `approveRollback()` approval.
- **Retry policy** — transient errors (429, 5xx, `E_TR_*`) are retried with
  backoff (`RETRY` timeline events); auth failures (`401` → `E_DEL_AUTH_FAILED`)
  are never blindly retried.
- **Secret hygiene** — records, audit logs, artifacts, and memory entries are
  redacted; provider targets are sanitized, and redaction is stable across runs.
- **Rollback** — promotes the previous immutable deployment via the provider
  alias (`current.json` on local); previous records are never mutated.

## Storage layout

| Path | Contents |
|---|---|
| `storage/delivery/records/` | Immutable `dep_<buildId>.json` deployment records |
| `storage/delivery/packages/` | Immutable zip bundles + package manifests |
| `storage/delivery/local/` | Local provider deploys (`current.json` alias per project) |
| `logs/delivery/` | Redacted NDJSON audit trail (one file per day) |

## Tests

```bash
node delivery/tests/unit.mjs        #  27 PASS — state machine, errors, retry, redaction, schema, registry
node delivery/tests/qa.mjs          #  17 PASS — final QA gate, links, assets, SEO, secrets, determinism
node delivery/tests/packaging.mjs   #   9 PASS — manifests, zip integrity, pruning
node delivery/tests/security.mjs    #  10 PASS — vault, redaction, audit hygiene
node delivery/tests/providers.mjs   #  13 PASS — mock/local/vercel contracts, fixtures, registry
node delivery/tests/rollback.mjs    #   9 PASS — promotion, approval, dry-run, revert
node delivery/tests/smoke.mjs       #  12 PASS — full chain, determinism, retry, auth, artifacts, memory
```

All suites run offline: mock/local providers and recorded Vercel fixtures only.

## Demo

```bash
node delivery/demo/demo.mjs
```

See [demo/README.md](demo/README.md). Architecture details in
[Architecture.md](Architecture.md).
