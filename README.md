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

## AgencyOS regression & verification

The AgencyOS subsystems carry their own suites (any `tests/*.mjs` under
`AgencyOS/`). The aggregate harness discovers and runs them all in isolated
processes:

```bash
npm run test:regress            # full aggregate regression (stdout only)
npm run test:regress:capture    # full regression + persists evidence
npm run verify:pilots           # 5-synthetic-business fidelity pilots (offline)
```

- Evidence from `test:regress:capture` is kept at
  `AgencyOS/storage/regression-log/regress.log` (deterministic location,
  gitignored). Delete-on-re-run is intentional: the file always reflects the
  latest completed run.
- Direct harness use remains available:
  `node AgencyOS/scripts/regress.mjs --only <substring>` filters suites;
  `node AgencyOS/scripts/verify-pilots.mjs` writes `findings.json` evidence
  under `AgencyOS/storage/verification-pilots/<run-id>/`.
- The `qa` script above covers the vite-era active business only; the
  AgencyOS commands above are the system-wide gates.

## Structure

```
config/     active business configuration (19 JSON files)
assets/     active business media (logo, hero, gallery, food, ...)
businesses/ business library (garcia, cafe-luna, ...)
src/core/   the engine (config loader, i18n, assets, icons, SEO, theme)
src/sections/  data-driven page modules
scripts/    qa, build pipeline, scaffolder, sitemap generator
```
