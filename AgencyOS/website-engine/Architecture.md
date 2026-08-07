# Website Engine Architecture — Phase 4.3

> `AgencyOS/website-engine/` — Universal Business Website Engine. API 1.0.

## 1. Pipeline position

```
┌─────────────┐   ┌─────────────┐   ┌──────────────────┐   ┌──────────────┐
│ Business    │   │ Pipeline    │   │ Website Engine   │   │ Website      │
│ Dossier (4.1)│ → │ (4.2) 19    │ → │ build/validate/  │ → │ React/Static/│
│             │   │ config JSON │   │ export/preview   │   │ JSON/Vercel  │
└─────────────┘   └─────────────┘   └──────────────────┘   └──────────────┘
```

The engine consumes exactly the config files the pipeline generates and never
assumes anything else. Its contract with the pipeline is stable: if the bundle
changes shape, the engine fails loudly (`WEB_MISSING_CONFIG` /
`WEB_INVALID_BUNDLE`).

## 2. Module inventory

| File | Responsibility |
|---|---|
| `index.js` | `WebsiteEngine` facade: `build` `validate` `export` `preview` `report`; re-exports |
| `errors.js` | `WEB_CODES` (8 codes) |
| `utils.js` | `sortedKeys` `stableJson` `ensureArray` `clamp` `slugify` `hashCode` (FNV-1a) `sha256` |
| `renderer/tree.js` | node tree: `el/text/icon/stars` (types `element/text/icon/stars`), `collectNodes`, `collectText`, `nodeIds`, `anchorIds` |
| `renderer/escape.js` | HTML + JSX text/attribute escaping (XSS-safe) |
| `renderer/serialize-html.js` | tree → pretty HTML (attr aliases, void tags, self-text collapse) |
| `renderer/serialize-jsx.js` | tree → JSX (JSON-stringified text, no `${}` interpolation hazards) |
| `theme/tokens.js` | `parseTheme` (RGB tuple coercion, mode merging), `parseColor`, `contrastRatio`, `contrastPairs` |
| `theme/css.js` | CSS variables generator (`:root`/`[data-theme]`), theme bootstrap + toggle scripts |
| `theme/site-css.js` | full component stylesheet (sections, buttons, cards, forms, breakpoints 640/768/1024, reduced-motion) |
| `theme/tailwind.js` | Tailwind config + PostCSS config with `rgb(var(--c-*) / <alpha-value>)` colors |
| `components/` | `icons.js` (~26 line icons + `iconSvg`/`iconPaths`), semantic helpers (`Container`, `Section`, `Card`, `Button`, `Badge`, `Grid`, `Image`, `IconChip`, `StarRow`, `Heading`, `Link`) |
| `sections/` | `SECTION_MAP` (pipeline ids), `SECTION_DEFS` (config requirements), 18 builders: navbar, hero, about, services, products, menu, gallery, testimonials, faq, pricing, offers, booking, stats, team, contact, location, cta, footer |
| `layouts/` | 7 layout definitions + `CATEGORY_LAYOUT` selection table |
| `builders/head.js` | per-page `<head>` (title/description/OG/Twitter/canonical/robots/fonts) |
| `builders/index.js` | `buildSite` (theme → layout → section ids → sections → assets → pages), `buildPages` (home/menu/contact), alt-section rhythm |
| `assets/resolver.js` | `collectRefs` (href/src/image/icon + nested, file-like only), `resolveAssets` (in-manifest/external/anchor/placeholder/missing) |
| `assets/placeholders.js` | deterministic palette SVG placeholders (seeded by businessId) |
| `assets/report.js` | `assetReport` markdown |
| `validators/index.js` | 7 checks per page: links, sections, ids, seo, a11y, wcag, responsive |
| `export/write.js` | `writeFiles` (sorted, SHA-256 per file) |
| `export/png.js` | zero-dependency PNG encoder (CRC32 + deflate) for apple-touch-icon |
| `export/assets-utils.js` | placeholder map/resolve/files, favicon SVG |
| `export/site-script.js` | theme toggle + mobile nav + WhatsApp booking submission |
| `export/html.js` | static site files (pages, robots, sitemap, webmanifest, favicon, placeholders, asset report) |
| `export/react.js` | Vite project (package.json, vite/tailwind/postcss configs, `src/main.jsx`, `src/App.jsx`, `src/site.css`, `src/site.js`, `src/site-data.json`, public assets) |
| `export/json.js` | `site-bundle.json` |
| `export/vercel.js` | React project + `vercel.json` + `.vercelignore` |
| `export/index.js` | `exportFiles` (formats), `writeExport` (formats → `static/ react/ json/ vercel/` + manifest) |
| `preview/index.js` | single-file preview with page switcher (`pv-bar`) and `noindex` |
| `tests/` | fixtures + unit/smoke/visual/regression suites |
| `demo/` | 7-business demo generator |

## 3. Build pipeline

```
buildSite(configs, { manifest, structuredData, overrideLayout })
  parseTheme(theme.json)
  layout = CATEGORY_LAYOUT[business.type]   (or overrideLayout)
  composeSectionIds(business.sections, layout)   # navbar, hero, planned…, about,
                                                  # products, pricing, team, contact,
                                                  # layout extras (cta), footer
  sections = ids.map(buildSection)          # null when config data missing;
                                            # data-section + sec--alt tagging
  assets   = resolveAssets(configs, manifest)
  pages    = buildPages(...)                # home always; menu when planned AND
                                            # navbar+menu+footer present; contact always
```

Key rules:

