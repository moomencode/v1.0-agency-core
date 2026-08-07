# Phase 4.3 Implementation Report — Universal Website Engine

> `AgencyOS/website-engine/` — deterministically transforms the Website Config
> Bundle (19 JSON files) into a complete, production-ready website: static
> HTML, React project, JSON bundle, or Vercel deployment. API version 1.0.

## 1. Architecture Report

The engine is the final consumer in the chain:

```
Business Dossier (4.1) → Pipeline (4.2) → Website Config Bundle
  → Website Engine (4.3) → Website (React / Static / JSON / Vercel)
```

It is a pure, configuration-first transformer: 18 generic section builders
render purely from config data, 7 layouts (restaurant, cafe, medical,
realestate, corporate, portfolio, default) are selected from the business
category, and every output byte is deterministic.

### 1.1 Module Inventory

| File | Responsibility |
|---|---|
| `index.js` | `WebsiteEngine` facade — `build` `validate` `export` `preview` `report` |
| `errors.js` | `WEB_CODES` (8 codes: invalid bundle, missing config, unknown layout/section/format, render/validation/asset/export failure) |
| `utils.js` | `stableJson`, `sha256`, `hashCode` (FNV-1a), `slugify`, `clamp`, `ensureArray`, `sortedKeys` |
| `renderer/` | node tree (`el/text/icon/stars`), XSS-safe escaping, HTML + JSX serializers, tree traversal (`collectNodes`, `collectText`, ids) |
| `theme/` | `parseTheme`, contrast math, CSS variables (dark/light), bootstrap + toggle scripts, full component stylesheet, Tailwind/PostCSS configs |
| `components/` | ~26 line icons + semantic element helpers |
| `sections/` | 18 config-driven builders + `SECTION_MAP`/`SECTION_DEFS` |
| `layouts/` | 7 layouts + `CATEGORY_LAYOUT` auto-selection |
| `builders/` | `buildHead` (per-page SEO head), `buildSite`, `buildPages` (home/menu/contact), alt-section rhythm |
| `assets/` | ref collector + resolver (in-manifest/external/anchor/placeholder/missing), seeded SVG placeholders, asset report |
| `validators/` | 7 checks per page: links, sections, ids, seo, a11y, wcag, responsive |
| `export/` | static HTML site, Vite React project, JSON bundle, Vercel package, zero-dep PNG encoder, favicon, site script, checksummed write |
| `preview/` | single-file preview with page switcher |
| `tests/` | fixtures + unit (22) / smoke (10) / visual (2) / regression (2) |
| `demo/` | 7-business demo generator |

### 1.2 Page Model

- **home** — navbar + every planned content section + footer
- **menu** — navbar + `<h1>` title + menu + cta + footer (only when the layout
  includes a menu page and menu data exists)
- **contact** — navbar + `<h1>` title + contact + location + footer (always)

Pages reuse the same section nodes; the React export and the static export
serialize the same tree, so the two can never drift.

### 1.3 Sections (18)

navbar, hero, about (features.json), services, products, menu (categories +
dishes with formatted prices), gallery, testimonials, faq, pricing, offers,
booking (WhatsApp form — no backend), stats, team, contact, location, cta,
footer. Sections with no backing config are skipped automatically; the
`sec--alt` rhythm alternates per layout.

### 1.4 Theme & Styling

- `theme.json` tokens → CSS variables (`:root` light / `[data-theme="dark"]`)
  mirrored 1:1 into Tailwind for React.
- FOUC-free bootstrap script; persisted toggle; responsive breakpoints
  (640/768/1024); `prefers-reduced-motion`.
- Favicon + apple-touch-icon generated from theme color and brand initial with
  zero dependencies.

### 1.5 Assets Policy

- Ref classification: `in-manifest` | `external` | `anchor` | `placeholder` |
  `missing`.
- Missing images and all `/placeholders/*` refs are substituted with
  deterministic seeded SVGs (`/placeholders/<kind>-<n>.svg`), so every
  generated site renders without external assets.
- `asset-report.md` documents every ref and its resolution.

### 1.6 Validation (7 checks × page)

links (site-wide anchors), required sections, duplicate ids, SEO completeness
(title 10–65, description, OG/Twitter, absolute canonical, robots), a11y (one
h1, heading order, img alt, nav aria-label, accessible buttons), WCAG
(ink/base ≥ 4.5 both modes — hard; accent ratios advisory warnings),
responsive (viewport, ≤ 7 nav items, layout-shift-safe images).

### 1.7 Exports & Guarantees

| Format | Output |
|---|---|
| `static` | hostable HTML + robots/sitemap/webmanifest/favicon/placeholders/asset report |
| `react` | Vite project — `npm install && npm run dev` |
| `json` | `site-bundle.json` |
| `vercel` | React + `vercel.json`, deployable as-is |
| `all` | `static/ react/ json/ vercel/` + `site-manifest.json` (per-file SHA-256) |

- **Deterministic** — seeded placeholders, `stableJson`, no timestamps; tests
  assert byte-identical output across independent builds and full pipeline
  re-runs.
- **Safe** — HTML/JSX escaping at serialization; JSX text emitted as
  JSON strings (no `${}` interpolation).
- **Self-contained** — zero runtime dependencies, no external binaries.

### 1.8 Fixed During Implementation

- `el()` now sets `type: 'element'` — section tagging (`data-section`,
  `sec--alt`) and `collectNodes` traversal depend on it.
- Hero builder attached its inner grid (h1, CTAs, info) to the section.
- `Link`/`Heading` take `(props, children)`; children were previously dropped.
- Menu/contact pages get generated `<h1>` titles (exactly one h1 per page).
- Anchors validated site-wide (subpage nav links point at home sections).
- `/placeholders/*` refs substituted even when listed in the manifest (the
  pipeline's placeholder JPEGs are not shipped).
- `writeExport('all')` writes `static/ react/ json/ vercel/` subdirectories
  (React's `index.html` no longer shadows the static site).
- BusinessId falls back to `manifest.businessId`.
- **Upstream fixes:** dossier `competitorNames` returned the whole map instead
  of the names array and crashed on `realestate` (now returns the array,
  realestate + corporate entries added); pipeline hero CTA could point at
  `#services` when the layout doesn't plan that section (now falls back to
  `#features`/`#contact`); pipeline `hasBooking` defaulted to `true` without
  any booking signal (now requires explicit booking evidence).

## 2. Verification

```
website-engine/unit.mjs        22 PASS   theme, css, tailwind, layouts, sections,
                                          renderer+escaping, icons, assets, placeholders,
                                          all 4 exports, determinism, validation gates,
                                          missing config, layout override
website-engine/smoke.mjs       10 PASS   full dossier → pipeline → engine → disk export,
                                          checksums, placeholders, determinism across
                                          re-runs, preview, report, error paths
website-engine/visual.mjs       2 PASS   structural snapshot (sections/elements/links/…)
                                          + css/html/snapshot byte-reproducibility
website-engine/regression.mjs   2 PASS   7 categories → all 7 layouts, 112 checks, 0 failed,
                                          byte-identical across independent pipeline re-runs
website-engine/demo.mjs         7 sites   all validation-clean, exported to demo/sites/
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

**Website Engine total: 36 PASS. Full platform: 932+ PASS.**

## 3. Demo

```
node AgencyOS/website-engine/demo/demo.mjs
```

Seven businesses (cafe, restaurant, clinic, realestate, shop, tailor, other)
through the full chain — each producing a validation-clean site exported as
static/ react/ json/ vercel/ + preview/ under `demo/sites/<businessId>/`.
