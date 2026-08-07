# Universal Business Website Engine — Phase 4.3

`AgencyOS/website-engine/` — deterministically transforms the Website Config
Bundle (19 JSON files produced by the Phase 4.2 Pipeline) into a complete,
production-ready business website. API version 1.0.

```
Business Dossier (4.1) → Pipeline (4.2) → Website Config Bundle
  → Website Engine (4.3) → React / Static / JSON / Vercel exports
```

## Quick start

```js
import { createWebsiteEngine } from './website-engine/index.js';

const engine = createWebsiteEngine();

// configs: the pipeline's ctx.configs (or the build/website-config files)
const site = engine.build(configs, { manifest, structuredData });

const validation = engine.validate(site);        // 7 checks per page
if (!validation.passed) throw new Error('validation failed');

await engine.export(site, { format: 'all', root: './out', validation }); // static/ react/ json/ vercel/
await engine.preview(site, { root: './out/preview' });                   // single-file preview
```

## What it builds

- **3 pages** — `index.html` (home), `menu.html` (when the layout plans a menu
  page), `contact.html` — composed from 18 generic, config-driven sections.
- **7 layouts** — restaurant, cafe, medical, realestate, corporate, portfolio,
  default — selected automatically from the business category
  (`overrideLayout` supported).
- **Theme engine** — CSS variables (`:root` + `[data-theme]`), Tailwind token
  config, full component stylesheet with responsive breakpoints,
  `prefers-reduced-motion`, and a FOUC-free theme bootstrap + toggle script.
- **SEO** — title/description/keywords, Open Graph, Twitter cards, canonical,
  robots, sitemap.xml, site.webmanifest, favicon + apple-touch-icon (generated
  from theme color, zero dependencies).
- **Assets** — every `/path` reference resolved against the manifest;
  `in-manifest` refs kept, `/placeholders/*` and missing images substituted
  with deterministic generated SVGs so the site always renders.
- **Validation gate** — links (incl. cross-page anchors), required sections,
  duplicate ids, SEO completeness, accessibility (one h1, heading order, img
  alt, nav aria-label), WCAG ink/base contrast ≥ 4.5 (hard) with advisory
  accent warnings, responsive rules (viewport meta, ≤ 7 nav items, layout-shift
  safe images).

## Exports

| Format | Contents |
|---|---|
| `static` | Hostable HTML site + robots, sitemap, manifest, favicon, placeholders, asset report |
| `react` | Vite + React project (`npm install && npm run dev`) |
| `json` | `site-bundle.json` — full serialized site model |
| `vercel` | React project + `vercel.json`, deployable as-is |
| `all` | All four, written to `static/ react/ json/ vercel/` subdirectories |

Every export writes `site-manifest.json` with per-file SHA-256 checksums, and
all output is byte-deterministic across runs.

## Tests

```bash
node tests/unit.mjs       # 22 PASS — theme, sections, renderer, validators, exports, determinism
node tests/smoke.mjs      # 10 PASS — full dossier → pipeline → engine → disk export
node tests/visual.mjs     #  2 PASS — structural snapshot, byte-reproducible
node tests/regression.mjs #  2 PASS — 7 categories, all layouts, 112 checks, deterministic sweep
```

## Demo

```bash
node demo/demo.mjs        # generates 7 real websites under demo/sites/
```

See [demo/README.md](demo/README.md). Architecture details in
[Architecture.md](Architecture.md).
