# Workflow: QA

> The quality gate — nothing ships without an approved Review.

## Purpose

Independent verification of the Website document and its rendered
preview. Runs the eight engine checks (schema, i18n, menu, seo, assets,
build, render, a11y), assigns severities, and routes defects to owning
agents. Verdicts gate Sales and Deployment.

## Flow

```
Website doc + preview
        │
        ▼
QA ──► 8 checks (schema/i18n/menu/seo/assets/build/render/a11y)
        │
        ├─ any check fail ──► verdict fail ──► defects routed to owners ──► rework loop
        │
        └─ all pass ──► pass / pass_with_warnings ──► approval ──► Sales + Deployment
```

## Steps

| # | Actor | Action | Output | Gate |
|---|---|---|---|---|
| 01 | WebsiteBuilder | render preview + screenshots | preview evidence | — |
| 02 | QA | run 8 checks | checks[] | preview |
| 03 | QA | severity + owner assignment | defects[] | step 02 |
| 04 | QA | verdict + approval | Review | step 03 |
| 05 | (rework) | owners fix; loop to 01 | — | verdict fail |

## Contracts

- Input: `agents/QA/input.schema.json`
- Output: `agents/QA/output.schema.json` (canonical: `schemas/review.schema.json`)
- Owner routing: `business-analyzer | content-writer | website-builder | deployment`

## Exit Conditions

- Success: `Review.approved === true`; downstream (Sales, Deployment) unblocked.
- Fail: defect report with owners; pipeline loops back to generation.

## Notes

- Severity map: error blocks delivery; warning degrades quality; info is
  advisory.
- Deterministic rule: fail if any check fails; else warnings → `pass_with_warnings`.
