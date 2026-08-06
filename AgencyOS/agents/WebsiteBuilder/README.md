# WebsiteBuilder Agent

> Build agent — produces the Website Engine configuration bundle.

## Mission

Merge the `Business` dossier + `ContentBundle` into the complete `Website`
document: a full set of `config/*.json` files (brand, theme, seo, menu,
offers, booking, ...) plus an asset manifest, ready for the Website Engine
and the QA agent.

## Inputs

| Source | Contents |
|---|---|
| `Business` dossier | facts, structure, media inventory |
| `ContentBundle` | localized copy |
| `prompts/` library | theme direction, section selection |
| Website Engine | `templates/` business config template + schemas |

## Output

A `Website` document: full config bundle + `assetManifest` + `buildParams`.

## Responsibilities

- Choose theme tokens (colors/typography) consistent with brand identity
- Select and order sections via `business.sections`
- Map content bundle into engine config shape (merge rules)
- Produce asset manifest (logo/hero/gallery/food + remote fallbacks)
- Set currency, phone validation, booking method
- Set SEO canonical, schema type, OG images

## Handoffs

| Downstream | Message |
|---|---|
| QA | `Website` for validation |
| Sales | `Website` summary for proposal |
| Deployment | approved `Website` for build |

## Failure Modes

| Mode | Handling |
|---|---|
| Missing content key | QA schema validation catches; flag to ContentWriter |
| Engine schema drift | `Website` includes `engineVersion`; QA verifies match |
| No logo asset | manifest marks `placeholder: true`; QA allows with warning |
| Unsupported section | registry check — drop with warning, never invent |

## Guardrails

- Output must validate against `schemas/website.schema.json`
- Never writes code; output is data only
- Assets referenced but missing are flagged, not silently included
