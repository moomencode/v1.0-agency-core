# Workflow: Lead Discovery

> Turns raw prospect mentions into qualified, deduplicated Leads.

## Purpose

The entry point of the agency pipeline. Finds businesses with weak or
missing web presence, verifies contact information, scores the opportunity,
and produces a qualified `Lead` for the pipeline — or disqualifies it.

## Flow

```
raw mention / search result
        │
        ▼
LeadHunter ──► discovery record (scoring: fit/size/urgency/accessibility)
        │
        ├─ score >= threshold ──► Lead qualified ──► CRM (create)
        │
        └─ score < threshold ──► disqualified ──► CRM (log, exclusion list)
```

## Steps

| # | Actor | Action | Output | Gate |
|---|---|---|---|---|
| 01 | LeadHunter | discover + verify + score | discovery record | — |
| 02 | LeadHunter | qualify/disqualify decision | Lead | score ≥ 60 |
| 03 | CRM | create/merge lead + audit | CRM state | step 02 pass |
| 04 | LeadHunter | exclusion list update | dedupe hints | — |

## Contracts

- Input: `agents/LeadHunter/input.schema.json`
- Output: `agents/LeadHunter/output.schema.json` (canonical: `schemas/lead.schema.json`)
- CRM: `agents/CRM/output.schema.json`

## Exit Conditions

- Success: qualified Lead persisted in CRM, ready for Business Analysis.
- Fail: disqualified Lead with evidence; exclusion list updated.

## Notes

- Dedupe by `name + city` via CRM before creating anything new.
- Scoring weights live in `agents/LeadHunter/config.json`; tuning is an
  ops decision informed by Analytics recommendations.
