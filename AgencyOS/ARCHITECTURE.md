# AgencyOS — Architecture (`ARCHITECTURE.md`)

## Module Inventory — Phase 4.5 (Autonomous Agency Workflow Orchestrator)

| module | responsibility | API version | smoke |
|---|---|---|---|
| `orchestrator/` | campaigns of executions: brain routing, approvals, autonomy L0–L5, limits, killswitch, crash recovery, traces/audit | 1.0 | 119 PASS (18 suites: unit 13, state-machine 12, approval 9, policy 10, accounting 7, limits 10, resume 4, smoke 1, concurrency 11, failure-isolation 3, idempotency 6, security 13, regression-45x 17, chain1 2, stress 1) |
| `delivery/` | QA-gated, approval-gated delivery + rollback to hosting providers | 1.0 | 97 PASS (unit 27, qa 17, packaging 9, security 10, providers 13, rollback 9, smoke 12) |
| `website-engine/` | config bundle → production website (static/react/json/vercel) | 1.0 | 10 PASS (+22 unit, +2 visual, +2 regression) |
| `pipeline/` | dossier → production website config bundle, 13 resumable stages | 1.0 | 9 PASS (+24 unit) |
| `dossier/` | structured business knowledge: 20 documents + 5 reports, versioned | 1.0 | 75 PASS (+41 unit) |
| `brain/` | facade + pipeline orchestration, Runtime wiring | 1.0 | 45 PASS |
| `decision-engine/` | verdicts, estimates, risk, confidence, priorities | 1.0 | 38 PASS |
| `reasoning/` | decision traces, rationale, evidence chains | 1.0 | 29 PASS |
| `planner/` | strategy→plan mapping, gate context, routing | 1.0 | 34 PASS |
| `strategy/` | premium/standard/light selection | 1.0 | 19 PASS |
| `execution-plans/` | declarative plan runner, gates, retries | 1.0 | 31 PASS |
| `state-machine/` | 17 states, transitions, failures, timeouts | 1.0 | 39 PASS |
| `policies/` | JSON-editable guardrails | 1.0 | 25 PASS |
| `context/` | deterministic fact base builder | 1.0 | 32 PASS |
| `rules/` | rule registry + evaluation | 1.0 | 18 PASS |
| `metrics/` | counters, sums, snapshot, persistence | 1.0 | 18 PASS |

**Orchestrator total: 119 PASS. Delivery total: 97 PASS. Website Engine
total: 36 PASS. Pipeline total: 33 PASS. Dossier total: 116 PASS. Brain
total: 328 PASS. Full regression across phases 3.0–4.5: 1148+ PASS.**

## Dependency Graph

```
```
orchestrator/
  ├── discovery/      (records + weakness detection)
  ├── brain/          (verdicts — APPROVE/REJECT/ESCALATE/PARK, never re-scored)
  ├── dossier/        (20-document knowledge layer)
  ├── pipeline/       (13-stage config bundle)
  ├── website-engine/ (render + validate the site)
  ├── delivery/       (final QA incl. secret scan, packaging, providers, rollback)
  ├── artifacts/      (decision-record / execution-trace / execution-report / campaign-report)
  ├── memory/         (business + campaign facts)
  ├── scheduler/      (campaign run/resume jobs)
  └── runtime/        (shared bus, validation, runId sanitization — injected)

delivery/
  ├── website-engine/    (input: production build tree + final QA report)
  ├── build/             (deterministic production tree + delivery-meta.json)
  ├── qa/                (final QA gate: links, assets, SEO, secrets)
  ├── security/          (scan, redaction, env-only SecretVault)
  ├── packaging/         (immutable manifest + zip bundle, sha256 linkage)
  ├── deployment/        (manager, state machine, retry/poll, dry-run)
  ├── rollback/          (approve → promote previous package → revert)
  ├── providers/         (registry + local/mock/vercel)
  ├── artifacts/         (deployment-report + qa-report via Phase 4 artifacts)
  ├── memory/            (business-scoped deployment facts)
  ├── scheduler/         (delivery.deploy job)
  ├── brain/             (DELIVERY_EVENTS, DEPLOY/ROLLBACK executors)
  └── schemas/           (8 JSON schemas)

website-engine/
  ├── pipeline/          (input: 19-file website config bundle + manifest)
  ├── renderer/          (node tree, escaping, HTML + JSX serializers)
  ├── theme/             (tokens, CSS variables, component CSS, tailwind config)
  ├── components/        (icons + semantic element helpers)
  ├── sections/          (18 config-driven section builders)
  ├── layouts/           (7 layouts + category auto-selection)
  ├── builders/          (head, site, pages — home/menu/contact)
  ├── assets/            (ref resolver, seeded SVG placeholders, report)
  ├── validators/        (7 checks per page)
  ├── export/            (static · react · json · vercel · write + checksums)
  └── preview/           (single-file preview)

