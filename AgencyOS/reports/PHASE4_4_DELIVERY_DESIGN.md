# Phase 4.4 — Autonomous Website Delivery & Deployment — Architecture Proposal

**Status:** PROPOSED (awaiting approval)
**Base:** v1.4.0-website-engine (b1b994b)
**Scope:** design only — no implementation. Phase 4.5 not started.

---

## 1. Architecture

A new platform module `AgencyOS/delivery/` sits directly below the pipeline/engine
chain. It consumes a **validated site** produced by the Universal Website Engine
(plus its trace context) and turns it into a production deployment.

```
DeliverySystem (delivery/index.js)          ← orchestrator, lifecycle entry point
  ├── build/        Production Build Manager  (assembly + size budget + checksums)
  ├── qa/           Final QA gate (engine report + SEO/a11y/links/assets gates)
  ├── packaging/    Immutable deployment packages (bundle + manifest + sha256)
  ├── providers/    Provider abstraction + registry (Vercel = first implementation)
  ├── deployment/   Lifecycle state machine, records, history, approval, dry-run, retry
  ├── rollback/     Immutable-artifact rollback (promote previous package)
  ├── security/     Secrets vault abstraction, redaction, bundle secret scan
  ├── artifacts/    Bridges deployment records → ArtifactSystem
  ├── memory/       Bridges deployment facts → MemorySystem
  ├── scheduler/    Job builder: scheduled delivery jobs
  ├── brain/        Brain capability handler + deployment events
  └── schemas/      JSON Schemas (runtime Validator conventions)
```

Target flow (unchanged from the brief):

```
Website Config (pipeline ctx) → WebsiteEngine → Generated Website
→ Production Build → Final QA → Deployment Package → Provider → Live Website
→ Deployment Record → Memory + Artifacts
```

### Design principles

- **Determinism first**: every build/package/record ID derives from content hashes,
  so re-running the same inputs yields byte-identical packages and the same record ID.
- **Immutable artifacts**: packages are write-once, versioned by `packageId`; nothing is
  ever overwritten. Rollback is *deployment of a previous package*, never mutation.
- **Gates before network**: no provider call happens until engine validation AND the
  Final QA gate pass. QA failure closes the run (abort), it never degrades to "deploy anyway".
- **Secrets never leave the process**: tokens live in the environment only, are consumed
  exclusively by the provider client, and a redaction + bundle-scan layer enforces it.
- **Mode-first deployment**: `dry-run` is the default; `explicit` requires an approval;
  `auto` is a stubbed future capability (interface present, disabled by policy flag).

---

## 2. Folder structure

