# Workflow: Website Generation

> Produces the engine config bundle + asset manifest from a dossier.

## Purpose

Core production workflow. ContentWriter owns every string (copy, SEO,
menu text) in every locale; WebsiteBuilder assembles the full engine
config bundle, maps the asset manifest, and validates the result against
engine contracts. No text is written by WebsiteBuilder.

## Flow

```
BusinessDossier
        │
        ▼
ContentWriter ──► ContentBundle (all locales) 
        │                        │
        │                        ▼
        └────────────────► WebsiteBuilder ──► Website config bundle + assetManifest
                                   │
                                   └─ conflicts[]/warnings[] ──► QA (next workflow)
```

## Steps

| # | Actor | Action | Output | Gate |
|---|---|---|---|---|
| 01 | ContentWriter | localized copy for all sections | ContentBundle | dossier complete |
| 02 | ContentWriter | SEO titles/descriptions | SEO block | step 01 |
| 03 | WebsiteBuilder | config assembly (19 keys) | config bundle | step 02 |
| 04 | WebsiteBuilder | asset manifest mapping | assetManifest | step 03 |
| 05 | WebsiteBuilder | engine-contract validation | conflicts/warnings | step 04 |

## Contracts

- Input: `agents/WebsiteBuilder/input.schema.json`
- Output: `agents/WebsiteBuilder/output.schema.json` (canonical: `schemas/website.schema.json`)
- Content contract: `schemas/seo.schema.json`, `schemas/menu.schema.json`,
  `schemas/brand.schema.json`, `schemas/contact.schema.json`
- Template: `templates/website-config/README.md`

## Exit Conditions

- Success: Website doc with full config + manifest, zero `conflicts`.
- Warnings: carried to QA as `warning`; blocking defects tracked as
  `conflicts` (config can still assemble but must be fixed).

## Notes

- Engine version pinned in the Website doc (`engineVersion`).
- Facts (prices/hours) are passed verbatim from the dossier — never
  invented or paraphrased numerically.