pipeline/
  ├── dossier/          (input: validated business dossier)
  ├── registry.js       (pipelines, generators, dependency graph, versions)
  ├── normalize.js      (dossier → normalized context)
  ├── sections.js       (section plan)
  ├── theme.js          (10 token groups + contrast pairs)
  ├── manifest.js       (declarative assets, no downloads)
  ├── config/           (19 config generators)
  ├── structured-data.js / localization.js
  ├── schemas/          (19 config schemas)
  ├── qa.js             (6 checks, gates readiness)
  ├── reports.js        (4 markdown reports)
  ├── profiles/         (11 category profiles)
  └── runtime/          (EventBus, Validator, Logger — injected)

dossier/
  ├── brain/            (prepareInput: context + estimates + decision)
  ├── extractors/       (profile · digital · commerce facts)
  ├── normalizers/      (phone +20 E.164 · email · url · coords · hours)
  ├── enrichers/        (brand · competitors · strengths · weaknesses · opportunities · risks · recommendations · grades)
  ├── builders/         (20 schema-validated documents)
  ├── renderer/         (templates → 5 markdown reports)
  ├── schemas/          (20 JSON schemas + dossier envelope)
  ├── validation/       (per-document schema validation)
  └── memory/           (business:<id> entries for downstream phases)

brain/
  ├── context/            (build fact base)
  ├── decision-engine/    (estimates + verdict; uses rules/, consumes policies/)
  ├── reasoning/          (traces decision)
  ├── strategy/           (selects engagement type)
  ├── planner/            (routes strategy → execution plan; uses execution-plans/)
  ├── state-machine/      (instance lifecycle)
  ├── execution-plans/    (runs steps; uses state-machine/)
  ├── policies/           (gate evaluation)
  ├── metrics/            (observability)
  └── runtime/            (EventBus, Validator, WorkflowRunner — injected, never duplicated)