```
AgencyOS/delivery/
├── index.js                 # DeliverySystem facade (deliver / deploy / approve / rollback / history)
├── errors.js                # DEL_CODES + deliveryError()
├── package.json
├── README.md
├── build/
│   ├── index.js             # ProductionBuildManager
│   ├── assemble.js          # production tree (static + robots + sitemap + assets + meta)
│   └── budget.js            # size budget + gzip estimate checks
├── qa/
│   ├── index.js             # FinalQA runner + gate (gate: all checks passed)
│   ├── engine.js            # re-runs WebsiteEngine.validate on the built site
│   ├── seo.js               # titles, meta, h1, sitemap coverage, structured data, canonical
│   ├── a11y.js              # WCAG ink/base ≥ 4.5 hard checks, alt coverage, landmarks
│   ├── links.js             # internal + external link resolution, no dead anchors
│   ├── assets.js            # all referenced assets exist, checksums match, no secret-looking files
│   └── secret-scan.js       # token/secret pattern + entropy scan over the bundle
├── packaging/
│   ├── index.js             # package immutable bundle (zip + package-manifest.json)
│   └── retention.js         # keep N newest packages per business, prune older
├── providers/
│   ├── interface.js         # DeploymentProvider contract (JSDoc + shape checks)
│   ├── registry.js          # register / get / list
│   ├── local.js             # local-file provider (demo + tests, no network)
│   ├── mock.js              # in-memory provider (test harness)
│   └── vercel/
│       ├── index.js         # VercelProvider implementation
│       ├── client.js        # thin REST client (deploy, verify, promote, list)
│       ├── preflight.js     # validateConfig: project/team existence, token check
│       └── fixtures/        # recorded API fixtures for tests (no live network)
├── deployment/
│   ├── manager.js           # lifecycle state machine + transitions + audit log
│   ├── records.js           # record persistence (storage/delivery/records/)
│   ├── approval.js          # approval gate (explicit mode)
│   ├── dryrun.js            # deterministic dry-run report (no provider call)
│   └── retry.js             # retry policy (uses runtime/retry.js conventions)
├── rollback/
│   └── index.js             # rollback + revert (promote previous/current package)
├── security/
│   ├── secrets.js           # SecretVault: read from env only; never persist
│   ├── redaction.js         # scrub secret-like values from logs/records
│   └── scan.js              # token-pattern scan over any string set (bundle files)
├── artifacts/
│   └── builders.js          # record → ArtifactSystem.create (types: deployment, qa-report, package)
├── memory/
│   └── bridge.js            # deployment facts → MemorySystem.put (scope business)
├── scheduler/
│   └── jobs.js              # buildDeliveryJob(): SchedulerSystem job definition
├── brain/
│   ├── capability.js        # handler: run delivery task (dry-run by default)
│   └── events.js            # publish delivery.deployed / delivery.failed events
├── schemas/
│   ├── delivery-request.schema.json
│   ├── deployment-record.schema.json
│   ├── build-record.schema.json
│   ├── qa-report.schema.json
│   ├── package-manifest.schema.json
│   ├── provider-config.schema.json
│   ├── approval.schema.json
│   └── rollback-record.schema.json
├── tests/
│   ├── unit.mjs             # IDs, state machine, redaction, budgets, retention
│   ├── qa.mjs               # each gate rejects/passes correctly
│   ├── packaging.mjs        # checksums, immutability, manifest schema
│   ├── providers.mjs        # interface contract tests (mock + local providers)
│   ├── security.mjs         # secret scan, no secrets in records/manifests
│   ├── rollback.mjs         # rollback + revert state flows
│   └── smoke.mjs            # full chain: dossier → pipeline → engine → build → QA → package → deploy(local) → record
└── demo/
    ├── demo.mjs             # 3 businesses end-to-end (dry-run + local deploy + rollback)
    └── README.md
```

Output data lives under `storage/delivery/` (gitignored, platform convention):
`records/`, `packages/<packageId>/`, `qa/<recordId>/`, `logs/`.

---

## 3. Data flow

```
pipeline ctx (configs[19] + manifest + structuredData) + ctx.runId
        │
        ▼
WebsiteEngine.build(configs, {manifest, structuredData}) ──► site (engineVersion, businessId)
        │
        ▼
WebsiteEngine.validate(site) ──► validationReport        (must pass — hard gate)
        │
        ▼
ProductionBuildManager.build(site, validationReport, trace)
        ├─ assemble production tree (static HTML/CSS/JS, robots, sitemap, favicon, placeholders)
        ├─ budget checks (size, gzip estimate)
        ├─ checksum manifest (sha256 per file) → buildId = hash(businessId + dossierVersion
        │     + pipelineRunId + engineOutputChecksum)          (deterministic)
        └─ build-record
        │
        ▼
FinalQA.run(build, trace)
        ├─ engine.js (re-validate) · seo.js · a11y.js · links.js · assets.js · secret-scan.js
        └─ qa-report {passed: true/false}   (false ⇒ abort, no package, no provider)
        │
        ▼
Packaging.package(build, qaReport) → bundle.zip + package-manifest.json (sha256 of bundle)
        └─ packageId = buildId  (immutable; stored at storage/delivery/packages/<packageId>/)
        │
        ▼
DeploymentManager.deploy(record)
        ├─ mode dry-run  → dryrun.js report (simulated, no network)      [default]
        ├─ mode explicit → approval.js gate → provider call after approval
        └─ mode auto     → stubbed (policy flag DEPLOY_AUTO_ALLOWED must be true; default false)
        │
        ▼
Provider (registry) — vercel (first) / local (demo)
        ├─ validateConfig (preflight: project/team/token, no deploy)
        ├─ deploy(bundle) → {deploymentId, url, state}
        ├─ verify(deploymentId) → ready/error (post-deploy smoke: homepage 200 + checksum match)
        └─ promote(deploymentId) → alias/domain point (used by rollback/revert)
        │
        ▼
deployment-record (deterministic: dep_<buildId>) → timeline, qa summary, trace
        │
        ▼
Artifacts (deployment record, qa-report, package manifest) + Memory (deployment facts)
        + audit log (logs/delivery/)
```

