# AgencyOS — Policies (`policies/`)

> Editable guardrails. Change a JSON value — no code changes.

## The 8 Default Policies (`defaults.json`)

| id | kind | field / flag | limit | mandatory |
|---|---|---|---|---|
| `minOpportunity` | threshold | `scores.opportunity` | ≥ 50 | ✅ |
| `minReviewCount` | threshold | `scores.reviews` | ≥ 10 | — |
| `maxBuildCost` | threshold | `estimates.devCost` | ≤ 25000 | — |
| `minClosingProbability` | threshold | `estimates.closingProbability` | ≥ 0.35 | ✅ |
| `ignorePremiumWebsites` | ignore | `flags.premiumWebsite` = false | — | ✅ |
| `ignoreClosedBusinesses` | ignore | `flags.closed` = false | — | ✅ |
| `ignoreDuplicateBusinesses` | ignore | `flags.duplicate` = false | — | ✅ |
| `requireContact` | ignore | `flags.missingContact` = false | — | ✅ |

## Kinds

- **threshold** — compares a deep field (`a.b.c`) with `op` (`gte`/`lte`) against
  `value`. Missing field → "no data for field; skipped" (counts as failed but not
  mandatory).
- **ignore** — reads a boolean flag and expects it to equal `expect`; used to
  exclude closed / duplicate / premium businesses and missing contacts.

## Semantics

- `evaluate(context)` → `{ verdict, passed, failed, mandatoryFailed, results[] }`.
- `verdict = 'pass'` only when **mandatory** policies all pass (non-mandatory
  failures are tolerated).
- `summarize(result)` → `{ verdict, summary, reasons[] }` for display and for
  feeding the decision engine.
- The Brain attaches `mandatoryFailed` to the summary so the decision engine's
  `policy-blocked` rule can enforce the REJECT path.

## Editing without code

```js
import { PolicyEngine } from './policies/index.js';
const engine = new PolicyEngine();                    // defaults
engine.applyOverrides({ minOpportunity: { value: 60 } });  // raise the bar
engine.applyOverrides([{ id: 'maxBuildCost', value: 30000 }]);
```

New policies are plain objects added to `defaults.json`:

```json
{ "id": "maxPages", "label": "Max site pages", "kind": "threshold",
  "field": "estimates.pages", "op": "lte", "value": 12, "mandatory": false }
```

## Usage

```js
const result = engine.evaluate(context);   // context from context/ (incl. estimates)
const summary = engine.summarize(result);  // { verdict, summary, reasons }
```
