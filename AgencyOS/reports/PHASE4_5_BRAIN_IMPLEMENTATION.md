# Phase 4.0.5 Implementation Report — Agency Brain

> `AgencyOS/brain/` + 10 supporting engines — the decision & orchestration
> layer of AgencyOS. API version 1.0 (all modules).

## 1. Architecture Report

The Agency Brain converts discovery records into executed engagements through
a **deterministic, composable pipeline** of eleven modules. Each module is an
independent engine with its own API, JSON schema, and smoke suite; the `Brain`
facade composes them and wires into the existing Runtime.

```
 record ─▶ context ─▶ estimates ─▶ policies ─▶ decision ─▶ reasoning ─▶ strategy ─▶ planner ─▶ plan run ─▶ metrics
            (fact base)  (pure fn)   (gate)      (verdict)    (trace)      (tier)       (route)   (state machine)
```

### 1.1 Module Inventory

| Module | Responsibility | Key exports | Smoke |
|---|---|---|---|
| `rules/` | Weighted rule registry (register/unregister/run by category+scope) | `defineRule`, `RuleRegistry` | 18 PASS |
| `context/` | Deterministic fact base: scores, presence, flags, weaknesses | `ContextEngine.build(record)` | 32 PASS |
| `policies/` | JSON-editable guardrails (threshold + ignore kinds) | `PolicyEngine` (`defaults.json`) | 25 PASS |
| `state-machine/` | 17-state lifecycle: transitions, rollback, failures, timeouts, escalations | `StateMachine` (`states.js`) | 39 PASS |
| `execution-plans/` | Declarative 11-step plan runner with gates and retries | `ExecutionPlanRunner` (`plans/default.json`) | 31 PASS |
| `metrics/` | Counters/sums/snapshot/persist for the brain pipeline | `MetricsCollector` | 18 PASS |
| `strategy/` | premium/standard/light tiers from opportunity + ROI + closing | `StrategyEngine` (`strategies/default.json`) | 19 PASS |
| `decision-engine/` | Verdicts APPROVE/REJECT/ESCALATE/PARK, estimates, risk, confidence, priorities | `DecisionEngine` (+ `estimates.js`) | 38 PASS |
| `reasoning/` | Decision traces: evidence chain, influences, rationale | `ReasoningEngine` | 29 PASS |
| `planner/` | Strategy→plan mapping, gate context, proceed routing | `PlannerEngine` (`plans/catalog.json`) | 34 PASS |
| `brain/` | Facade: full pipeline + Runtime wiring (bus/validator/workflowRunner) | `Brain.runBusiness(record)` | 45 PASS |
| | | **Total** | **328 PASS** |

### 1.2 Decision Flow (as executed by `Brain.runBusiness`)

1. **Context** — `ContextEngine.build(record)` derives scores
   (business / opportunity / presence / brandQuality / reviews / rating),
   presence (websiteStatus none|ok|broken|slow, SEO, social activity, contact
   completeness, whatsapp, booking, photos, menus), flags (closed / duplicate /
   premiumWebsite / missingContact), and 9-rule weakness detection.
2. **Estimates** — `decisionEngine.estimate(ctx)` computes websiteValue,
   devCost (900 + pages×120), salesValue, ROI, closingProbability,
   buildTimeMs; attached to the context for policy evaluation.
3. **Policies** — 8 guardrails evaluated; `mandatoryFailed` drives the REJECT path.
4. **Decision** — 8 weighted rules (qualification/risk/policy categories);
   verdict precedence: policy-blocked → no-data → risk-high → APPROVE.
5. **Reasoning** — full evidence chain (context → estimation → confidence →
   risk → rules → policy → verdict) with headline and prose rationale.
6. **Strategy** — `strategyScore = 0.5·opportunity + 0.3·min(100, roi×40) +
   0.2·closing×100` → premium ≥ 70 / standard ≥ 45 / light.
7. **Planner** — `proceed()` gates REJECT/PARK; ESCALATE runs the plan but the
   `decisionApprove` gate blocks at `approval` (human review point).
8. **Execution** — plan steps drive the state machine (NEW → … → ARCHIVED)
   with the working-state pattern and retry loop.
9. **Metrics** — discovered/approved/succeeded/failed counters, opportunity
   avg, revenue, build time, success/failure rate.

### 1.3 State Machine

17 states; every state owns its `allowed[]` transitions, `rollback[]` targets,
`timeoutMs`, `timeoutAction` (none/archive/fail/retry/escalate) and failure rule
(maxRetries + action). `fail()` routes to RETRY while attempts remain, else
FAILED; escalations append to `instance.escalation[]` without losing state.

### 1.4 Metrics Model

`MetricsCollector` snapshot:

