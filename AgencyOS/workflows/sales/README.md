# Workflow: Sales

> Turns an approved site into a Proposal + outreach draft + deal.

## Purpose

Composes the client-facing offer. Scope is exactly what was built and
approved; pricing is tiered; the deal lifecycle is tracked in CRM; the
outreach draft is ready for a human to send.

## Flow

```
Review (approved)
        │
        ▼
Sales ──► scope mapping ──► tier selection ──► timeline ──► deliverables + terms
        │
        ├──► Proposal (ready) ──► CRM deal (open) ──► outreach draft ──► ops/human
        │
        └── verdict fail ──► blocked (wait for re-approval)
```

## Steps

| # | Actor | Action | Output | Gate |
|---|---|---|---|---|
| 01 | QA | pass verdict | Review | — |
| 02 | Sales | scope + tier + timeline | proposal core | step 01 |
| 03 | Sales | deliverables + terms + outreach | Proposal | step 02 |
| 04 | CRM | deal create/update | deal state | step 03 |
| 05 | Ops | send outreach (human) | sent record | approval |

## Contracts

- Input: `agents/Sales/input.schema.json`
- Output: `agents/Sales/output.schema.json` (canonical: `schemas/proposal.schema.json`)
- CRM: `agents/CRM/output.schema.json`

## Exit Conditions

- Success: Proposal `ready`; deal open with next action; outreach draft
  handed to ops.
- Fail: QA not passed → `blocked` with review id; no proposal.

## Notes

- Pricing bands live in `agents/Sales/config.json` (essential/premium/
  enterprise); exact amounts are ops decisions, overridable per deal.
- Outreach is a draft only — Sales never sends.
