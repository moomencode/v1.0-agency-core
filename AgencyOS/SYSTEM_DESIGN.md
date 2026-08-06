# AgencyOS — Phase 4.0.5 System Design

> The Agency Brain: a deterministic decision & orchestration layer that takes
> discovered businesses and runs them through policy checks, decisions, plans,
> and state — with full traceability and metrics.

## 1. Design Goals

1. **Deterministic** — the same business record always produces the same
   context, decision, strategy, and plan outputs (only wall-clock timings vary).
2. **Composable engines** — every concern (rules, context, policies, state,
   plans, metrics, strategy, decisions, reasoning, planning) is an independent
   module with its own API, schema, and smoke suite.
3. **Data-driven configuration** — policies and strategies are plain JSON that
   can be edited without code changes; plans are declarative step definitions.
4. **Runtime-integrated** — the Brain wires into the existing Runtime
   (EventBus, Validator, WorkflowRunner) instead of duplicating infrastructure.
5. **AI-ready** — every decision carries a trace (`reasoning/`) so a future
   reasoning model can consume and extend the same decision flow without
   architecture changes.

## 2. The Pipeline

```
discovery record
      │
      ▼
┌─────────────┐   ┌──────────────────┐
│ context/    │──▶│ deterministic    │   scores, presence, flags, weaknesses
│ ContextEngine│  │ fact base        │
└─────────────┘   └──────────────────┘
      │
      ▼
┌──────────────────────┐
│ decision-engine/     │  estimate()  ── financial estimates (pure)
│                      │  ── attached to context as context.estimates
└──────────────────────┘
      │
      ▼
┌─────────────┐   ┌──────────────────────────┐
│ policies/   │──▶│ policySummary + mandatory │
│ PolicyEngine│   │ (verdict, mandatoryFailed)│
└─────────────┘   └──────────────────────────┘
      │
      ▼
┌──────────────────────┐   ┌─────────────┐   ┌────────────────────────┐
│ decision-engine/     │   │ reasoning/  │   │ strategy/              │
│ evaluate(ctx,{policies})│─▶│ trace()     │   │ select(estimates)      │
│ → verdict + estimates│   │ → evidence  │   │ → premium/standard/light│
└──────────────────────┘   └─────────────┘   └────────────────────────┘
      │                                             │
      ▼                                             ▼
┌─────────────┐   ┌──────────────────────────────┐  │
│ planner/    │──▶│ proceed() + select(strategy, │  │
│ PlannerEngine│  │ decision, policySummary)     │  │
└─────────────┘   │ → plan + gateContext         │  │
                  └──────────────────────────────┘  │
      │                                            │
      ▼                                            ▼
┌────────────────────────────────────────────────────────┐
│ brain/  Brain.runBusiness(record)                      │
│  ┌─────────────────────────────────────────────────┐   │
│  │ state-machine/ instance (NEW → … → ARCHIVED)    │   │
│  │ execution-plans/ run(plan, {stateMachine,       │   │
│  │   instance, executors, context: gateContext})   │   │
│  │ metrics/ discovered/approved/succeeded/failed   │   │
│  │ runtime bus events brain.*                       │   │
│  └─────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

## 3. Verdict Semantics

| Verdict | When | Planner routing |
|---|---|---|
| `APPROVE` | policy gate passes, no risk escalation, enough data | plan executes |
| `REJECT` | at least one **mandatory** policy fails | no plan (state stays `NEW`) |
| `ESCALATE` | risk level `high` (≥2 major weaknesses) | plan starts, blocks at `approval` gate — human review |
| `PARK` | `no-data` rule matched, no policy failure | no plan (without policies); with mandatory policies missing data → `REJECT` |

Precedence: policy-blocked → no-data → risk.

## 4. Determinism Rules

- Context scores are computed from the record only — no randomness.
- Decision ID: `dec-` + 10-char hash of `businessId` (stable across runs).
- State machine IDs: `stm-` + decisionId (stable).
- Website-generation executor output uses a seeded RNG keyed by
  `businessId|stepId` — identical output for identical input.
- The only non-deterministic values are timestamps and `durationMs`.

## 5. Where the Brain Meets the Runtime

- `createExecutor({ runId })` from `runtime/` wires EventBus + Validator +
  WorkflowRunner + ContextManager in one object; the Brain accepts it and
  inherits all of it (`brain.bus`, `brain.validator`,
  `brain.executeWorkflow(workflowId, input)`).
- Brain events (`brain.lead_discovered`, `brain.decision_made`,
  `brain.strategy_selected`, `brain.plan_started`, `brain.plan_completed`)
  are emitted on the shared bus for observability.
