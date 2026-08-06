# AgencyOS Discovery Engine (Phase 4.0)

Finds businesses, evaluates their digital presence, and ranks them by
sales opportunity. Consumes the LeadHunter / BusinessAnalyzer concepts from
Phase 2.0 and turns them into an executable, testable engine.

## Quick Start

```bash
node discovery/smoke.mjs   # 145 assertions
node discovery/demo.mjs    # full-market + targeted runs, reports, custom source
```

```js
import { createDiscoverySystem } from './discovery/index.js';

const sys = createDiscoverySystem({ root: 'storage/discovery', probeMode: 'offline', validator: true });
const run = await sys.run({ all: true });           // full-market discovery
const cairo = await sys.run({ area: 'Cairo', category: 'restaurant' }); // targeted
sys.close();
```

## Architecture

```
discovery/
├── index.js        facade: DiscoverySystem + createDiscoverySystem (API v1.0)
├── engine.js       DiscoveryEngine: pipeline orchestration, persistence, search
├── sources.js      SourceAdapter base + 6 source adapters + HTML analysis
├── enrich.js       normalization (phone/URL/social), dedupe, merge, record builder
├── weaknesses.js   9 weakness rules with evidence and severity
├── scoring.js      business & opportunity scores, priority tiers, ranking
├── reports.js      Business/Opportunity/Weakness/Digital Presence + Markdown
├── errors.js       E_DIS_* error codes
├── catalog.js      simulated Egyptian market fixtures (14 businesses)
├── schemas/        business-discovery.schema.json (record contract)
├── smoke.mjs       145-assertion test suite (ALL PASS)
└── demo.mjs        end-to-end demo (PASS-based output)
```

## Execution Flow

```
validateQuery → per-source discover() → normalize() → validate() → enrich() → score()
  → mergeCandidates (dedupe by normalized phone) → finalizeProbe (HTML analysis)
  → buildRecord → detect weaknesses (9 rules) → score record → assignRanks
  → schema-validate → save (businesses/ + index.json) → run evidence (runs/{runId}/)
```

Every run writes, under `storage/discovery-engine/runs/{runId}/`:

- `summary.json` — metrics, tier counts, top priority
- `export.json` — full records for this run
- `report.md` — Execution Metrics, Summary, Priority Ranking, then per-business
  Business / Opportunity / Weakness / Digital Presence sections
- `businesses/*.json` — per-record documents

Records also land in `storage/discovery-engine/businesses/` with `index.json`;
re-running a discovery **updates** the same record (deterministic ids from
name + phone + area + category), so the index never accumulates duplicates.

## Source Abstraction

Every source extends `SourceAdapter` and implements the same five methods —
**no hardcoded source logic** anywhere in the engine:

| Method | Purpose |
|---|---|
| `discover(query, opts)` | return raw candidates for the query |
| `normalize(candidate)` | clean fields into engine conventions |
| `validate(candidate)` | drop invalid candidates (`{ valid, errors }`) |
| `enrich(candidate)` | fill gaps (phone, address, photos, …) |
| `score(candidate)` | source-specific signals (listing quality, …) |

Built-in sources:

- `simulated` — deterministic market fixture (offline demos/tests)
- `website` — probes real domains: `fetch` + HTTP/redirect/HTTPS/`x-probe-ms`
  timing analysis, then `analyzeHtml` extracts title, meta description, H1,
  viewport, lang, copyright year, generator hints, menu/booking links,
  email/phone, and social links
- `google-maps`, `facebook`, `instagram`, `directory` — generic adapters that
  need a provider client function (`providers[id](query)`); they skip when
  the provider is absent

```js
class YallaDirectorySource extends SourceAdapter {
  constructor() { super({ id: 'yalla-directory', name: 'Yalla Directory' }); }
  get ready() { return true; }
  async discover(query) { /* ... */ }
  validate(candidate) { /* ... */ }
  score(candidate) { return { listingQuality: 'good' }; }
}
sys.registerSource(new YallaDirectorySource());
```

Run queries accept `{ term, category, area, all }`; runs may also be scoped with
`{ sources: [...] }` or `probeMode: 'offline'` (uses `simulatedProbe` HTML
instead of `fetch`). The `website` source accepts `{ domains: [...] }`.

## Weakness Rules (9)

`no-website`, `broken-website`, `slow-website` (> 2500 ms), `missing-seo`,
`no-whatsapp`, `no-online-menu` (restaurant/dessert/bakery/cafe/pizza/burger),
`poor-branding` (< 3 photos or no social presence), `no-booking`
(hotel/restaurant/cafe/gym/clinic), `outdated-design`
(HTTP / no viewport / legacy generator / old copyright). Each rule returns
evidence and severity (`major` / `minor`).

## Scoring

- **Business score** (digital presence): presence 30 (website probe quality +
  social signals) + contact 20 (phone / WhatsApp / email / address) +
  content 25 (photos, menu, hours) + reputation 25 (rating + review volume).
- **Opportunity score**: `0.4 × demand + 0.6 × neglect` with bonuses
  (+6 per major weakness, +3 per minor, capped). Neglect = `100 − business`.
- **Priority tiers**: `high ≥ 70`, `medium ≥ 50`, `low`. Records are ranked
  within the run (`rank` 1..n).

## API (v1.0)

`registerSource` · `sources` · `source(id)` · `validateQuery` · `discover` ·
`detect` · `score` · `validateRecord` · `report` · `save` · `run` · `load` ·
`list` · `search(term, {category, area, priority, weakness})` · `export` ·
`stats` · `weaknesses` · `priorities` · `close`

Errors are typed: `E_DIS_UNKNOWN_SOURCE`, `E_DIS_SOURCE_UNAVAILABLE`,
`E_DIS_SOURCE_FAILED`, `E_DIS_QUERY_INVALID`, `E_DIS_NO_CANDIDATES`,
`E_DIS_RECORD_INVALID`, `E_DIS_SCHEMA_INVALID`, `E_DIS_NOT_FOUND`,
`E_DIS_STORE_ERROR` (see `errors.js`).
