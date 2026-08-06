# Dossier Engine — Architecture

## 1. Layer Model

The Dossier Engine is a deterministic pipeline of six layers. Each layer has a
single responsibility and consumes only the output of the previous layer.

```
┌────────────────────────────────────────────────────────────────────┐
│ L1 prepareInput  context/estimates/decision   (decision-engine│brain)│
├────────────────────────────────────────────────────────────────────┤
│ L2 extractors    raw record ─▶ profile · digital · commerce facts   │
│ L3 normalizers   phone/email/url/coords/hours sanitization          │
│ L4 enrichers     brand · competitors · strengths · weaknesses ·     │
│                  opportunities · risks · recommendations · grades   │
│ L5 builders      20 schema-validated JSON documents                 │
│ L6 renderer      5 markdown reports from templates                  │
└────────────────────────────────────────────────────────────────────┘
        │  persist + index + memory + events
        ▼
  storage/dossiers/<businessId>/v<N>/…
```

## 2. Module Inventory

| File | Responsibility |
|---|---|
| `engine.js` | `DossierEngine` facade: build/update/load/search/snapshot, events, memory write |
| `index.js` | Public API + `DOSSIER_EVENTS` |
| `categories.js` | Category knowledge base (11 categories: services, products, keywords, competitor names, price info) |
| `extractors/index.js` | 5 extractors (contact, profile, digital, commerce) + `runExtractors` |
| `normalizers/index.js` | phone (Egyptian +20 prefix), email, URL, social, coordinates, name, hours |
| `enrichers/index.js` | 7 content enrichers + grades (health A–E, digital A–E) |
| `enrichers/recommendations.js` | quick wins, top problems, website recommendations |
| `enrichers/run.js` | `runEnrichers` composition |
| `builders/index.js` | 20 document builders + README builder |
| `renderer.js` | `{{placeholder}}` / `{{#each}}` template rendering |
| `templates/*.md` | 5 report templates |
| `reports/index.js` | `buildReports` (5 report builders + view model) |
| `schemas/index.js` | 20 JSON schemas registered centrally + `getSchema`/`validateDocuments` |
| `schemas/business.schema.json` | root schema for the dossier envelope |
| `errors.js` | `DOS_CODES` error taxonomy |
| `package.json` | module metadata (API 1.0) |
| `unit.mjs` / `smoke.mjs` / `demo.mjs` | tests + demo |

## 3. Grades

- **Health grade** (A–E) from `business` score + weaknesses penalty, with
  moving targets by tier (top-tier businesses need higher scores for the same
  grade).
- **Digital grade** (A–E) from presence score, capped by missing channels
  (no contact → cap D, no website → cap C).

## 4. Decisions & Verdicts

The engine does not decide — it reuses the platform decision layer:

- `prepareInput` calls `Brain.runBusiness(record)` when a brain is wired;
  otherwise runs context + estimates + decision locally.
- `build(…, { requireApproved: true })` refuses to build a dossier for a
  business whose verdict is not APPROVE (throws `DOS_CODES.INVALID_INPUT`).
- The verdict, risk, confidence and next step are embedded in the `summary`
  document and the `executive-report`.

## 5. Persistence

```
storage/dossiers/<businessId>/
  latest.json          {"version": 2, "dossierId": "dos-…"}
  v1/… v2/…            immutable versioned snapshots
```

- Each version is immutable; updates write a new version and repoint
  `latest.json`.
- `search` reads a small index file (`storage/dossiers/index.json`) refreshed
  on every build.
- Memory: one `business`-type entry per business (`business:<id>` scope)
  recording dossierId, version, name, category, health grade, verdict.

## 6. Runtime Integration

Wired through `createExecutor()` like all modules: EventBus (5 dossier events),
Validator (schema validation for every document), Memory (business entries),
Logger (runtime logger).
