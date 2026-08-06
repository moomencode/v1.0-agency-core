# AgencyOS — Decision Engine (`decision-engine/`)

> Rule-based business qualification that converts a deterministic context into a
> verdict, financial estimates, risk, confidence, and priorities.

## Inputs

- `context` — the deterministic fact base from `context/` (scores, presence,
  flags, weaknesses) with `context.estimates` optionally pre-attached.
- optional `{ policies }` — a `PolicyEngine` instance or `{ summary }` with
  `{ verdict, mandatoryFailed, summary }`.

## Outputs (one `decision` object)

| Field | Description |
|---|---|
| `verdict` | `APPROVE` / `REJECT` / `ESCALATE` / `PARK` |
| `decisionId` | `dec-{hash(businessId,10)}` — stable across runs |
| `estimates` | `websiteValue`, `devCost`, `salesValue`, `roi`, `closingProbability`, `buildTimeMs`, `pages` |
| `confidence` | 0..1 — data richness of the record |
| `risk` | `{ level: low|medium|high, reason }` |
| `priority` | `{ business, opportunity, execution, resource }` each `{ tier, value }` |
| `qualificationScore` | weighted sum of matched qualification rule scores |
| `ruleResults` | full evidence list per rule |
| `policySummary` | policy gate result passed through |

## Estimates (`estimates.js` — pure functions)

```
pages            = 6 + 2*menus + 1*photos(≥3) + 1*hasBooking + 1*hasWhatsapp   (cap 12)
websiteValue     = presence*40 + brandQuality*2000 + seoPresent*800 + socialActivity*1000
devCost          = 900 + pages*120
salesValue       = (opportunity/100)*5000 + min(1500, log10(reviews+1)*400)
roi              = (salesValue - devCost) / devCost
closingProbability = clamp01( 0.25*contactComplete + 0.2*(rating/5) + 0.2*socialActivity
                              + 0.2*(opportunity/100) + 0.15*(website not broken) + 0.1*(business/100) )
buildTimeMs      = 180000 + pages*45000 + weaknesses*15000
```

## Confidence

A 0..1 score from data presence: contact complete (+0.25), whatsapp (+0.1),
social activity (+0.15), reviews (+0.1), rating (+0.1), website probed (+0.1),
2+ sources (+0.15), booking or menus (+0.05).

## Risk

- `high` — 2+ **major** weaknesses (reason: "N major weaknesses")
- `medium` — broken website; missing contact with low confidence; closed/duplicate flags
- `low` — otherwise

## Decision Rules (`rules/`)

8 rules in 3 categories (weighted; `score * weight` sums to `qualificationScore`):

- **qualification**: `strong-demand` (opp ≥ 70, w3), `high-value` (sales ≥ 3500, w2),
  `profitable` (roi ≥ 1, w2), `weak-brand` (brand < 0.4, w1.5), `no-data` (w1)
- **risk**: `risk-high` (w1), `risk-medium` (w0.5)
- **policy**: `policy-blocked` (mandatoryFailed > 0, w3)

## Verdict Logic

```
if policy-blocked            → REJECT
else if no-data              → PARK
else if risk-high            → ESCALATE
else                         → APPROVE
```

## Priorities

```
tier thresholds:  high ≥ 70, medium ≥ 50, low < 50
execution = 0.6*opportunity + 0.4*closing*100
resource  = 0.5*opportunity + 0.3*closing*100 + 0.2*min(100, roi*40)
```

## Usage

```js
import { createDecisionEngine } from './decision-engine/index.js';
const engine = createDecisionEngine();
const decision = engine.evaluate(context, { policies: policyEngine });
```