Every record carries the full trace chain:
`businessId → dossierVersion → pipelineRunId → engineVersion → buildId → packageId → deploymentId`.

---

## 4. Deployment lifecycle

1. **Request** — `deliver(businessId, {mode, provider, target, trace})` resolves the dossier
   version + pipeline run to replay the exact inputs (from pipeline ctx / storage).
2. **Build** — production tree assembled from the engine site; deterministic.
3. **QA gate** — engine validation + Final QA; pass or abort.
4. **Package** — immutable bundle + manifest; stored.
5. **Approve** — only in `explicit` mode: `DeliverySystem.approve(recordId, {by, note})`
   (or reject). Dry-run skips straight to simulation.
6. **Deploy** — provider call; retries per policy.
7. **Verify** — post-deploy check (URL reachable, homepage checksum match, sitemap 200).
8. **Record** — write record + artifacts + memory + audit log.
9. **Rollback (optional)** — `rollback(recordId)` deploys the previous immutable package
   and promotes the alias back; `revert(recordId)` promotes forward again.

---

## 5. State machine

States: `created → building → built → validating → validated → packaged → awaiting_approval
→ approved → deploying → deployed → verified → recorded` (terminal) · branch `failed`
(from any transition) `→ retrying → retries_exhausted → aborted` · approval branch
`rejected` (terminal) · `dry-run` terminal state: `simulated`.

Rollback lane: `deployed/verified → rollback_requested → rolling_back → rolled_back`;
`rolled_back → revert_requested → reverting → reverted`.

Events: `REQUESTED, BUILD_OK, BUILD_FAIL, QA_PASS, QA_FAIL, PACKAGED, APPROVED, REJECTED,
DEPLOY_START, DEPLOY_OK, DEPLOY_FAIL, VERIFY_OK, VERIFY_FAIL, RETRY, EXHAUSTED, ROLLBACK_START,
ROLLBACK_OK, REVERT_START, REVERT_OK, ABORT`.

Rules:
- Every transition appends to the record `timeline` (audit log entry: event, state, ts, actor, mode).
- Non-retryable failures (QA_FAIL, REJECTED, schema invalid) go straight to terminal states.
- Retryable failures (deploy/verify network) use exponential backoff (shared `runtime/retry.js`),
  capped attempts, then `retries_exhausted → aborted`.
- The state machine is data-driven from the record file, so restarts resume correctly.

---

## 6. Schemas (all under `delivery/schemas/`, validated with runtime `Validator`)

- **delivery-request**: `{businessId, dossierVersion, pipelineRunId, engineVersion?,
  mode: 'dry-run'|'explicit'|'auto', provider: 'vercel'|'local', target: {project, team?, region?},
  approval: {required: bool}, notify?}`
- **deployment-record**: `{id: 'dep_<buildId>', businessId, trace: {dossierVersion, pipelineRunId,
  engineVersion, buildId, packageId}, provider, target, mode, status, timeline[],
  qaSummary: {checks, failed, passed}, package: {path, bundleSha256, files}, deployment: {id?, url?},
  approvals[], error?, createdAt}` — **never contains secrets**.
