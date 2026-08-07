# AgencyOS

> The operating system for an AI-powered Digital Agency.
> Architecture-only foundation for a multi-agent system. Phase 2.0.

AgencyOS orchestrates a fleet of AI agents that take a business from
**lead → research → content → website → QA → sale → deploy → analytics**
using the **Website Engine** (sibling project, `../Garcia2`) as the
rendering core. This repository defines **what** the system is — contracts,
workflows, schemas, and shared infrastructure — not the implementation.

## Design Principles

1. **Contract-first** — every agent speaks through validated JSON schemas
   (`input.schema.json` / `output.schema.json`). No ad-hoc messages.
2. **Workflow-driven** — agents never call each other directly; the
   orchestrator routes messages through declared workflows.
3. **Schema-governed data** — every artifact (Lead, Business, Website, ...)
   is a typed document. Invalid data cannot propagate.
4. **Engine decoupled** — AgencyOS produces configuration; the Website
   Engine consumes it. Either side can be swapped.
5. **Observable by default** — every agent action lands in `logs/` and
   `storage/` through the shared modules.
6. **No hidden business logic** — this layer contains only contracts,
   prompts, and pipelines. Business logic is implemented later per module.

## Folder Map

```
AgencyOS/
├── agents/      9 specialist agents (contracts + prompts)
├── workflows/   6 orchestration pipelines
├── prompts/     shared, reusable prompt library
├── schemas/     the agency's canonical data contracts
├── storage/     persistence layout (input / output / state / media)
├── reports/     architecture documentation (4 docs)
├── templates/   reusable blueprints (business config, proposal)
├── logs/        structured event output
└── shared/      cross-cutting infrastructure specs (memory, retry, ...)
```

## The Agent Fleet

| Agent | Mission | Consumes | Produces |
|---|---|---|---|
| LeadHunter | discover & qualify prospects | search intent / sources | `Lead` |
| BusinessAnalyzer | research & structure a business | `Lead` | `Business` (+ Brand, Menu, Contact, SEO, Media, Social) |
| ContentWriter | write all website copy | `Business` | localized content (locale maps) |
| WebsiteBuilder | generate engine configuration | `Business` + content | `Website` (config bundle) |
| QA | validate config + rendered site | `Website` | `Review` report |
| Sales | proposal + pricing | `Website`, `Review` | `Proposal` |
| CRM | track accounts, deals, communication | any artifact | CRM state |
| Deployment | build, preview, ship, sitemap | approved `Website` | deployment result |
| Analytics | post-launch metrics & insights | deployment + traffic | analytics report |

## Reading Order

1. `reports/SYSTEM_ARCHITECTURE.md` — the big picture
2. `reports/DATA_FLOW.md` — how documents move
3. `reports/AGENT_COMMUNICATION.md` — message contracts
4. `reports/WORKFLOW_MAP.md` — pipelines and gates
5. `schemas/` — the canonical data contracts
6. `agents/*/README.md` — per-agent detail
7. `reports/PHASE4_DISCOVERY_IMPLEMENTATION.md` — discovery engine report
8. `reports/PHASE4_5_BRAIN_IMPLEMENTATION.md` — agency brain report
9. `reports/PHASE4_1_DOSSIER_IMPLEMENTATION.md` — business dossier engine report
10. `reports/PHASE4_2_PIPELINE_IMPLEMENTATION.md` — website production pipeline report
## Runtime, Communication, Memory, Artifacts, Validation & Scheduler (Phases 3.0 – 3.5)

Phase 2.0 defines the contracts; Phases 3.0–3.3 make them executable.

- `runtime/` — **execution engine** (Phase 3.0): loads the registry, resolves
  dependencies, runs workflows deterministically, validates every agent input/output,
  retries per policy, caches outputs, checkpoints runs for resume, and records logs,
  artifacts, memory, and metrics for every run. `runtime/smoke.mjs` (ALL PASS).