```json
{
  "businesses":     { "discovered": 6, "skipped": 0, "approved": 3, "websitesGenerated": 0 },
  "performance":    { "avgOpportunityScore": 49.5, "estimatedRevenue": 18604, "avgBuildTimeMs": 538000 },
  "reliability":    { "successRate": 100, "failureRate": 0, "retryCount": 0, "escalations": 0 }
}
```

Persisted to `storage/<root>/metrics.json` (gitignored) via atomic writes.

### 1.5 Integration Points

- `createExecutor({ runId })` → one object with EventBus, Validator,
  WorkflowRunner, ContextManager; the Brain adopts it (`bus`, `validator`,
  `executeWorkflow(id, input)`).
- Brain emits `brain.lead_discovered`, `brain.decision_made`,
  `brain.strategy_selected`, `brain.plan_started`, `brain.plan_completed` on the
  shared bus.
- Executors are injectable per action: `brain.registerExecutor(action, fn)` —
  the future home for real website generation / CRM / outreach.

## 2. Files Created

| File | Purpose |
|---|---|
| `brain/{package.json, errors.js, engine.js, index.js, smoke.mjs}` | facade, BRN error codes, pipeline, API, 45 assertions |
| `brain/schemas/brain-run.schema.json` | run summary contract |
| `decision-engine/{engine.js, estimates.js, index.js, errors.js, smoke.mjs}` | decision core + pure estimate functions |
| `decision-engine/rules/index.js` | 8 registered decision rules |
| `decision-engine/schemas/decision.schema.json` | decision contract |
| `reasoning/{engine.js, errors.js, index.js, smoke.mjs}` | trace generation |
| `planner/{engine.js, errors.js, index.js, smoke.mjs}` | strategy→plan routing |
| `planner/plans/catalog.json` | hint → plan mapping |
| `strategy/strategies/default.json` | 3 strategy tiers (config data) |
| `execution-plans/plans/default.json` | 11-step default plan (config data) |
| `policies/defaults.json` | 8 default policies (config data) |
| `context/schemas/context.schema.json` | context contract |
| `state-machine/schemas/instance.schema.json` | instance contract |
| `rules/{registry.js, errors.js, index.js, smoke.mjs}` | rule registry |
| `metrics/{engine.js, errors.js, index.js, smoke.mjs}` | collector |
| `state-machine/{states.js, engine.js, index.js, smoke.mjs}` | lifecycle |
| `execution-plans/{engine.js, errors.js, index.js, smoke.mjs}` | plan runner |
| `policies/{engine.js, errors.js, index.js, smoke.mjs}` | guardrails |
| `context/{engine.js, errors.js, index.js, smoke.mjs}` | fact base |
| `demo.mjs` | 6-business end-to-end demo |
| `SYSTEM_DESIGN.md`, `DECISION_ENGINE.md`, `STATE_MACHINE.md`, `EXECUTION_PLANNER.md`, `POLICIES.md`, `ARCHITECTURE.md` | documentation |

## 3. Future Extension Points

1. **AI reasoning** — `reasoning/` emits a structured evidence chain per
   decision; an LLM layer can read it verbatim (or replace rule weights in
   `decision-engine/rules/` without touching the pipeline).
2. **New strategies/plans** — additive JSON only (`strategy/strategies/`,
   `planner/plans/catalog.json`, `execution-plans/plans/`).
3. **Real execution** — `registerExecutor(action, fn)` swaps deterministic
   defaults for production services.
4. **Policy tuning** — `policies/defaults.json` and `applyOverrides` without code.

## 4. Production Readiness Score

| Criterion | Rating | Notes |
|---|---|---|
| Determinism | 5/5 | stable IDs, seeded generation, pure estimates |
| Correctness (tests) | 5/5 | 328 brain assertions + 344 prior-suite assertions, all green |
| Validation | 4/5 | 6 JSON schemas; decision/instance validated on demand |
| Observability | 5/5 | bus events, traces, metrics snapshot, per-step results |
| Resilience | 4/5 | retries, timeouts, escalations, handled gate failures |
| Configurability | 5/5 | policies/strategies/plans/gates/executors injectable |
| Integration | 5/5 | Runtime wiring via `createExecutor`, zero duplication |
| **Overall** | **4.7/5** | production-ready deterministic core; AI + real services plug in at defined seams |

## 5. Verification

```bash
node AgencyOS/brain/smoke.mjs      # 45 PASS  (end-to-end facade)
node AgencyOS/demo.mjs             # full market pipeline + traces + metrics
node AgencyOS/rules/smoke.mjs      # … all 11 suites green (328 PASS total)
# regression: runtime (ALL PASS), communication 25, memory 36, artifacts 33,
#              validation 56, scheduler 49, discovery 145  — all green
```

## 6. Stop Condition Reached

Phase 4.0.5 complete. **Phase 4.1 not started** per instructions.
