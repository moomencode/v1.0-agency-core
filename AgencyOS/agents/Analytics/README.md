# Analytics Agent

> Insight agent — turns operations and site telemetry into decisions.

## Mission

After a site is deployed (or a pipeline run completes), Analytics
aggregates events from all agents into periodic reports: performance,
quality, funnel, and business-site health. Reports feed the agency
operator and refine future pipeline runs (e.g. scoring weights).

## Inputs

| Source | Contents |
|---|---|
| any agent | audit events, timestamps, run metadata |
| CRM | pipeline funnel state |
| Deployment | release records |
| Site telemetry (external) | visitor events (future phase) |

## Output

`AnalyticsReport`: metrics, trends, anomalies, and recommendations.

## Responsibilities

- Aggregate run performance (duration per agent, success rate)
- Track quality over time (defect counts, verdicts per business type)
- Track funnel health (leads → proposals → wins)
- Compute site health (deployed sites, uptime flags from telemetry)
- Detect anomalies (regressions, drop-offs) and route recommendations

## Handoffs

| Downstream | Message |
|---|---|
| Ops/reports | period summaries |
| LeadHunter | scoring weight tuning hints |
| Sales | funnel conversion insights |

## Failure Modes

| Mode | Handling |
|---|---|
| Missing events | mark report `partial`; list gaps |
| Empty period | empty report, not error |
| Anomaly found | attach `anomalies[]` with recommended owner |

## Guardrails

- Reports are read-only over event streams; never mutates CRM/deals
- Metrics always carry units and period bounds (from → to)
- Recommendations are advisory; scoring changes are ops decisions