- `communication/` — **agent communication layer** (Phase 3.1): agents communicate only
  through Events. Typed message bus (`publish` / `subscribe` / `emit` / `broadcast`),
  priority queues with TTL timeouts and execution acknowledgements, dead letter queue,
  retries with backoff, heartbeat producers/monitors/probes, and a pluggable transport
  seam for future distributed execution. Every message follows the envelope + registry
  schemas; invalid messages are rejected and never delivered.
  `communication/smoke.mjs` (ALL PASS). Runtime events bridge in via
  `attachRuntimeEvents(runtime.bus)`.
- `memory/` — **long-term memory engine** (Phase 3.2): eight typed memories (working,
  project, business, brand, customer, agent, workflow, execution) with automatic
  loading/saving, immutable version history, snapshots, rollback, gzip compression of
  old versions, TTL expiration, a persisted search/dedupe index, cross-workflow reuse,
  and content-fingerprint deduplication (no duplicated memories).
  `memory/smoke.mjs` (ALL PASS).
- `artifacts/` — **artifact generation pipeline** (Phase 3.3): every workflow produces
  artifacts. Schema-validated artifact records with immutable versioning, sha256
  checksums + `verify()`, metadata sidecars, automatic naming, organized folders
  (`project/workflow/type[/run]`), capture of run documents via `captureRun` /
  `attachRuntime`, deliverable builders (research reports, website configs, SEO
  reports, brand documents, UX audits, sales proposals, contracts, PDFs/Markdown/JSON/
  HTML/images), search, and policy cleanup (maxVersions / retention days / TTL expiry).
  `artifacts/smoke.mjs` (ALL PASS).
- `validation/` — **global validation layer** (Phase 3.4): validates JSON, schemas,
  configs, workflow/agent/prompt outputs, assets, business configs and theme configs.
  Detects missing fields, duplicate IDs, invalid assets, broken references and schema
  mismatches, and returns detailed reports (errors / warnings / infos) for every check.
  JSON parsing is strict (duplicate keys reported with exact paths), asset checks
  include sha256 checksums and mime types, and theme/business rules enforce the Phase 2
  config contracts. `validation/smoke.mjs` (ALL PASS).
- `scheduler/` — **autonomous scheduler** (Phase 3.5): runs jobs on cron, interval or
  one-shot schedules with manual triggers, retries with backoff, priority queuing,
  concurrency limits, persistent jobs + run history, scheduler events, and real
  workflow execution through the runtime (or inline named handlers).
  `scheduler/smoke.mjs` (ALL PASS).
- `discovery/` — **business discovery engine** (Phase 4.0): finds and scores business
  opportunities. Pluggable source adapters (simulated market, website probing with
  HTML analysis, Google Maps / Facebook / Instagram / directories behind provider
  clients) all implement the same 5-method interface (`discover` → `normalize` →
  `validate` → `enrich` → `score`) — no hardcoded source logic. Full pipeline:
  query validation → per-source discovery → candidate merge & dedupe (by normalized
  phone) → probe finalization → record building → 9-rule weakness detection
  (broken website, missing SEO, no online menu, no booking, …) → business &
  opportunity scoring → priority tiers (high ≥ 70 / medium ≥ 50 / low) → rank
  assignment → persistence (businesses + index) → per-run evidence
  (`summary.json`, `export.json`, `report.md`, per-business JSON). Reports cover
  Business / Opportunity / Weakness / Digital Presence with execution metrics and a
  priority ranking table. `discovery/smoke.mjs` (145 PASS) and
  `discovery/demo.mjs` (full market + targeted + custom source + reports).
  See `discovery/README.md`.
