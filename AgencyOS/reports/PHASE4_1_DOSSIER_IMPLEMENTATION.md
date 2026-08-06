# Phase 4.1 Implementation Report — Business Dossier Engine

> `AgencyOS/dossier/` — structured, versioned, schema-validated knowledge
> layer per business engagement. API version 1.0.

## 1. Architecture Report

The Dossier Engine turns a discovery record into a **dossier**: 20
schema-validated JSON documents + 5 rendered Markdown reports, persisted as
an immutable versioned file set, searchable through a lightweight index,
with the decision verdict embedded as the `summary` document.

```
 record ─▶ prepareInput (context·estimates·decision)      [brain-wired]
     ├─▶ extractors ─▶ normalizers ─▶ profile/digital/commerce facts
     ├─▶ enrichers ──▶ brand · competitors · strengths · weaknesses
     │                 · opportunities · risks · recommendations · grades
     ├─▶ builders ──▶ 20 schema-validated documents
     ├─▶ renderer ──▶ 5 markdown reports (templates/*.md)
     ├─▶ validation ─▶ per-document schema validation
     └─▶ persist ───▶ storage/dossiers/<id>/v<N>/ + index + memory
```

### 1.1 Module Inventory

| File | Responsibility |
|---|---|
| `engine.js` | `DossierEngine`: build/update/load/search/snapshot, events, memory, index |
| `categories.js` | 11-category knowledge base (services, products, keywords, competitors, price level) |
| `normalizers/index.js` | phone (+20 Egyptian E.164), email, url, social, coordinates+mapsUrl, name, hours |
| `extractors/index.js` | 4 extractors (contact/profile/digital/commerce) + `runExtractors` |
| `enrichers/index.js` | brand, competitors, strengths, weaknesses, opportunities, risks, grades |
| `enrichers/recommendations.js` | quick wins, top problems, website recommendations (w-build/w-booking/w-photos…) |
| `enrichers/run.js` | `runEnrichers` composition |
| `builders/index.js` | 20 builders + README builder (auto from BUILDERS map) |
| `renderer.js` | `{{placeholder}}`/`{{#each}}` markdown template engine |
| `templates/*.md` | executive · business-health · digital-presence · opportunity · website-recommendation |
| `reports/index.js` | 5 report builders + view model |
| `schemas/index.js` | 20 schemas registered via `extend()`, `getSchema`, `validateDocuments` |
| `schemas/business.schema.json` | dossier envelope schema |
| `errors.js` | `DOS_CODES`: INVALID_INPUT, UNKNOWN_BUSINESS, BUILD_FAILED, INVALID_DOSSIER, SCHEMA_MISSING, STORE_ERROR |

### 1.2 Documents (20) and Reports (5)

Documents: business, brand, contact, location, hours, social, website, seo,
reviews, photos, services, products, pricing, competitors, strengths,
weaknesses, opportunities, risks, recommendations, summary.

Reports: executive-report, business-health-report, digital-presence-report,
opportunity-report, website-recommendation-report.

### 1.3 Key Design Decisions

- **Null over absence** — every missing field is `null`; schemas stay stable.
- **Deterministic** — identical record → identical documents (only
  `createdAt`/`updatedAt` differ); verified in smoke.
- **Decision reuse** — the dossier does not decide; verdict/risk/confidence/
  next-step come from `Brain.runBusiness` (or local context+decision when no
  brain is wired). `requireApproved` gates builds.
- **Immutable versions** — updates write `v2/`, repoint `latest.json`; old
  versions remain loadable.
- **Grades** — health grade (A–E) with tier-moving targets and weakness
  penalty; digital grade capped by missing channels (no contact → ≤D,
  no website → ≤C).
- **Memory hand-off** — writes one `business` entry per business
  (scope `business:<id>`) so the next phase (Website Generator) can pick up
  `{ dossierId, version, healthGrade, verdict }` from memory instead of
  re-deriving.
- **Opportunity fallback** — fully healthy businesses still get one
  `growth-maintain` opportunity so reports never render empty.
- **Fixed during implementation** — phone normalization was rewritten to
  +20-prefixed Egyptian E.164 (accepts `+` only in international form);
  enrichers read `context.weaknesses` as strings (recordDefs matched by id);
  memory scope corrected from `dossier` to `business:<id>` per the memory
  type contract.

## 2. Verification

```
dossier/unit.mjs   41 PASS
dossier/smoke.mjs  75 PASS
```

Smoke coverage: 20 documents, 5 reports, schema validation, verdict wiring
(APPROVE / ESCALATE / PARK), requireApproved gate, versioning (v1→v2, load
historical), search (category/verdict/q/minOpportunity), snapshot,
events (created), memory reuse, deterministic rebuild, broken/absent sites,
weak-business quick wins.

### Full platform regression (all modules)

```
runtime          ALL PASS      decision-engine  38 PASS   planner          34 PASS
communication     25 PASS      reasoning        29 PASS   brain            45 PASS
memory            36 PASS      rules            18 PASS   policies         25 PASS
artifacts         33 PASS      state-machine    39 PASS   metrics          18 PASS
validation        56 PASS      context          32 PASS   execution-plans  31 PASS
scheduler         49 PASS      strategy         19 PASS   discovery       145 PASS
dossier           75 PASS   (+ 41 unit)
```

**Dossier total: 116 PASS. Full platform: 863+ PASS.**

## 3. Demo

```
node AgencyOS/dossier/demo.mjs
```

Two businesses (Cairo Roastery APPROVE / Giza Tailor ESCALATE), 20 documents,
5 rendered reports, update v1→v2, search by category and name, snapshot,
memory hand-off verification.
