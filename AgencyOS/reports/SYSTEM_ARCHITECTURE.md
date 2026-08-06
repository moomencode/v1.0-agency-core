# System Architecture Report

> Phase 2.0 — the Agency OS foundation. Architecture-only, engine-decoupled.

## 1. Overview

The Agency OS is a **contract-first multi-agent pipeline** that turns raw
prospect mentions into deployed business websites. It orchestrates nine
agents over a schema-governed document backbone and delegates all
rendering/build work to the existing Website Engine (`../Garcia2`).

The OS is currently **architecture-only**: agents are fully specified
(contracts, prompts, configs) but not implemented. Nothing in this phase
scrapes the web, calls APIs, or generates websites.

## 2. Layers

```
┌─────────────────────────────────────────────────────────┐
│ Orchestration  — workflows/ (6) + full-pipeline          │
├─────────────────────────────────────────────────────────┤
│ Agents         — 9 contract-first workers               │
│                  input.schema → work → output.schema     │
├─────────────────────────────────────────────────────────┤
│ Documents      — schemas/ (11 canonical contracts)      │
├─────────────────────────────────────────────────────────┤
│ Shared        — memory, logging, caching, retry,        │
│                 errors, validation, rate limiting       │
├─────────────────────────────────────────────────────────┤
│ Infrastructure — storage/ (documents+artifacts+indexes) │
├─────────────────────────────────────────────────────────┤
│ External       — Website Engine (Garcia2) — read-only   │
│                  dependency, invoked by Deployment      │
└─────────────────────────────────────────────────────────┘
```

## 3. Agent Fleet

| Agent | Role | Canonical output | Gate |
|---|---|---|---|
| LeadHunter | discovery + scoring | Lead | score ≥ 60 |
| BusinessAnalyzer | research + dossier | BusinessDossier | section confidence |
| ContentWriter | all copy, all locales | ContentBundle | dossier complete |
| WebsiteBuilder | config bundle + assets | Website | zero conflicts |
| QA | 8 checks, verdict | Review | approval |
| Sales | proposal + outreach | Proposal | approved review |
| CRM | system of record | state transitions | state machines |
| Deployment | build + release | DeploymentRecord | approved + QA pass |
| Analytics | period reports | AnalyticsReport | period end |

## 4. Design Principles

1. **Contract-first.** Every agent boundary is a JSON Schema
   (`additionalProperties: false`). Validation runs at every boundary
   (see `shared/VALIDATION.md`).
2. **Workflow-driven.** Agents never call each other ad hoc; the 6
   workflow definitions (`workflows/*/workflow.json`) are the only
   allowed call paths, plus the full-pipeline orchestration.
3. **Schema-governed.** 11 canonical schemas in `schemas/` are the single
   source of truth; agent copies are mirrors and must not drift.
4. **Engine-decoupled.** The OS knows the engine contract (config keys,
   section ids, business types, palette tokens) but never edits engine
   source; it produces config bundles + manifests for Deployment.
5. **Observable.** Every step logs (see `shared/LOGGING.md`); every
   decision leaves evidence in the audit stream (`storage/events/`).
6. **Gate-respecting.** Quality gates (QA approval, dossier confidence,
   CRM validity) physically block downstream work.

## 5. Failure Model

- Transient → Retry (bounded, budgeted per run).
- Validation/data → typed defects routed to owning agents.
- Infrastructure → `paused` run + ops alert.
- State violations → rejected events with audit.

Full taxonomy: `shared/ERROR_HANDLING.md`.

## 6. Scope Boundaries (Phase 2.0)

In scope: agents, workflows, schemas, shared modules, storage, templates,
prompt library, logs policy, architecture reports.

Explicitly out of scope (future phases): live scraping, API integrations,
agent runtime/execution, website generation, external mailer, site
telemetry.
