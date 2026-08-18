# Website Production Pipeline — Phase 4.2

> `AgencyOS/pipeline/` — transforms a validated **Business Dossier** into a
> complete production-ready website config bundle for the Universal Business
> Website Engine. Deterministic · resumable · schema-validated · versioned ·
> reproducible.

## 1. Pipeline

```
Business Dossier ─▶ validate → normalize → generate-theme → generate-sections
  → generate-assets-manifest → generate-config → generate-navigation
  → generate-seo → generate-structured-data → generate-localization
  → generate-build-package → qa-validation → Website Ready
```

13 stages. Each stage writes a **checkpoint**; a failed run can be resumed
with `run(dossier, { resume: true, runId })` — completed stages are restored
from checkpoints and skipped.

## 2. Quick Start

```js
import { createExecutor } from './runtime/executor.js';
import { DossierEngine } from './dossier/index.js';
import { createPipelineRunner } from './pipeline/index.js';

const executor = await createExecutor({ runId: 'demo' });
const de = new DossierEngine({ root: null });
const dossier = await de.build(record, { persist: false });

const runner = createPipelineRunner({
  root: 'storage/pipeline',           // run-state + checkpoints + build output
  validator: executor.validator,      // runtime schema validation
  bus: executor.bus,                  // pipeline.* events
  logger: executor.logger
});

const ctx = await runner.run(dossier, { businessId: 'dis-cairo-001' });
ctx.status;            // 'ready'
ctx.configs;           // 19 config objects
ctx.outputRoot;        // …/build  (website-config/ reports/ logs/ artifacts/ summary.json)
```

Tests:

```
node AgencyOS/pipeline/unit.mjs   # 24 unit assertions
node AgencyOS/pipeline/smoke.mjs  # 9 end-to-end scenarios (incl. resume + QA gate)
node AgencyOS/pipeline/demo.mjs   # 3-business market demo
```

## 3. What Gets Generated

**19 config files** (exactly the Website Engine's canonical bundle), all
derived from the dossier — no manual content:

`brand.json` `theme.json` `business.json` `hero.json` `navigation.json`
`services.json` `gallery.json` `reviews.json` `stats.json` `faq.json`
`footer.json` `contact.json` `seo.json` `social.json` `booking.json`
`offers.json` `features.json` `menu.json` `i18n.json`

**Theme Generator** — 10 token groups: colors (dark/light palettes from the
category profile, adjustable via `brand.primaryColor`), typography (category
font pairing + Google Fonts URL), spacing, radius, shadows, buttons, cards,
animations, icons, gradients — plus computed WCAG contrast pairs.

**Assets Manifest** — declarative inventory of logos / hero / gallery /
food / videos / icons / backgrounds / placeholders. No assets are downloaded
(`downloaded: false`).

**Structured Data** — schema.org `@graph` (LocalBusiness by category, Menu,
Review) for SEO.

**Build Package** — `build/`:
`website-config/` (19 JSON) · `reports/` (pipeline, generation, validation,
QA) · `logs/run.log` · `artifacts/` (summary, manifest, structured-data,
sections) · `summary.json` (sha256 checksums per config).

## 4. Guarantees

| Rule | Mechanism |
|---|---|
| 100% deterministic | pure derivation + seeded RNG (`seed = hash(businessId)`); stable JSON (sorted keys) |
| Resumable | per-stage checkpoints + `run-state.json`; `resume: true` |
| Schema validated | 19 config schemas validated by the runtime Validator; invalid config halts the build |
| Versioned | runId + checksums + immutable build output |
| Reproducible | same dossier → byte-identical files (verified in smoke) |
| QA gate | 6 checks: config, theme (contrast), website (sections↔nav↔booking), SEO, schema, missing assets |

## 5. Events (`PIPELINE_EVENTS`)

`pipeline.started` · `pipeline.stage.started` · `pipeline.stage.completed` ·
`pipeline.stage.failed` · `pipeline.qa.completed` · `pipeline.completed` ·
`pipeline.failed`

## 6. Architecture

- `registry.js` — pipeline registry, generator discovery, dependency graph,
  version compatibility (`apiVersion`), cycle detection.
- `runner.js` — stage executor, checkpoints, resume, events, build package.
- `normalize.js` — dossier → normalized business context.
- `sections.js` — section plan (enabled/disabled from dossier signals).
- `theme.js` — theme token generator + `theme.json` builder.
- `manifest.js` — assets manifest.
- `structured-data.js` / `localization.js` — JSON-LD + i18n.
- `config/index.js` — the 19 config generators.
- `schemas/index.js` — 19 config schemas.
- `qa.js` — the six QA checks.
- `reports.js` — the 4 markdown reports.
- `profiles/index.js` — 11 category profiles (cafe…pharmacy, other) driving
  sections, palettes, fonts, heroInfo, cta, eyebrow; services, features, menu,
  offers, stats and FAQ come from the dossier data.

See `Architecture.md` for details.
