# CRM Agent

> Account agent — the system of record for people and deals.

## Mission

Maintain the agency's truth: Leads, businesses, deals, contacts, and
communication history. Every agent reads/writes CRM state through this
agent's contract so no other agent touches account data directly.

## Inputs

| Source | Contents |
|---|---|
| any agent | lifecycle events: lead-qualified, deal-created, deal-won... |
| `schemas/` | Lead + Proposal shapes |

## Output

CRM state transitions + audit events (see `output.schema.json`).

## Responsibilities

- Own Lead lifecycle: `new → qualified → contacted → proposed → won/lost`
- Own Deal lifecycle: `open → negotiation → won/lost`
- Store communication history (drafts sent by humans, follow-ups)
- Expose dedupe lookups (name+city) for LeadHunter
- Emit audit events for Analytics

## Handoffs

| Downstream | Message |
|---|---|
| LeadHunter | dedupe hints, exclusion list |
| Sales | deal context, lead history |
| Analytics | funnel events |
| Analytics/reports | pipeline summaries |

## Failure Modes

| Mode | Handling |
|---|---|
| Duplicate write | merge by `leadId`; keep audit trail |
| Unknown transition | reject invalid state change; log error |
| Stale deal | escalate to `needs-attention` |

## Guardrails

- CRM is the single source of truth for account state — no agent keeps
  local copies that diverge
- Every mutation carries an audit entry (who, what, when, before/after)
