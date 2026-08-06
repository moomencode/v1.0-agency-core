# Dossier Engine — Extension Guide

This guide covers the four supported extension points of the Dossier Engine.
Everything is plain ESM in `AgencyOS/dossier/` — no build step, no framework.

## 1. Add a New Category to the Knowledge Base

File: `categories.js`

```js
const CATEGORIES = {
  cafe:    { services: [...], products: [...], keywords: [...], competitorNames: [...], priceLevel: 'affordable' },
  restaurant: { ... },
  // …
};
```

1. Add your category (e.g. `catering`) with `services`, `products`,
   `keywords`, `competitorNames`, `priceLevel`.
2. Category info flows automatically into the `services`, `products`,
   `brand`, `pricing`, `competitors` documents.
3. `categoryInfo(id)` and `competitorNames(id)` are exported for reuse.

No other changes needed — builders read the category knowledge base
dynamically.

## 2. Add a New Enricher

Enrichers run in order and receive a shared context:

```js
// enrichers/index.js
export function myEnricher(context, weaknesses) {
  const { record, profile, digital, commerce, decision } = context;
  return [{ id: 'my-signal', title: '…', … }];   // any derived payload
}
```

1. Add your function to `enrichers/index.js` (or a sibling module imported
   there).
2. Register it inside `runEnrichers` in `enrichers/run.js` — pass the new
   value through the returned object.
3. Expose the value to documents in the relevant builder
   (`builders/index.js`) — e.g. a new `content` key.
4. Extend the matching schema in `schemas/index.js`.
5. Add assertions to `unit.mjs` / `smoke.mjs`.

## 3. Add a New Document (21st, 22nd, …)

1. **Builder** — in `builders/index.js` add `buildXxx(context)` returning a
   payload object, and register it in the `BUILDERS` map (order = document
   order in the dossier).
2. **Schema** — add `xxx.schema.json` and register it in
   `schemas/index.js` via `extend()`.
3. **README** — `buildReadme` lists documents automatically from the
   `BUILDERS` map; no change needed.
4. **Reports** — optionally add a `{{#each documents.xxx}}` block to a
   template, or a new report in `reports/index.js`.
5. **Counts** — update the `schemas === 20` assertion in `smoke.mjs` and the
   document count expectations in `unit.mjs`.

## 4. Add a New Report

```js
// reports/index.js
import { render } from '../renderer.js';

function buildMyReport(view) {
  return render(templates['my-report'], view);
}
REPORT_BUILDERS['my-report'] = buildMyReport;
```

1. Create `templates/my-report.md` using `{{placeholders}}` and
   `{{#each}}` loops (see `renderer.js`).
2. Register the builder in `reports/index.js`.
3. The report is automatically rendered at build time and included in
   `dossier.reports`.

## 5. Template Syntax

| Syntax | Meaning |
|---|---|
| `{{documents.business.name}}` | nested value lookup |
| `{{#each documents.opportunities.opportunities}}` | loop — inside the block use `{{this.title}}` or bare keys |
| `{{if documents.website.status '===' 'broken'}}` | simple equality conditional |
| `{{#unless …}}` | inverted conditional |
| anything else | left verbatim |

Unknown keys render as empty strings — safe to preview partial data.

## 6. Wiring Into Other Phases

- **Memory** — the engine already writes a `business` entry per business
  (scope `business:<id>`). Read it later with
  `memory.get('business', 'business:<id>', '<id>')`.
- **Events** — subscribe to `DOSSIER_EVENTS` (started/validated/created/
  updated/reports_ready) on the runtime EventBus to trigger downstream
  phases (e.g. Website Generator start on `dossier.created` when
  `verdict === 'APPROVE'`).
- **Search** — `engine.search()` over the persisted index; new fields can be
  added to the index entry in `engine.js` `_indexEntry`.
