# Data Flow Report

> Life of a business, from mention to deployed site to insight.

## 1. End-to-End Stream

```
raw mention
   │ M1a                          storage: events/run-{id}.ndjson (audit everywhere)
   ▼
[lead-discovery]  LeadHunter ──► Lead ──► CRM (create/merge, dedupe name+city)
   │
   ▼ M3
[business-analysis] BusinessAnalyzer ──► BusinessDossier (confidence/section)
   │                                        └─ media inventory ──► Media list
   ▼ M4/M6
[website-generation] ContentWriter ──► ContentBundle (all locales)
   │                          │
   │                          ▼ M6
   │                   WebsiteBuilder ──► Website (config bundle + assetManifest)
   ▼ M7
[qa] QA ──► 8 checks ──► Review ── verdict fail ──► defects ──► owners (rework loop)
   │                       │ pass*
   │                       ▼ M9/M10
[sales] Sales ──► Proposal ──► CRM deal ──► Ops (outreach draft)
   │                       ▲
[deployment] Deployment ──► build pipeline ──► DeploymentRecord ──► Ops/rollback
   │                           │
   ▼ M14/M15
[analytics] audit events + funnel + releases ──► AnalyticsReport (periodic)
```

`* pass_with_warnings also unblocks; warnings logged.`

## 2. Document Lifecycle

Every canonical document: `created → validated → stored → read (N) →
versioned (if corrected) → archived/retired`. Corrections never rewrite
history — they append a version and an audit entry.

## 3. Where Data Rests

| Stage | Produces | Stored in |
|---|---|---|
| Discovery | Lead | `storage/documents/leads/` |
| Analysis | Dossier + media inventory | `storage/documents/businesses/{id}/` |
| Generation | Website + ContentBundle | `storage/documents/websites/{id}/` |
| QA | Review | `storage/documents/reviews/` |
| Sales | Proposal | `storage/documents/proposals/` |
| Deployment | DeploymentRecord + dist | `storage/documents/deployments/` + `storage/artifacts/builds/` |
| Analytics | AnalyticsReport | `storage/documents/reports/` |
| All | audit events | `storage/events/run-{id}.ndjson` |

## 4. Facts vs Derived Data

- **Facts (sacred, dossier-first):** prices, hours, phone, address,
  contact links. Passed verbatim through ContentWriter → WebsiteBuilder;
  conflicts recorded, never guessed.
- **Derived (owner-specific):** copy, SEO text, palettes, section order,
  tiers, metrics. Each has exactly one producing agent.

## 5. Correctness Guarantees

1. Boundary validation on every document (schemas + engine QA rules).
2. Single-writer-per-document ownership matrix (AGENT_COMMUNICATION.md §3).
3. Append-only audit trail — any state is replayable.
4. Rollback pointer on every release — any build is revertible.

## 6. Data Gaps (future phases)

- Site visitor telemetry (post-deploy) — not in Phase 2.
- Scraping evidence store (raw fetched pages) — not in Phase 2.
