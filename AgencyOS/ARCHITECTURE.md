# AgencyOS — Architecture (`ARCHITECTURE.md`)

## Module Inventory — Phase 4.0.5 (Agency Brain)

| module | responsibility | API version | smoke |
|---|---|---|---|
| `brain/` | facade + pipeline orchestration, Runtime wiring | 1.0 | 45 PASS |
| `decision-engine/` | verdicts, estimates, risk, confidence, priorities | 1.0 | 38 PASS |
| `reasoning/` | decision traces, rationale, evidence chains | 1.0 | 29 PASS |
| `planner/` | strategy→plan mapping, gate context, routing | 1.0 | 34 PASS |
| `strategy/` | premium/standard/light selection | 1.0 | 19 PASS |
| `execution-plans/` | declarative plan runner, gates, retries | 1.0 | 31 PASS |
| `state-machine/` | 17 states, transitions, failures, timeouts | 1.0 | 39 PASS |
| `policies/` | JSON-editable guardrails | 1.0 | 25 PASS |
| `context/` | deterministic fact base builder | 1.0 | 32 PASS |
| `rules/` | rule registry + evaluation | 1.0 | 18 PASS |
| `metrics/` | counters, sums, snapshot, persistence | 1.0 | 18 PASS |

**Brain total: 328 PASS.** (Full regression across phases 3.0–4.0.5: 672+ PASS.)

## Dependency Graph

```
brain/
 ├── context/            (build fact base)
 ├── decision-engine/    (estimates + verdict; uses rules/, consumes policies/)
 ├── reasoning/          (traces decision)
 ├── strategy/           (selects engagement type)
 ├── planner/            (routes strategy → execution plan; uses execution-plans/)
 ├── state-machine/      (instance lifecycle)
 ├── execution-plans/    (runs steps; uses state-machine/)
 ├── policies/           (gate evaluation)
 ├── metrics/            (observability)
 └── runtime/            (EventBus, Validator, WorkflowRunner — injected, never duplicated)

rules/ ← decision-engine  (rule registry consumed by the decision rules)
```

No module duplicates logic: `execution-plans/` delegates all state transitions
to `state-machine/`; `decision-engine/` computes estimates once and shares them
via `context.estimates`; `planner/` delegates plan loading to
`execution-plans/`.

## Integration Points with the Runtime

| Brain hook | Runtime object |
|---|---|
| `brain.bus` / `brain._emit()` | `EventBus.emitEvent(event, meta, detail)` — events `brain.*` |
| `brain.validator` | `Validator.validate(obj, schema, { schemaPath })` |
| `brain.executeWorkflow(id, input)` | `WorkflowRunner.run(...)` (unavailable → `{status:'unavailable'}`) |
| `new Brain({ executor })` | `createExecutor({ runId })` wires all of the above at once |
| metrics persistence | `storage/<root>/metrics.json` via `atomicWrite` (gitignored) |

## Future Extension Points (AI reasoning)

- `reasoning/` already produces a structured **evidence chain** per decision —
  a natural input contract for an LLM explainer or auto-adjustment loop.
- `decision-engine` rules are plain data objects registered in `rules/index.js` —
  a learned model can replace weights, not code.
- `policies/defaults.json` + `strategy/strategies/default.json` are operator
  editable without redeploys.
- `planner/plans/catalog.json` maps any strategy `planHint` to any plan id —
  new plans are additive JSON.
- `execution-plans` executors are injectable: real website generation, CRM,
  or outreach can be dropped in via `brain.registerExecutor(action, fn)`.

## Production Readiness

| area | status |
|---|---|
| determinism | guaranteed except timestamps/durationMs; seeded generation |
| validation | schemas for context, policy, plan, instance, decision, brain-run |
| observability | bus events, per-step results, metrics snapshot, reasoning traces |
| resilience | retry policy per state, timeout actions, escalation records, gate failures are handled results |
| configurability | policies, strategies, plan catalog, gates, executors all injectable |
| test coverage | 11 suites, 328 brain assertions, all green |
| persistence | metrics + state summaries to `storage/` (gitignored) |
| runtime footprint | zero runtime deps, Node 24 ESM only |

## Run It

```bash
node AgencyOS/brain/smoke.mjs      # 45 PASS — facade end-to-end
node AgencyOS/demo.mjs             # 6-business market through the pipeline
# per-module: node AgencyOS/<module>/smoke.mjs
```