- A section builder is skipped when **every** config it needs is absent
  (`SECTION_DEFS[id].configFiles`); it must still render when only some are
  absent.
- Pages reuse the same section nodes — home = navbar + all content + footer;
  menu = navbar + title + menu + cta + footer; contact = navbar + title +
  contact + location + footer. Menu/contact pages get a generated `<h1>` page
  title (exactly one h1 per page is a validation rule).
- `sec--alt` alternates on `layout.sectionAltEvery` for visual rhythm.

## 4. Page model & renderer

Every page is `{ id, path, route, sections: Node[], head }`. Nodes are plain
JSON objects (`{ type, tag, props, children }`); text/icon/stars leaves keep
XSS-safe escaping at serialization time. The same tree serializes to HTML
(`serializeTreeHtml`) and JSX (`serializeTreeJsx`) — the React export and the
static export are generated from the same source of truth, so they can never
drift.

## 5. Theme & styling

- `theme.json` (pipeline-generated) → CSS variables under `:root` (light) and
  `[data-theme="dark"]`, mirrored 1:1 into the Tailwind config for React.
- Bootstrap script sets `data-theme` before paint (no FOUC); toggle button
  persists to `localStorage` (`storageKey` from theme.json).
- Components CSS covers every section; responsive breakpoints 640/768/1024;
  `prefers-reduced-motion` disables animation.
- Fonts are linked from `theme.json.typography.fontsUrl`.

## 6. Assets policy

1. `collectRefs` walks config values (keys `href/src/image/icon` plus nested
   containers), keeping only file-like `/…` paths.
2. Each ref is classified: `external` (http/mailto/tel/wa.me), `anchor` (#),
   `in-manifest` (listed in manifest.references), `placeholder`
   (`/placeholders/*`), or `missing`.
3. At export, `placeholderMap` maps every missing image **and** every
   `/placeholders/*` image ref to a generated SVG
   (`/placeholders/<kind>-<n>.svg`, seeded by businessId — deterministic), and
   `placeholderFiles` emits those SVGs. `/placeholders/*` refs are substituted
   regardless of manifest status because the pipeline's generated placeholder
   JPEGs are not shipped.
4. `asset-report.md` documents every ref and its resolution.

## 7. Validation (7 checks × page)

| Check | Enforces |
|---|---|
| `links` | every `href`/`src` resolves; anchors exist **site-wide** (nav links cross pages); missing assets flagged |
| `sections` | home has hero/contact/footer; menu page exists when the layout requires it |
| `ids` | no duplicate element ids |
| `seo` | title 10–65, description ≤ 165, OG/Twitter complete, absolute canonical, robots |
| `a11y` | exactly one h1, no skipped heading levels, img alt (unless decorative), nav aria-label, accessible buttons |
| `wcag` | ink/base ≥ 4.5 in both modes (hard error); primary/base and button accents < 3.0 are **warnings** — the pipeline only guarantees ink/base AA, accent ratios are advisory |
| `responsive` | viewport meta, ≤ 7 nav items, images sized or cover-classed |

`validate` also asserts the generated CSS contains the 640px breakpoint.
Validation runs before export in the demo and CI flows; failing sites are
reported with per-check error lists.

## 8. Exports

- **static**: `index.html` `menu.html` `contact.html`, `robots.txt` (with
  sitemap URL), `sitemap.xml`, `site.webmanifest`, `favicon.svg`,
  `apple-touch-icon.png` (zero-dep PNG encoder), placeholder SVGs,
  `asset-report.md`, inline CSS + bootstrap + site script.
- **react**: Vite project; `src/site-data.json` carries the serialized bundle;
  `src/App.jsx` renders the JSX tree; Tailwind + component CSS included.
- **json**: `site-bundle.json` — the complete site model (pages, head, theme,
  assets, structured data, validation).
- **vercel**: React project + `vercel.json` (framework vite, outputs) —
  deployable without changes.
- **all**: the four written into `static/ react/ json/ vercel/` plus
  `site-manifest.json` with per-file SHA-256 checksums.

`writeFiles` sorts entries and writes deterministic bytes; two builds of the
same dossier produce byte-identical trees.

## 9. Determinism guarantees

- Seeded placeholder SVG generation (`seed: businessId`).
- `stableJson` everywhere (key-sorted).
- No timestamps, randomness, or environment-dependent output in any export.
- Unit/smoke/visual/regression all assert byte-identical output across
  independent builds (including full pipeline re-runs).

## 10. Fixed during implementation

- `el()` now sets `type: 'element'` — serializers, section tagging (`data-
  section`, `sec--alt`) and `collectNodes` traversal depend on it.
- Hero builder attached its inner grid (h1 etc.) to the section.
- `Link`/`Heading` now take `(props, children)` like `Container` — children
  were previously dropped by destructuring.
- Menu/contact pages receive generated `<h1>` page titles (one h1 per page).
- Anchors validated site-wide (nav links on subpages point at home sections).
- `placeholderMap` covers `/placeholders/*` refs even when listed in the
  manifest (pipeline placeholders are not shipped).
- `writeExport('all')` writes `static/ react/ json/ vercel/` subdirectories —
  React's `index.html` no longer shadows the static site.
- BusinessId falls back to `manifest.businessId` (the pipeline's
  `business.json` carries no id).
- Upstream fixes (this phase): dossier `competitorNames` returned the map
  instead of the names array and crashed on `realestate`; pipeline hero CTA
  could point at `#services` when the layout doesn't plan that section;
  pipeline `hasBooking` defaulted to true without any booking signal.
