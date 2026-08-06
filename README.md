# Business Website Engine

Configuration-driven premium website generator — one codebase, any business
(restaurant, cafe, bakery, hotel, clinic, gym, barber, salon, ...).

The active site is the demo business **Garcia Restaurant & Cafe**.
The full system is documented in **[MASTER_TEMPLATE.md](MASTER_TEMPLATE.md)**.

## Quick start

```bash
npm install
npm run dev            # develop the active business
npm run qa             # validate config
npm run build          # production build
npm run preview        # serve dist/
```

## Build any business

```bash
npm run new:business -- cafe-luna       # scaffold businesses/cafe-luna
npm run build:business -- cafe-luna     # QA + build businesses/cafe-luna
```

## Structure

```
config/     active business configuration (19 JSON files)
assets/     active business media (logo, hero, gallery, food, ...)
businesses/ business library (garcia, cafe-luna, ...)
src/core/   the engine (config loader, i18n, assets, icons, SEO, theme)
src/sections/  data-driven page modules
scripts/    qa, build pipeline, scaffolder, sitemap generator
```
