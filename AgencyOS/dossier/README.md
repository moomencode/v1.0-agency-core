# Business Dossier Engine — Phase 4.1

> `AgencyOS/dossier/` — the structured knowledge layer of AgencyOS. Every
> business engagement produces a **dossier**: 20 schema-validated JSON
> documents + 5 rendered Markdown reports, versioned on disk and searchable.

## 1. What a Dossier Is

A dossier is the single source of truth for one business. It is built from a
discovery record (raw), normalized, enriched with derived knowledge, and
persisted as a versioned file set:

```
storage/dossiers/<businessId>/
  latest.json            pointer to the newest version
  v1/
    README.md            21-file manifest (1 README + 20 JSON documents)
    dossier.json         the dossier envelope (verdict, grades, validation)
    documents/*.json     20 schema-validated documents
    reports/*.md         5 rendered Markdown reports
  v2/  (after update)    same layout, next version
```

Requirements met: schema-validated, versioned, searchable, reusable,
extensible.

## 2. Quick Start

```js
import { DossierEngine } from './dossier/index.js';
import { createExecutor } from './runtime/executor.js';
import { createMemorySystem } from './memory/index.js';

const executor = await createExecutor({ runId: 'demo' });
const engine = new DossierEngine({
  root: 'storage/dossiers',
  bus: executor.bus,               // events: dossier.started/validated/created/updated/reports_ready
  validator: executor.validator,   // schema validation on every document
  memory: createMemorySystem({ root: 'storage/memory' }),
  logger: executor.logger
});

const d = await engine.build(record, { requireApproved: true });
d.documents.summary.verdict;            // 'APPROVE'
d.reports['executive-report'];          // markdown
await engine.build(record, { update: true });  // bumps to v2
engine.search({ category: 'cafe' });    // [{ businessId, verdict, version }]
engine.load('dis-cairo-001');           // latest version
```

Run the tests:

```
node AgencyOS/dossier/unit.mjs   # 41 unit assertions
node AgencyOS/dossier/smoke.mjs  # 75 end-to-end assertions
node AgencyOS/dossier/demo.mjs   # interactive demo
```

## 3. The 20 Documents

| # | Document | Contents |
|---|---|---|
| 1 | `business` | identity: name, category, area, status, verified, source |
| 2 | `brand` | derived brand signals: name signals, tagline, category keywords |
| 3 | `contact` | normalized phone / email / whatsapp / website / address |
| 4 | `location` | area, coordinates, maps URL (built from lat/lng) |
| 5 | `hours` | operating hours (when available) |
| 6 | `social` | instagram / facebook / linkedin profiles, links |
| 7 | `website` | status none\|ok\|broken\|slow, pages, speed, recommendation |
| 8 | `seo` | SEO presence, keywords, suggestions |
| 9 | `reviews` | rating, count, sentiment when derivable |
| 10 | `photos` | count, quality signals |
| 11 | `services` | service list per category knowledge base |
| 12 | `products` | product list per category knowledge base |
| 13 | `pricing` | price level (affordable/premium) and signals |
| 14 | `competitors` | identified competitor names + what they do better |
| 15 | `strengths` | derived strengths with evidence |
| 16 | `weaknesses` | detected weaknesses with severity |
| 17 | `opportunities` | ranked growth opportunities (P1–P3) |
| 18 | `risks` | ranked risks (P1–P3) |
| 19 | `recommendations` | quick wins, top problems, website recs, priority list |
| 20 | `summary` | dossier meta: verdict, next step, next actions |

## 4. The 5 Reports

| Report id | Title | Source template |
|---|---|---|
| `executive-report` | Executive Report | `templates/executive.md` |
| `business-health-report` | Business Health Report | `templates/business-health.md` |
| `digital-presence-report` | Digital Presence Report | `templates/digital-presence.md` |
| `opportunity-report` | Opportunity Report | `templates/opportunity.md` |
| `website-recommendation-report` | Website Recommendation Report | `templates/website-recommendation.md` |

Reports are rendered from `{{handlebars}}-style` templates by
`renderer.js` (`{{placeholders}}` + `{{#each}}` loops).

## 5. Engine API

`DossierEngine` (factory `createDossierEngine` in `index.js`):

| Method | Purpose |
|---|---|
| `build(record, opts)` | Full pipeline; `{ update, policies, persist, requireApproved }` |
| `prepareInput(record)` | context + estimates + decision (reuses `Brain.runBusiness` when wired) |
| `validateDossier(dossier)` | re-validates all documents against schemas |
| `getSchema(schemaId)` | fetch one of the 20 schemas |
| `load(businessId, { version })` | read a persisted dossier |
| `latestVersion(businessId)` | newest version number |
| `search({ q, category, verdict, area, minOpportunity, minHealth })` | indexed search |
| `snapshot()` | counters: built, updated, schemas, indexCount |

Events (`DOSSIER_EVENTS`): `dossier.started`, `dossier.validated`,
`dossier.created`, `dossier.updated`, `dossier.reports_ready`.

Memory: writes a `business` entry per business
(`business:<id>` scope) with dossierId, version, health grade, verdict —
reused by later phases via `memory.get('business', 'business:<id>', id)`.

## 6. Architecture Overview

```
 record ─▶ prepareInput (context+estimates+decision)     decision-engine / brain
     │
     ├─▶ extractors ──▶ normalizers ──▶ profile/digital/commerce facts
     ├─▶ enrichers ──▶ brand · competitors · strengths · weaknesses
     │                 · opportunities · risks · recommendations · grades
     ├─▶ builders ──▶ 20 schema-validated documents  (schemas/index.js)
     ├─▶ renderer ──▶ 5 markdown reports              (templates/*.md)
     ├─▶ validation ──▶ schema validation per document
     └─▶ persist ──▶ storage/dossiers/<id>/v<N>/ + index + memory
```

See `Architecture.md`, `Data Flow.md`, `Schema Guide.md`,
`Extension Guide.md` for the full design.
