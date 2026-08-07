# Phase 4.2 Implementation Report — Automatic Website Production Pipeline

> `AgencyOS/pipeline/` — transforms a validated Business Dossier into a
> complete, production-ready website config bundle for the Universal
> Business Website Engine. API version 1.0.

## 1. Architecture Report

The pipeline is a 13-stage, deterministic, resumable production line. Every
stage is schema-validated, checkpointed, and emits runtime events.

```
 dossier ─▶ validate → normalize → generate-theme → generate-sections
  → generate-assets-manifest → generate-config → generate-navigation
  → generate-seo → generate-structured-data → generate-localization
  → generate-build-package → qa-validation → website-ready
```

### 1.1 Module Inventory

| File | Responsibility |
|---|---|
| `registry.js` | PipelineRegistry: registration, generator discovery, dependency graph, topological sort, apiVersion compatibility, cycle detection — `DEFAULT_PIPELINE` (13 stages) |
| `runner.js` | PipelineRunner: stage dispatch, per-stage checkpoints, `run-state.json` resume, 7 `pipeline.*` events, build package assembly |
| `normalize.js` | dossier → normalized business context (flat or `content`-wrapped docs) |
| `sections.js` | section plan (14-section catalog; menu/gallery/testimonials/reservation toggled by dossier signals) |
| `theme.js` | Theme Generator: 10 token groups (colors, typography, spacing, radius, shadows, buttons, cards, animations, icons, gradients) + WCAG contrast pairs |
| `manifest.js` | Assets Manifest (logos/hero/gallery/food/videos/icons/backgrounds/placeholders) — declarative, no downloads |
| `structured-data.js` | schema.org `@graph` (business by category `schemaType`, Menu, Review) |
| `localization.js` | `i18n.json` (en/ar, nav/theme/common/section labels) |
| `config/index.js` | 19 config generators — everything derived from the dossier |
| `schemas/index.js` | 19 config schemas (`agencyos:pipeline/config/*`) |
| `qa.js` | 6 QA checks (config, theme, website, SEO, schema, missing assets) |
| `reports.js` | Pipeline · Generation · Validation · QA reports (markdown) |
| `profiles/index.js` | 11 category profiles (cafe → pharmacy, other): sections, palettes, font pairings, services, features, FAQ, stats, offers, menu, hero info, CTA |
| `errors.js` | `PIP_CODES` (12 codes) |
| `utils.js` | seeded RNG (mulberry32), stable JSON, slugify, hashing |

### 1.2 Config Generator (19 files — the Website Engine's canonical bundle)

`brand.json` `theme.json` `business.json` `hero.json` `navigation.json`
`services.json` `gallery.json` `reviews.json` `stats.json` `faq.json`
`footer.json` `contact.json` `seo.json` `social.json` `booking.json`
`offers.json` `features.json` `menu.json` `i18n.json`

Sources: dossier `business` (name/category/area), `brand` (tagline/slogan),
`contact` (phone E.164 +20 formatting, email, whatsapp), `location`
(mapsUrl, coords), `hours`, `social`, `website` (canonical, status),
`reviews` (rating → stats/testimonials), `photos` (gallery count), `services`
& `products` (services.json/menu.json), `opportunities` (offers), `strengths`
(features), `weaknesses` + `recommendations` (section toggles), `summary`
(verdict).

### 1.3 Theme Generator (10 token groups)

colors (dark+light from category palette; `brand.primaryColor` override),
typography (category pairing + Google Fonts URL), spacing, radius, shadows,
buttons, cards, animations, icons, gradients — plus computed contrast pairs
(`inkOnBase`, `primaryOnBase`, `primaryOnPrimary`) per mode.

### 1.4 QA (6 checks)

| Check | Verifies |
|---|---|
| config-validation | all 19 configs against schemas (runtime Validator when wired) |
| theme-validation | 10 token groups complete + dark ink/base contrast ≥ 4.5 (WCAG AA) |
| website-validation | sections ↔ navigation anchors ↔ booking consistency |
| seo-validation | title ≤ 65, description ≤ 165, keywords, canonical, OG, Twitter |
| schema-validation | JSON-LD `@graph` non-empty, `@type` + name present, schemaType matches seo.json |
| missing-assets | every asset reference in configs declared in the manifest |

Any failed check halts the run (`PIP_QA_FAILED`); the QA report is written
for diagnosis.

### 1.5 Guarantees

- **Deterministic** — pure derivation + seeded RNG; smoke asserts identical
  sha256 checksums across independent runs.
- **Resumable** — per-stage checkpoints + `run-state.json`; resume restores
  completed stages and continues.
- **Schema-validated** — invalid config halts generation
  (`PIP_VALIDATION_FAILED`).
- **Versioned/reproducible** — immutable `build/` output with checksums.

### 1.6 Fixed During Implementation

- Dossier documents are **flat** (not `content`-wrapped) — normalize accepts
  both shapes.
- Contact fields are arrays (`phones[]`, `emails[]`) — normalize flattens.
- Opportunity id `booking-flow` / recommendation `w-booking` mean booking is
  **missing** — `hasBooking` logic inverted accordingly.
- `wa.me` link uses the WhatsApp number (not the landline).
- Event emission uses `EventBus.emitEvent` only (avoided double-firing).

## 2. Verification

```
pipeline/unit.mjs    24 PASS   (utils, errors, normalize, sections, theme,
                                manifest, structured data, localization,
                                configs, QA, registry)
pipeline/smoke.mjs    9 PASS   (full run, package structure, determinism,
                                resume-from-checkpoint, QA gate + report,
                                runtime validator, registry)
```

### Full platform regression (all modules)

```
runtime          ALL PASS      decision-engine  38 PASS   planner          34 PASS
communication     25 PASS      reasoning        29 PASS   brain            45 PASS
memory            36 PASS      rules            18 PASS   policies         25 PASS
artifacts         33 PASS      state-machine    39 PASS   metrics          18 PASS
validation        56 PASS      context          32 PASS   execution-plans  31 PASS
scheduler         49 PASS      strategy         19 PASS   discovery       145 PASS
dossier           75 PASS (+41 unit)   pipeline   9 PASS (+24 unit)
```

**Pipeline total: 33 PASS. Full platform: 896+ PASS.**

## 3. Demo

```
node AgencyOS/pipeline/demo.mjs
```

Three businesses (cafe APPROVE, gym APPROVE, tailor ESCALATE) through all 13
stages — sections, themes, menus, contact, SEO per category — plus a
determinism check (rebuild → identical checksums) and the event log.