- **build-record**: `{buildId, businessId, trace, files: [{path, sha256, bytes}], budget: {totalBytes,
  gzipEstimate, limits, passed}}`
- **qa-report**: `{recordId, groups: {engine|seo|a11y|links|assets|secrets}, checks[],
  totals: {checks, passed, failed}, passed}`
- **package-manifest**: `{packageId, bundle: {sha256, bytes, format: 'zip'}, files[], qaReportId,
  createdAt}`
- **provider-config**: `{provider, project, team?, region?, framework?, targetUrl?}` — ids only,
  **no tokens** (tokens via SecretVault).
- **approval**: `{recordId, approved: bool, by, note?, at}` / **rollback-record**:
  `{id, recordId, from: {packageId, deploymentId}, to: {packageId, deploymentId}, status, at}`.

Deterministic IDs: `buildId = sha256(businessId + dossierVersion + pipelineRunId +
engineOutputChecksum).slice(0,16)`; `packageId = buildId`; `recordId = 'dep_' + buildId`.
The provider's own `deploymentId` is stored as a mapping inside the record (it is inherently
provider-generated and non-deterministic).

---

## 7. Provider interface

```js
class DeploymentProvider {
  constructor(config, ctx)          // config: ids only; ctx: {secrets: SecretVault, logger}
  async validateConfig()            // preflight: project/team/token valid — no deploy
  async deploy(packageInfo, opts)   // upload immutable bundle → {deploymentId, url, state}
  async verify(deploymentId)        // → {status: 'ready'|'building'|'error', url}
  async urlFor(deploymentId)        // resolve current URL
  async promote(deploymentId)       // move alias/domain to deployment (rollback/revert)
  async listDeployments(opts)       // history for the target
  async health()                    // token/permission probe (used by preflight)
  dryRun(packageInfo)               // deterministic simulated result — never network
}
```

- `providers/registry.js`: `register('vercel', VercelProvider)`, `register('local', LocalProvider)`.
- Contract tests run against `mock` + `local` providers; **no live API in tests**.
- New providers (Netlify, Cloudflare Pages, S3 static, GitHub Pages) implement the same
  interface + schema + fixtures — registry registration only (future phases).
- `local` provider: writes the package to `storage/delivery/local/<project>/<packageId>/`,
  "deploys" by switching a `current` symlink-style pointer — full lifecycle with zero network.

---

## 8. Security model

1. **Secrets**: only via `security/secrets.js` (env lookup: `process.env.VERCEL_TOKEN`,
   `.env` file that is gitignored). `SecretVault` never logs, never persists, never returns
   to website code. Missing secret ⇒ preflight failure with a clear message (not a raw value).
2. **No secrets in generated websites**: engine never embeds env/credentials by construction;
   enforced by `qa/secret-scan.js` over the entire bundle (regex patterns for
   `token|api[_-]?key|secret|Bearer` + high-entropy strings). Scan failure = QA gate failure.
3. **No secrets in records/manifests**: `deployment-record` and `package-manifest` are
   schema-checked to exclude secret-shaped fields; `redaction.js` scrubs logs and any
   record field that matches secret patterns before persistence.
4. **Credential scoping**: the provider client is the only consumer of a token; website
   runtime code, schedulers, and memory store never receive it.
5. **Boundaries**: delivery never writes into `website-engine`, `pipeline`, or `dossier`
   state; it reads their outputs and writes only to `storage/delivery/`, `memory`,
   `artifacts`, and `logs/delivery/`.
6. **Deploy gating**: network deployments are blocked unless `mode != 'dry-run'` AND
   (approval granted OR `auto` policy explicitly enabled). Enforced inside
   `deployment/manager.js`, not by callers.

---

## 9. Approval model

- **dry-run** (default): full pipeline runs; provider call replaced by deterministic
  simulation report (`delivery/deployment/dryrun.js`). Record status `simulated`.
