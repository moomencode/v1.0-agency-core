# Phase 4.0 Implementation Report — Business Discovery Engine

> `AgencyOS/discovery/` — executable engine for finding businesses, evaluating
> digital presence, and ranking sales opportunities. API version 1.0.

## 1. Architecture Report

The engine is a **source-agnostic pipeline**: every discovery source implements
the same five-method interface, and the engine adds detection, scoring,
persistence, and reporting on top of merged candidates.

```
                    ┌────────────────────────────────────────────────┐
   query            │ DiscoveryEngine.run()                           │
   {all,term,       │                                                │
    category,area}  │  validateQuery                                  │
                    │    └─ per source (registry order, ready only)   │
                    │         discover() → normalize() → validate()   │
                    │         → enrich() → score()                    │
                    │  mergeCandidates()   — dedupe by normalized     │
                    │                       phone (fallback name+cat) │
                    │  finalizeProbe()     — analyzeHtml on raw HTML  │
                    │  buildRecord()       — deterministic id          │
                    │  detect()            — 9 weakness rules          │
                    │  score()             — business + opportunity    │
                    │  assignRanks()       — rank 1..n within run      │
                    │  validateRecord()    — JSON schema               │
                    │  save()              — businesses/ + index.json  │
                    │  _writeRunEvidence() — runs/{runId}/ evidence    │
                    └────────────────────────────────────────────────┘
```

### 1.1 Modules

| Module | Responsibility |
|---|---|
| `index.js` | Facade (`DiscoverySystem`) + `createDiscoverySystem` |
| `engine.js` | Pipeline orchestration, registry, persistence, search, stats |
| `sources.js` | `SourceAdapter` base (5-method contract), 6 adapters, `analyzeHtml` |
| `enrich.js` | Normalization (phone/URL/social), dedupe key, merge, record builder |
| `weaknesses.js` | 9 detection rules with evidence + severity |
| `scoring.js` | Business/opportunity scores, tiers, ranking |
| `reports.js` | Record/summary reports + Markdown renderer |
| `errors.js` | Typed `E_DIS_*` error codes |
| `catalog.js` | 14-business simulated Egyptian market (offline determinism) |
| `schemas/` | `business-discovery.schema.json` record contract |
| `smoke.mjs` | 145-assertion test suite |
| `demo.mjs` | End-to-end demo (full market, targeted, custom source, reports) |

### 1.2 Source Abstraction

All six adapters (`simulated`, `website`, `google-maps`, `facebook`,
`instagram`, `directory`) implement the identical interface —
`discover / normalize / validate / enrich / score` — the engine contains
**zero source-specific logic** (verified by smoke test: a custom
`yelp-like` source runs through the same pipeline unmodified). Provider-backed
sources (`google-maps`, `facebook`, `instagram`, `directory`) accept a
provider client function and skip cleanly when absent. `website` performs
real HTTP probing (status, redirect, HTTPS, `x-probe-ms` timing) and HTML
analysis (title, meta, H1, viewport, lang, generator, copyright, menu/booking
links, mailto/tel/social).

### 1.3 Execution Flow & Storage

```
validateQuery → discover (per-source pipeline) → merge → probe → record
→ weaknesses → score → rank → schema check → save → run evidence
```

- `storage/discovery-engine/businesses/*.json` + `index.json` — canonical
  store; ids are deterministic (name + phone + area + category), so
  re-discovery **updates** records instead of duplicating them.
- `storage/discovery-engine/runs/{runId}/` — per-run evidence:
  `summary.json` (metrics, tiers), `export.json`, `report.md` (Execution
  Metrics, Summary, Priority Ranking, per-business Business / Opportunity /
  Weakness / Digital Presence sections), `businesses/*.json`.
- Queries: `{ all }`, `{ term }`, `{ category }`, `{ area }`, `{ domains }`;
  run options: `sources[]`, `probeMode: 'offline'`, `artifact` toggle
  (artifacts integration via Phase 3.3 `artifactSystem`).

### 1.4 Detection & Scoring

9 weakness rules (`no-website`, `broken-website`, `slow-website >2500ms`,
`missing-seo`, `no-whatsapp`, `no-online-menu`, `poor-branding`,
`no-booking`, `outdated-design`) — each with deterministic evidence and
severity.

- Business score = presence 30 (probe quality + social) + contact 20 +
  content 25 (photos/menu/hours) + reputation 25 (rating + review volume).
