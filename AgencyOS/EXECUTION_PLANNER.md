# AgencyOS — Execution Planner (`execution-plans/`)

> Declarative, state-machine-driven step execution. Plans are JSON; the runner
> is engine-agnostic.

## The Default Plan (`plans/default.json`)

11 steps; each step declares the state it must reach and optional gate:

| # | step id | action | target state | gate |
|---|---|---|---|---|
| 1 | discovery | `discovery` | DISCOVERED | — |
| 2 | validation | `validation` | VALIDATED | `policiesPass` |
| 3 | analysis | `analysis` | ANALYZED | — |
| 4 | dossier | `dossier` | ANALYZED | — |
| 5 | approval | `approval` | APPROVED | `decisionApprove` |
| 6 | generation | `website-generation` | GENERATED | — |
| 7 | qa | `qa` | QA | — |
| 8 | proposal | `proposal` | PROPOSAL | — |
| 9 | followup | `crm` | FOLLOW_UP | — |
| 10 | close | `close` | CLOSED | — |
| 11 | archive | `archive` | ARCHIVED | — |

## How a step runs

1. Compute the real transition path with BFS over the state machine graph
   (`pathTo(instance, target)`) — only legal transitions are used.
2. If the path needs an intermediate "working" state (e.g. `GENERATING` before
   `GENERATED`), transition into it **before** executing (working-state pattern —
   this is what makes retries legal: `GENERATING → RETRY → GENERATING`).
3. Evaluate the gate (if any) against the gate context
   (`policyVerdict`, `decisionVerdict`).
4. Run the executor (custom first, then built-in defaults).
5. Walk the remaining hops, then `applyTimeout(instance, durationMs)`.
6. On error: `fail()` → if retryable and attempts ≤ max → `RETRY` +
   `retryTo(working)` and loop; else return `ok: false`.

Gate failures are **not exceptions** — they return `{ ok: false, error: 'gate … blocked step' }`
and the run reports `currentStep` + `state` so the orchestrator knows exactly
where execution stopped (e.g. ESCALATE verdict blocks at `approval`).

## Deterministic executors

The default `website-generation` executor is seeded with
`hash(businessId + '|' + stepId)`: the same business always yields the same
website output (pages, buildMs) across runs and machines.

## Result shape

```js
{
  planId, ok,
  currentStep: stepId | null,
  state: instance.current,
  results: [{ stepId, action, state, ok, attempts, durationMs, output | error }],
  failure: error message | null
}
```

## Usage

```js
import { createExecutionPlanRunner } from './execution-plans/index.js';
const runner = createExecutionPlanRunner();
const out = await runner.run(plan, {
  stateMachine, instance,
  executors: { 'website-generation': myExecutor }, // optional overrides
  context: { policyVerdict: 'pass', decisionVerdict: 'APPROVE' }
});
```