- **explicit**: run stops at `awaiting_approval`; only `DeliverySystem.approve(recordId,
  {by, note})` moves it to `approved → deploying`; `reject(recordId, {by, note})` → terminal
  `rejected`. Approval persisted in the record (`approvals[]`) and audit log.
- **auto**: interface + policy flag `DELIVERY_AUTO_ALLOWED` (default `false`); capability is
  stubbed until a later phase flips the flag — this keeps "automatic as a future capability"
  honest without shipping an unguarded path.
- Rollback and revert go through the same mode/approval rules as the original deploy.

---

## 10. Failure/retry model

| Failure class | Example | Action |
|---|---|---|
| Non-retryable | QA_FAIL, REJECTED, schema invalid, missing business | abort → terminal state, report |
| Retryable (deploy) | transient 5xx, timeout, rate limit | exponential backoff (runtime/retry), max 3 |
| Retryable (verify) | URL not yet ready | poll with backoff (Vercel "BUILDING" is normal) |
| Not retryable | auth/permission errors | fail fast — likely secret/config problem, surface preflight |

- Retry attempts recorded in `record.timeline`; `retries_exhausted → aborted`; no orphaned
  partial deploys (immutable package + idempotent deploy by `packageId`).
- Same `buildId` redeploy is safe: providers treat identical bundle as idempotent; records
  are keyed by `recordId`, so re-runs create a new record (same deterministic id only if
  inputs identical — collisions are then intentional and safe).

---

## 11. Rollback model

- Packages are immutable and versioned (`packages/<packageId>/`), retention keeps the
  newest N (default 5) per business; pruning never deletes the *currently live* package.
- `rollback(recordId)`: loads the previous package from storage → runs it through the same
  QA gate (quick mode) → deploys → `provider.promote(previousDeploymentId)` (Vercel: alias
  points to the old deployment instantly) → `rollback-record` written + memory/artifacts.
- `revert(recordId)`: promote the current package back (rollback of the rollback).
- Guardrails: rollback target must exist and be verified-ready; rollback obeys dry-run/
  approval rules; every rollback is its own record with full trace (`from`/`to`).

---

## 12. Testing strategy

- **unit.mjs**: deterministic ID derivation, state machine transitions (all event/state
  pairs), redaction, budget math, retention pruning, schema validation of every schema.
- **qa.mjs**: each gate (engine/seo/a11y/links/assets/secrets) accepts a good site and
  rejects injected defects (missing alt, contrast < 4.5, dead link, missing asset, fake token).
- **packaging.mjs**: checksums match on unzip round-trip; package is immutable (write
  collision raises); manifest schema-valid.
- **providers.mjs**: contract tests for mock + local providers; Vercel client logic tested
  against recorded `fixtures/` responses; dry-run path asserted to never touch network.
- **security.mjs**: bundle secret scan catches planted tokens; records/manifests contain no
  secret fields; SecretVault refuses non-env sources; redaction strips patterns from logs.
- **rollback.mjs**: rollback/revert state flows with local provider; guardrails (missing
  target, QA-failed target) rejected.
- **smoke.mjs**: full chain dossier → pipeline → engine → build → QA → package → deploy
  (local) → record → memory/artifacts; byte-determinism across two runs; 7 businesses,
  all gates pass (mirrors Phase 4.3 regression style).
- **scheduler/brain integration** in smoke: scheduled dry-run job executes; brain capability
  delegates a delivery task; events emitted.
- Constraint preserved: **no live network, no browser, no external deps in tests** — matches
  the repo's existing test policy.

---

## 13. Demo strategy

- `demo/demo.mjs`: 3 businesses → full chain → dry-run report → real deploy to `local`
  provider (files to `storage/delivery-demo/`, gitignored) → rollback + revert demo →
  prints records, QA summary, memory facts, artifact ids, and a deterministic "what would be
  deployed" report. Output: `storage/delivery-demo/` + console report.
- Optional live Vercel demo: documented in `demo/README.md`; requires the user to export
  `VERCEL_TOKEN` (never committed); runs only via explicit CLI flag and `explicit` approval.
