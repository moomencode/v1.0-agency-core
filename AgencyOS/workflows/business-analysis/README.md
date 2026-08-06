# Workflow: Business Analysis

> Turns a qualified Lead into a verified BusinessDossier.

## Purpose

Deep-dives the business: identity, location, contact facts, offerings,
pricing, hours, competitors, and media inventory — all flagged with
confidence levels. Output feeds ContentWriter, WebsiteBuilder, and QA.

## Flow

```
qualified Lead
        │
        ▼
BusinessAnalyzer ──► research ──► dossier sections (confidence per section)
        │
        ├─ facts verified ──► BusinessDossier (high confidence) ──► ContentWriter
        │
        └─ facts weak ──► needsVerification list ──► ops/human verification
```

## Steps

| # | Actor | Action | Output | Gate |
|---|---|---|---|---|
| 01 | BusinessAnalyzer | research + collect media | draft dossier | — |
| 02 | BusinessAnalyzer | confidence scoring | dossier sections | — |
| 03 | BusinessAnalyzer | needsVerification list | dossier | step 02 |
| 04 | Ops | human verification (if needed) | verified facts | optional |
| 05 | CRM | link business to lead | CRM state | dossier exists |

## Contracts

- Input: `agents/BusinessAnalyzer/input.schema.json`
- Output: `agents/BusinessAnalyzer/output.schema.json` (canonical: `schemas/business.schema.json`)
- Canonical media contract: `schemas/media.schema.json`

## Exit Conditions

- Success: dossier with per-section confidence; unclear facts flagged
  `needsVerification` (blocks downstream facts, not the whole pipeline).
- Fail: research impossible → dossier `incomplete`; escalation to ops.

## Notes

- Prices and hours are sacred facts: conflicts are resolved dossier-first.
- Media inventory lists what exists; assets themselves are fetched in the
  Website Generation workflow.
