# Agent Communication Report

> Who talks to whom, with what contract, in what order.

## 1. Principle

**No agent-to-agent ad hoc calls.** All communication follows workflow
definitions and passes canonical documents. A message is valid only if
it is (a) defined in a workflow step, and (b) shaped by the schemas.

## 2. Message Catalog

| # | From | To | Document | Schema | Trigger |
|---|---|---|---|---|---|
| M1 | LeadHunter | CRM | Lead (create/merge) | lead.schema.json | qualified/disqualified |
| M2 | CRM | LeadHunter | dedupe hints | crm.output | new discovery |
| M3 | LeadHunter | BusinessAnalyzer | qualified Lead | lead.schema.json | score ≥ 60 |
| M4 | BusinessAnalyzer | ContentWriter | BusinessDossier | business.schema.json | dossier complete |
| M5 | BusinessAnalyzer | CRM | business link | crm.output | dossier exists |
| M6 | ContentWriter | WebsiteBuilder | ContentBundle | website.schema.json (config) | all locales done |
| M7 | WebsiteBuilder | QA | Website doc + preview | website.schema.json | zero conflicts |
| M8 | QA | owners (rework) | defect report | review.schema.json | verdict fail |
| M9 | QA | Sales | approved Review | review.schema.json | approval |
| M10 | QA | Deployment | approved Review | review.schema.json | approval |
| M11 | Sales | CRM | deal create/update | proposal.schema.json (deal) | proposal ready |
| M12 | Sales | Ops | outreach draft | proposal.schema.json | ready |
| M13 | Deployment | Ops | DeploymentRecord + preview | deployment.output | run done |
| M14 | Deployment | Analytics | release events | deployment.output | release |
| M15 | all | Analytics | audit events | analytics.input | continuous |
| M16 | CRM | Analytics | funnel snapshot | analytics.input | period end |

## 3. Ownership Matrix

| Document | Writer | Readers | Notes |
|---|---|---|---|
| Lead | LeadHunter | BusinessAnalyzer, CRM, Sales, Analytics | CRM owns lifecycle |
| BusinessDossier | BusinessAnalyzer | ContentWriter, WebsiteBuilder, QA | facts sacred |
| ContentBundle | ContentWriter | WebsiteBuilder | lives inside Website.config |
| Website | WebsiteBuilder | QA, Sales, Deployment | canonical bundle |
| Review | QA | Sales, Deployment, Analytics | pipeline gate |
| Proposal | Sales | CRM, Ops, Analytics | deal payload |
| DeploymentRecord | Deployment | Ops, Analytics | release evidence |
| AnalyticsReport | Analytics | Ops | advisory only |

## 4. Event Names (logging registry)

`agent_started`, `agent_completed`, `agent_failed`, `gate_passed`,
`gate_failed`, `defect_raised`, `validated`, `rejected`,
`retry`, `run_paused`, `run_aborted`, `document_emitted`.

## 5. Anti-Patterns

- ❌ Agent reads another agent's memory → facts come via documents.
- ❌ Agent mutates a doc it doesn't own → read-only access enforced.
- ❌ QA fixes defects itself → rework loop, never self-fix.
- ❌ Sales sends messages directly → drafts to Ops only.