- `brain/` — **agency brain — decision & orchestration layer** (Phase 4.0.5): turns
  discovered businesses into executed engagements. Ten composable engines —
  `rules/` (8 evaluation rules, 18 PASS), `context/` (deterministic fact base from any
  discovery record, 32 PASS), `policies/` (8 JSON-editable guardrail policies, 25 PASS),
  `state-machine/` (17 states, 39 PASS), `execution-plans/` (11-step default plan,
  31 PASS), `metrics/` (18 PASS), `strategy/` (premium/standard/light, 19 PASS),
  `decision-engine/` (verdicts APPROVE/REJECT/ESCALATE/PARK + estimates, 38 PASS),
  `reasoning/` (decision traces, 29 PASS), `planner/` (strategy→plan mapping, 34 PASS) —
  orchestrated by the `Brain` facade (45 PASS) wired to the Runtime
  (EventBus / Validator / WorkflowRunner). Deterministic end-to-end:
  same record → same decision → same plan outputs. `demo.mjs` runs a 6-business
  market through the full pipeline. Docs: `SYSTEM_DESIGN.md`, `DECISION_ENGINE.md`,
  `STATE_MACHINE.md`, `EXECUTION_PLANNER.md`, `POLICIES.md`, `ARCHITECTURE.md`.
- `dossier/` — **business dossier engine** (Phase 4.1): the structured knowledge layer.
  Every engagement produces a dossier: 20 schema-validated JSON documents (business,
  brand, contact, location, hours, social, website, seo, reviews, photos, services,
  products, pricing, competitors, strengths, weaknesses, opportunities, risks,
  recommendations, summary) + 5 rendered Markdown reports (executive, business-health,
  digital-presence, opportunity, website-recommendation) from `{{template}}` files.
  Pipeline: extractors → normalizers (Egyptian +20 E.164 phone, urls, coords+mapsUrl,
  hours) → enrichers (brand, competitors, strengths, weaknesses, opportunities, risks,
  recommendations, health/digital grades) → builders → validation → persist as
  immutable versioned file sets (`storage/dossiers/<id>/v<N>/`) with a search index.
  Reuses the brain decision layer (`requireApproved` gates builds), writes a
  `business` memory entry per engagement for downstream phases, emits 5 dossier
  events (started/validated/created/updated/reports_ready). Deterministic rebuilds.
  `dossier/unit.mjs` (41 PASS) + `dossier/smoke.mjs` (75 PASS) + `dossier/demo.mjs`.
  Docs: `README.md`, `Architecture.md`, `Data Flow.md`, `Schema Guide.md`,
  `Extension Guide.md`.
- `pipeline/` — **website production pipeline** (Phase 4.2): transforms a validated
  Business Dossier into a complete production-ready website config bundle. 13 stages
  (validate → normalize → generate-theme → generate-sections →
  generate-assets-manifest → generate-config → generate-navigation → generate-seo →
  generate-structured-data → generate-localization → generate-build-package →
  qa-validation → website-ready), each checkpointed and resumable. Config Generator
  produces the engine's canonical 19 files (brand/theme/business/hero/navigation/
  services/gallery/reviews/stats/faq/footer/contact/seo/social/booking/offers/
  features/menu/i18n) — all derived from the dossier; Theme Generator emits 10 token
  groups (colors with WCAG contrast pairs, typography pairings, spacing, radius,
  shadows, buttons, cards, animations, icons, gradients); Assets Manifest is
  declarative (no downloads); Structured Data emits schema.org `@graph`; QA runs 6
  checks (config, theme, website, SEO, schema, missing assets) and halts on failure;
  Build Package produces `website-config/` + `reports/` (pipeline/generation/
  validation/QA) + `logs/` + `artifacts/` + `summary.json` (sha256 checksums).
  100% deterministic (seeded RNG + stable JSON, verified by checksum in smoke),
  versioned runIds, no deployment. `pipeline/unit.mjs` (24 PASS) +
  `pipeline/smoke.mjs` (9 scenarios incl. resume + QA gate) + `pipeline/demo.mjs`
  (3-business market). Docs: `README.md`, `Architecture.md`.
