# Workflow: Full Pipeline

> The complete lead-to-launch flow, orchestrated end to end.

## Purpose

Binds the five stage workflows into one runnable pipeline with clear
gates, rework loops, and observability. This is the operator's cockpit
view of the agency OS.

## Flow

```
lead-discovery ──► business-analysis ──► website-generation ──► qa ──► sales
        ▲                                      ▲                    │
        │           (rework loop)              │                    ▼
        └───────────── owners fix ◄────────────┘            deployment ◄── approval
                                                                   │
                                                                   ▼
                                                            analytics (periodic)
```

## Stage Table

| Stage | Workflow | Entry | Exit | Gate |
|---|---|---|---|---|
| 01 | lead-discovery | raw mention | qualified Lead | score ≥ 60 |
| 02 | business-analysis | qualified Lead | BusinessDossier | confidence per section |
| 03 | website-generation | dossier | Website doc | zero conflicts |
| 04 | qa | Website doc | Review | verdict pass* |
| 05 | sales | approved Review | Proposal ready | approval |
| 06 | deployment | approved Review | DeploymentRecord | approved + build pass |
| 07 | analytics | event streams | AnalyticsReport | period end |

`*` pass_with_warnings also unblocks, with warnings logged.

## Rework Loops

- QA fail → defects routed to `business-analyzer` / `content-writer` /
  `website-builder` → regenerate → re-enter QA.
- Deployment build fail → defect report → owners fix → re-enter QA.

## Contracts

- Cross-agent messages: see `reports/DATA_FLOW.md`
- Agent responsibilities: see `reports/AGENT_COMMUNICATION.md`
- Architecture: see `reports/SYSTEM_ARCHITECTURE.md`

## Notes

- Each stage emits one canonical document; the exit document of stage N
  is the entry document of stage N+1 (with enrichments).
- No stage writes into another stage's output documents — corrections go
  through the rework loop.
