# LeadHunter Agent

> Discovery agent — finds and qualifies prospective businesses.

## Mission

Continuously discover businesses that need a website, enrich them with
public facts, score their fit for the agency's offerings, and emit a
validated `Lead` document. LeadHunter **never** contacts prospects —
outreach is the Sales agent's job.

## Inputs

| Source | Contents |
|---|---|
| `config.json` | target industries, geo scopes, exclusion rules, scoring weights |
| `prompts/` library | discovery intents, scoring rubric |
| external search sources | public business listings (directory of interest) |

## Output

A `Lead` document (`schemas/lead.schema.json`) with a `qualityScore`
(0–100), `status` (`new` → `qualified` | `disqualified`), evidence links,
and dedupe keys.

## Responsibilities

- Find candidate businesses across configured industries/regions
- Collect verifiable public facts (name, location, type, online presence)
- Deduplicate against existing Leads (CRM)
- Score and qualify using the rubric in `prompt.md`
- Emit structured events for logging/analytics

## Handoffs

| Downstream | Message |
|---|---|
| BusinessAnalyzer | qualified `Lead` (workflow: `lead-discovery`) |
| CRM | every Lead for tracking |
| Analytics | discovery funnel metrics |

## Failure Modes

| Mode | Handling |
|---|---|
| Source unavailable | exponential backoff via shared Retry module; skip source |
| Empty results | emit `empty` event, no Lead; do not fabricate |
| Duplicate lead | merge into existing CRM record instead of creating |
| Low-confidence facts | mark `unverified`; BusinessAnalyzer resolves later |

## Guardrails

- Read-only: never writes to external systems
- Never fabricates evidence or contact details
- Honors rate limits of every external source (shared RateLimiting module)