- Opportunity = 0.4 × demand + 0.6 × neglect + bonuses (+6 major / +3 minor,
  capped); tiers: **high ≥ 70, medium ≥ 50, low**.

## 2. Test Summary

| Suite | Scope | Result |
|---|---|---|
| `discovery/smoke.mjs` | 145 assertions — API version, source registry + interface contract, query validation, filters, provider clients, website probing (online/offline), normalization, dedupe/merge, all 9 weakness rules with exact evidence, scoring component breakdowns, tier thresholds, ranking, serialization roundtrip, search (name/area/priority/weakness), export, run evidence files, record report, stats, artifact hook, custom source extension, priority thresholds | **145 PASS, 0 FAIL** |
| `discovery/demo.mjs` | Full-market run (16 businesses, 9 probed, 8 ok/1 broken), priority table, weakness evidence, targeted run, custom source run, website domain discovery, reports + persistence + search + stats | **PASS** |

Full-platform regression:

| Suite | Phase | Result |
|---|---|---|
| `runtime/smoke.mjs` | 3.0 | ALL PASS |
| `communication/smoke.mjs` | 3.1 | 25 PASS |
| `memory/smoke.mjs` | 3.2 | 36 PASS |
| `artifacts/smoke.mjs` | 3.3 | 33 PASS |
| `validation/smoke.mjs` | 3.4 | 56 PASS |
| `scheduler/smoke.mjs` | 3.5 | 49 PASS |
| `discovery/smoke.mjs` | 4.0 | 145 PASS |

## 3. Coverage Summary

| Area | Coverage |
|---|---|
| Error paths | All 9 `E_DIS_*` codes exercised (unknown source, unavailable source, source failure, invalid query, no candidates, invalid record, schema invalid, not found, store errors) |
| Source interface | 5-method contract enforced by `registerSource` (rejects missing methods); custom-source extension test proves no engine hardcoding |
| Weakness rules | 9/9 rules asserted with exact evidence strings |
| Scoring | Component-level assertions (presence/contact/content/reputation) and opportunity bonuses; tier boundary 70 verified (Bella Pizza op 69 → medium, Cairo Roastery 77 → high) |
| Persistence | Save/load roundtrip, index integrity, cross-run dedupe (deterministic ids), run evidence (4 artifact types per run) |
| HTML analysis | Title, meta, H1, viewport, lang, generator, copyright, menu/booking, mailto/tel, social links |
| Probe modes | Online (fake fetch honoring `x-probe-ms`) and offline (`simulatedProbe`); broken site (HTTP 500) handling |
| Query paths | `all`, `term`, `category`, `area`, `domains`, source scoping |

## 4. Folder / File Inventory

```
AgencyOS/discovery/
├── package.json                          module manifest (agencyos-discovery 1.0.0)
├── index.js                              facade + API version (1.0)
├── engine.js                             DiscoveryEngine — pipeline, persistence, search (387 lines)
├── sources.js                            SourceAdapter + 6 adapters + HTML analysis
├── enrich.js                             normalization, dedupe, merge, buildRecord
├── weaknesses.js                         9 rules + WEAKNESS_DEFS
├── scoring.js                            scores, tiers, ranks
├── reports.js                            report builders + Markdown
├── errors.js                             E_DIS_* codes
├── catalog.js                            14 simulated Egyptian businesses
├── schemas/business-discovery.schema.json
├── smoke.mjs                             145-assertion suite
├── demo.mjs                              end-to-end demo
└── README.md                             module documentation
```

Storage produced at runtime (under configured root):
`storage/discovery-engine/{businesses/, index.json, runs/{runId}/{summary.json,
export.json, report.md, businesses/*.json}}`.

## 5. Production Readiness

**Production-ready.** Verified via: 145-assertion smoke suite (deterministic,
no network dependency — fake `fetch` for online mode, fixtures for offline);
offline mode for CI; typed errors throughout; schema validation on every
persisted record; atomic file writes for the index; per-run immutable
evidence; deterministic ids preventing index drift; clean registry lifecycle
(`close()`); artifact integration optional and failure-isolated (warn only);
source providers injected via constructor — no credentials in code.

**Known limits (by design):** provider-backed sources (`google-maps`,
`facebook`, `instagram`, `directory`) require real provider clients to be
injected; `catalog.js` fixtures are for simulation/demos; no rate-limit or
consent handling (client responsibility per provider); probe timeout is
fixed at 8s (configurable via adapter).
