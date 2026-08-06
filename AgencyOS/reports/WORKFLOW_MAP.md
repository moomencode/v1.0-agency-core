# Workflow Map

> Every workflow at a glance: triggers, steps, gates, exit conditions.

## Legend

- `◉` entry document · `◉` exit document · `⛔` gate · `⟲` rework

## 1. lead-discovery

```
◉ raw mention ──► LeadHunter ──► score ≥ 60? ──yes──► ◉ qualified Lead ──► CRM
                       │                │
                       │                no
                       ▼                ▼
                   evidence        ◉ disqualified + exclusion list
```
Exit: qualified Lead in CRM **or** disqualified with evidence.

## 2. business-analysis

```
◉ qualified Lead ──► BusinessAnalyzer ──► dossier sections (confidence/section)
                       │
                       ├─ needsVerification? ──► ops verification (optional)
                       └─► ◉ BusinessDossier ──► ContentWriter
```
Exit: dossier `complete` with per-section confidence; or `incomplete`
with escalation.

## 3. website-generation

```
◉ BusinessDossier ──► ContentWriter ──► ContentBundle (all locales)
                            │
                            ▼
                     WebsiteBuilder ──► conflicts? ──► ◉ Website (ready) ──► QA
                                             │
                                             └─◉ Website (conflicted) ──⟲ fix
```
Exit: Website doc with zero conflicts, or conflicted doc routed back.

## 4. qa

```
◉ Website + preview ──► QA ──► 8 checks ──► any fail? ──► ◉ Review (fail)
                                             │                │
                                             │                ▼
                                             │          defects ──► owners ──⟲ generation
                                             │
                                             ▼
                                    ◉ Review (pass / pass_with_warnings) ──► Sales + Deployment
```
Exit: approved Review, or defect report with owner routing.

## 5. sales

```
◉ approved Review ──► Sales ──► tier + timeline ──► ◉ Proposal (ready) ──► CRM deal + Ops draft
                            │
                            └─ verdict fail ──► ◉ Proposal (blocked)
```
Exit: ready Proposal + open deal + outreach draft; or blocked.

## 6. deployment

```
◉ approved Review ──► materialize config/assets ──► engine QA ──► build ──► sitemap
                        │                                │
                        ▼                                fail
                   ◉ DeploymentRecord (deployed) ◄──────┴──► ◉ failed + defects ──⟲ QA
```
Exit: deployed + verified + versioned (rollback pointer), or failed with
owner routing.

## 7. full-pipeline (orchestration)

```
lead-discovery ⟶ business-analysis ⟶ website-generation ⟶ qa ⟶ sales
     ▲                                                   │        │
     │                      ⟲ rework                     │        ▼
     └────────────────────────────────────────────────────┘  deployment
                                                                  │
                                                                  ▼
                                                           analytics (periodic)
```
Gates: score ≥ 60 · dossier complete · zero conflicts · approved review ·
QA pass before deployment. Rework loops re-enter at the owning stage.

## Gate Summary

| Work | Blocked until |
|---|---|
| Analysis | qualified Lead |
| Generation | dossier complete |
| QA | Website doc |
| Sales | review approved |
| Deployment | review approved + engine QA pass |
| Analytics | period end |