rules/ ← decision-engine  (rule registry consumed by the decision rules)
```

No module duplicates logic: `execution-plans/` delegates all state transitions
to `state-machine/`; `decision-engine/` computes estimates once and shares them
via `context.estimates`; `planner/` delegates plan loading to
`execution-plans/`.

## Integration Points with the Runtime

| Brain hook | Runtime object |
|---|---|
| `brain.bus` / `brain._emit()` | `EventBus.emitEvent(event, meta, detail)` — events `brain.*` |
| `brain.validator` | `Validator.validate(obj, schema, { schemaPath })` |
| `brain.executeWorkflow(id, input)` | `WorkflowRunner.run(...)` (unavailable → `{status:'unavailable'}`) |
| `new Brain({ executor })` | `createExecutor({ runId })` wires all of the above at once |
| `dossier.engine` | `DossierEngine` reuses `Brain.runBusiness` for prepareInput; `requireApproved` gates builds |
| dossier events | `dossier.started/validated/created/updated/reports_ready` on the same EventBus |
| dossier memory | `memory.put('business', 'business:<id>', <id>, …)` — hand-off contract for Phase 4.2 |
| `pipeline.runner` | `PipelineRunner.run(dossier, { resume, runId })` — consumes any dossier, checkpoint/resume per stage |
| pipeline events | `pipeline.started/stage.started/stage.completed/stage.failed/qa.completed/completed/failed` |
| pipeline output | `storage/<root>/build/` — `website-config/` consumed by the Website Engine |
| `website-engine.engine` | `createWebsiteEngine().build(configs, { manifest, structuredData, overrideLayout })` — consumes the 19-file bundle |
| engine validation | `validate(site)` — 7 checks per page (links/sections/ids/seo/a11y/wcag/responsive), gates export |
| engine export | `export(site, { format, root, validation })` — static/react/json/vercel/all + `site-manifest.json` checksums |
| engine preview | `preview(site, { root })` — single-file preview for sales review |
| `delivery.system` | `createDeliverySystem({ root, engine })` — consumes production build tree + QA report |
| delivery gates | QA report must exist + pass at record creation and again before provider call; secret scan on the tree; bundle sha256 vs manifest; provider preflight |
| delivery modes | `dry-run` (simulated, zero provider contact) / `explicit` (approval-gated) / `auto` (disabled unless `DELIVERY_AUTO_ALLOWED=true`) |
| delivery retry | 429/5xx/`E_TR_*` retried with backoff (`RETRY` timeline events); auth failures (`E_DEL_AUTH_FAILED`) never blind-retried; `verify()` polled to READY |
| delivery rollback | `approveRollback` → `rollback` promotes previous immutable deployment via provider alias → `revert` re-promotes the original |
| delivery persistence | `storage/<root>/delivery/records|packages|local` + redacted NDJSON audit in `logs/delivery/` |
| delivery integrations | `deployment-report`/`qa-report` artifacts, business memory facts, `delivery.deploy` scheduler job, brain DEPLOY/ROLLBACK executors |
| metrics persistence | `storage/<root>/metrics.json` via `atomicWrite` (gitignored) |
| `orchestrator.system` | `createOrchestratorSystem({ root, discovery, brain, dossier, pipeline, website, delivery, memory, artifacts, scheduler })` — wires the full loop |
| orchestrator identities | `cmp-<hex>` campaign (hash of canonical spec), `orc-<hex>` execution (hash of campaign\|business\|version), `apr-<hex>` approval — raw ids never reach the filesystem |
| orchestrator flow | 13 steps per execution (discover → … → deploy → verify → report) over 20 execution states + 8 campaign states |
| orchestrator autonomy | L0–L5; L4 = humans decide DEPLOY/ESCALATE/QA_OVERRIDE; L5 auto-approves into the immutable approval ledger |
| orchestrator gates | Brain verdict, approval kinds, final QA (secret scan blocks credential-bearing content), budget limits → LIMITS_REACHED |
| orchestrator safety | `EMERGENCY_STOP` file / `ORC_EMERGENCY_STOP=1` killswitch; `RecoveryManager.boot()` breaks stale locks + resumes campaigns; pending approvals survive restarts |
| orchestrator persistence | `storage/<root>/orchestrator-engine/{instances,campaigns,approvals,locks}` + redacted audit in `logs/orchestrator/` |
| orchestrator security | `sanitizeRunId` at every runtime/pipeline filesystem boundary (SEC-01), hashed ids, vault + scan-pattern redaction in traces/audits/reports |

## Future Extension Points (AI reasoning)

- `reasoning/` already produces a structured **evidence chain** per decision —
  a natural input contract for an LLM explainer or auto-adjustment loop.
- `decision-engine` rules are plain data objects registered in `rules/index.js` —
  a learned model can replace weights, not code.
- `policies/defaults.json` + `strategy/strategies/default.json` are operator
  editable without redeploys.
- `planner/plans/catalog.json` maps any strategy `planHint` to any plan id —
  new plans are additive JSON.
- `execution-plans` executors are injectable: real website generation, CRM,
  or outreach can be dropped in via `brain.registerExecutor(action, fn)`.
- `dossier/` documents, categories, enrichers and report templates are all
  additive JSON/code — see `dossier/Extension Guide.md`; `templates/*.md`
  are editable without redeploys.
- `pipeline/` stages are declared data in `registry.js` (dependencies +
  labels) — new stages are additive; generators are injectable; profiles,
  palettes and copy in `profiles/index.js` are operator-editable data.
- `pipeline/` is deterministic by construction — an AI or human can review
  the `summary.json` checksums to verify reproducible builds.
- `website-engine/` sections, layouts, icons and validators are additive —
  new sections/layouts are new builder files + registry entries; export
  formats are additive cases; the node tree serializes to any target.
- `website-engine/` is deterministic by construction — seeded placeholder
  SVGs + `stableJson`; `site-manifest.json` sha256 verifies byte-reproducible
  builds.
- `orchestrator/` autonomy is data-driven (`AUTONOMY_CONFIG` maps levels →
  auto steps + human approval kinds) and every engine boundary is an adapter
  — swap discovery sources, policies, or providers without touching the
  state machine; new providers register via `sys.registerProvider(id, p)`.

## Production Readiness

| area | status |
|---|---|
| determinism | guaranteed except timestamps/durationMs; seeded generation |
| validation | schemas for context, policy, plan, instance, decision, brain-run, 7-check site gate + 8 delivery schemas |
| observability | bus events, per-step results, metrics snapshot, reasoning traces |
| resilience | retry policy per state, timeout actions, escalation records, gate failures are handled results |
| configurability | policies, strategies, plan catalog, gates, executors all injectable; sections/layouts additive; autonomy levels + provider registry in orchestrator |
| test coverage | 51 suites (33 module + 18 orchestrator), 1148+ assertions, all green |
| persistence | metrics + state summaries to `storage/` (gitignored) |
| runtime footprint | zero runtime deps, Node 24 ESM only |

## Run It

```bash
node AgencyOS/orchestrator/demo/demo.mjs      # orchestrator demo (6 businesses, L4, offline)
node AgencyOS/delivery/demo/demo.mjs        # delivery lifecycle demo (local + mock, offline)
node AgencyOS/website-engine/demo/demo.mjs  # universal engine demo (7 real websites)
node AgencyOS/pipeline/demo.mjs             # production pipeline demo (3 businesses)
node AgencyOS/dossier/demo.mjs              # dossier demo (20 documents, 5 reports)
node AgencyOS/brain/smoke.mjs               # 45 PASS — facade end-to-end
node AgencyOS/demo.mjs                      # 6-business market through the pipeline
# per-module: node AgencyOS/<module>/smoke.mjs
```