- Deterministic: same inputs → same buildId/packageId/recordId and byte-identical packages.

---

## 14. Integration points with existing modules

| Module | Contract used |
|---|---|
| `pipeline` | `createPipelineRunner` ctx (`configs`, `manifest`, `structuredData`, `runId`, `status`) — delivery replays the same inputs the engine consumed |
| `website-engine` | `createWebsiteEngine().build/validate/export/report`; `site.engineVersion`, `site.businessId` |
| `dossier` | dossier version + businessId for trace and input resolution |
| `artifacts` | `ArtifactSystem.create` for deployment-record / qa-report / package-manifest (new artifact types `deployment`, `qa-report`, `package`) |
| `memory` | `MemorySystem.put('fact'|'knowledge', business scope, 'deployment:<recordId>')` + `search` for history; deployment facts feed future planning |
| `scheduler` | `SchedulerSystem.registerJob` — job `delivery-deploy` (schedule/cron/interval), handler runs delivery in dry-run or approval-required mode |
| `brain` | brain capability handler delegates to `DeliverySystem`; delivery publishes `delivery.deployed` / `delivery.failed` events |
| `runtime` | shared `retry.js`, `Validator`, logger, storage-root conventions |
| `validation` | schema validation conventions for `delivery/schemas/*` |
| `state-machine` | platform state-machine conventions (STATE_MACHINE.md) applied to the deployment lifecycle |

---

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Live provider calls leak into tests/CI | No network in tests; recorded fixtures; `local`+`mock` providers; live only via explicit env + approval |
| Secret leakage (env → bundle/record/log) | SecretVault single source; bundle secret-scan gate; record schema exclusion; redaction layer; `.env` gitignored |
| Non-deterministic records (provider timestamps/ids) | Our IDs are content-derived; provider `deploymentId` stored only as a mapping |
| Vercel API drift | Thin client + fixtures; interface isolation; preflight health checks |
| QA gate bypass | Gate enforcement lives inside `deployment/manager.js` (not caller); QA_FAIL is terminal |
| Approval bypass | Approval state machine-internal; dry-run default; `auto` gated by policy flag (default off) |
| Rollback data loss | Immutable packages; retention never prunes live package; rollback = promote previous, never mutate |
| Rate limits / quota | Failure classification + backoff (runtime/retry), capped attempts |
| Scope creep (many providers now) | Single provider (Vercel) + interface; others are future registration points only |
| Scheduler/brain abuse (auto-deploy job) | Jobs default to dry-run; approval required for real deploys regardless of caller |

---

## 16. Production-readiness checklist

- [ ] Engine validation + Final QA gate are mandatory before any provider call (QA_FAIL = abort)
- [ ] `dry-run` is the default mode; `explicit` approval enforced; `auto` stubbed behind policy flag
- [ ] Deterministic `buildId`/`packageId`/`recordId`; full trace chain on every record
- [ ] No secrets in repo, bundles, records, manifests, or logs (verified by tests)
- [ ] Immutable package store with retention (live package never pruned)
- [ ] Provider interface contract tests; Vercel client fixtures; no live API in tests
- [ ] Full-chain smoke + regression (7 businesses, byte-determinism) all green
- [ ] Scheduler, brain, memory, artifacts integration tests green
- [ ] Audit log per transition; rollback + revert covered by tests and demo
- [ ] Docs: `delivery/README.md`, `delivery/Architecture.md`, root README/ARCHITECTURE update,
      `reports/PHASE4_4_DELIVERY_IMPLEMENTATION.md`
- [ ] Demo: 3 businesses end-to-end (dry-run + local deploy + rollback) deterministic
- [ ] Commit + push + tag `v1.5.0-delivery`
- [ ] Working tree clean; audit passes; stop (no Phase 4.5)

---

## Approval gate

Implementation starts only after this proposal is approved. Scope is exactly the folder
structure in §2; no changes to previous phases beyond the documented integration points.
