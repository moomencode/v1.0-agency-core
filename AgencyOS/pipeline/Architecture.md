# Pipeline Engine — Architecture

## 1. Layer Model

```
 dossier ─▶ L1 validate   (dossier integrity: name/category required)
          ─▶ L2 normalize (dossier docs → normalized business context)
          ─▶ L3 derive    (theme tokens · sections · assets manifest)
          ─▶ L4 generate  (19 configs · navigation · seo · structured data · localization)
          ─▶ L5 package   (website-config/ reports/ logs/ artifacts/ summary)
          ─▶ L6 gate      (QA: 6 checks — failure halts the run)
          ─▶ L7 ready     (reports rendered, run-state persisted)
```

## 2. Module Inventory

| File | Responsibility |
|---|---|
| `registry.js` | `PipelineRegistry`: register pipelines/generators, dependency graph, topological sort, `apiVersion` compatibility, cycle detection; `DEFAULT_PIPELINE` (13 stages) |
| `runner.js` | `PipelineRunner.run(dossier, { resume, runId })`: stage dispatch, checkpoints (`<root>/checkpoints/<stage>.json`), `run-state.json`, `PIPELINE_EVENTS`, build package assembly, report writing |
| `normalize.js` | dossier → `{ id, name, category, phone, whatsapp, email, address, hours, rating, reviews, hasBooking, hasMenus, hasGallery, hasSocial, sections, scores, … }`; accepts flat or `content`-wrapped documents |
| `sections.js` | `planSections(n)` — section plan from profile + dossier signals (menu/gallery/testimonials/reservation toggles) |
| `theme.js` | `generateThemeTokens(n)` — 10 token groups from category palette + brand color override; WCAG contrast pairs; `themeJsonFromTokens` |
| `manifest.js` | `generateAssetsManifest(n)` — declarative asset groups, no downloads, deduped references |
| `structured-data.js` | `generateStructuredData(n)` — schema.org `@graph` (business by `schemaType`, Menu, Review) |
| `localization.js` | `generateLocalization(n, sections)` — `i18n.json` (en/ar, nav/theme/common/section labels) |
| `config/index.js` | 19 config generators — all content derived from the dossier (seeded RNG for review personas only) |
| `schemas/index.js` | 19 JSON schemas (`agencyos:pipeline/config/<file>`); structural + validator-wired validation |
| `qa.js` | 6 checks: config-validation, theme-validation (contrast), website-validation (sections↔nav↔booking), seo-validation, schema-validation (JSON-LD), missing-assets |
| `reports.js` | pipeline-report · generation-report · validation-report · qa-report (markdown) |
| `profiles/index.js` | 11 category profiles: sections, palette, fonts, services, features, faq, stats, offers, menu, heroInfo, cta |
| `errors.js` | `PIP_CODES` taxonomy |
| `utils.js` | hashCode, seeded RNG (mulberry32), slugify, stableJson |

## 3. Determinism Contract

- All derivation is a pure function of the dossier (plus an optional
  `brand.primaryColor`).
- Randomness is confined to review personas via `seededRng(hash(businessId))`.
- Every written file uses `stableJson` (keys sorted, 2-space indent).
- `summary.json` records per-file sha256 checksums; smoke asserts two runs
  produce identical checksums and byte sizes.

## 4. Resume Contract

- Each stage persists its payload to `checkpoints/<stage>.json` and the run
  appends the stage id to `run-state.json` (`completedStages`).
- On `run(…, { resume: true })` with the same `runId`: completed stages are
  restored from checkpoints (marked `resumed` in the stage log), remaining
  stages re-execute.
- A stage that failed is never marked completed; it re-runs on resume.
- `run-state.json` is written on failure so resume always works.

## 5. Validation & QA Gating

- **Stage gate**: `generate-config` validates all 19 files against schemas
  (runtime Validator when wired, structural otherwise). Any invalid file
  throws `PIP_VALIDATION_FAILED` — the build stops.
- **QA gate**: `qa-validation` runs 6 checks; any failure throws
  `PIP_QA_FAILED`, the QA report is written (for diagnosis), and
  `website-ready` is never reached. No deployment happens.

## 6. Integration Points

| Hook | Integration |
|---|---|
| `validator` | `Validator.validate(config, schema, { schemaPath })` — per config |
| `bus` | `EventBus.emitEvent('pipeline.*', …)` |
| `logger` | runtime logger per stage |
| input | any dossier produced by `DossierEngine` (flat or wrapped docs) |
| output | consumed by the Website Engine's `businesses/<id>/config/` layout |
| registry | custom pipelines/generators can be registered (same `apiVersion`) |
