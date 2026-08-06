# AgencyOS — State Machine (`state-machine/`)

> The single source of truth for where an execution currently is, what may
> happen next, and how failures and timeouts are handled.

## States (17)

```
NEW → DISCOVERED → VALIDATED → ANALYZED → APPROVED → GENERATING → GENERATED → QA
   → READY → PROPOSAL → SENT → FOLLOW_UP → CLIENT_RESPONSE → CLOSED → ARCHIVED

FAILED  (terminal, from any working state after retries exhausted)
RETRY   (intermediate: fail() lands here when a retry is permitted)
```

`START_STATE = NEW`, end states: `ARCHIVED` (also `CLOSED`).

## Transition Rules

- Every state defines its own `allowed[]` transition list in `states.js`.
  Anything else throws `ILLEGAL_TRANSITION` — impossible state graphs cannot
  be reached by accident.
- `rollback[]` per state permits jumps back to safe states (e.g. QA → GENERATING)
  and is enforced separately from the allowed list.
- `RETRY` may only leave via `retryTo()` (GENERATING / QA / FAILED / ARCHIVED).
- Rollback/retry/timeout paths share the internal `_do()` transition core, so
  attempt counters and history stay consistent.

## Failure Rules (per state in `states.js`)

| State | maxRetries | action |
|---|---|---|
| GENERATING | 2 | retry |
| QA | 2 | retry |
| GENERATED | 0 | fail |
| SENT / FOLLOW_UP | 3 | follow_up |
| default | 2 | fail |

`fail()` → if action is retry/follow_up and attempts < maxRetries → `RETRY`;
otherwise → `FAILED`.

## Timeouts (per state `timeoutMs` + `timeoutAction`)

| action | behavior |
|---|---|
| `archive` | transition to ARCHIVED |
| `fail` | transition to FAILED |
| `retry` | routed through `fail()` (respects maxRetries) |
| `escalate` | append to `instance.escalation[]`, keep state |

`applyTimeout(instance, elapsedMs)` is a no-op below `timeoutMs`. After any
timeout, `instance.timeoutTriggered = true`.

## Instance shape

```js
{
  id: 'stm-dec-xxxx', entityType: 'business',
  current: 'NEW',
  history: [{ from, to, at, by, reason }],
  attempts: { 'GENERATING>RETRY': 1, ... },
  timeoutTriggered: false,
  escalation: []            // only when escalated
}
```

## Usage

```js
import { createStateMachine } from './state-machine/index.js';
const sm = createStateMachine();
const instance = sm.create({ id: 'stm-x', entityType: 'business' });
sm.transition(instance, 'DISCOVERED', { by: 'plan', reason: 'discovery done' });
sm.applyTimeout(instance, elapsedMs, { by: 'system' });
sm.summary(instance); // current, transitions, attempts, escalated
```
