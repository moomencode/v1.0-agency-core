# Scheduler Engine (Phase 3.5)

> Autonomous job scheduling for AgencyOS — cron, intervals, one-shot runs, retries,
> priority queuing, persistence, and real workflow execution.

## Overview

The scheduler runs jobs **on their own** — no manual orchestration needed. A job is a
named, persisted configuration that executes either a **workflow** (through the Phase
3.0 runtime) or a **named handler** (inline function). Jobs can be triggered manually,
on a **cron schedule**, on a **fixed interval**, or at a **one-shot timestamp**, with
automatic retries, backoff, priority ordering, and concurrency limits.

```text
createSchedulerSystem({ root, tickMs, maxWorkers })
        │
        ▼
SchedulerSystem (facade)        AgencyOS/scheduler/index.js
   ├── handlers Map              named inline handlers
   ├── Executor (lazy)           real workflow execution (runtime/)
   ├── JobRunner                 timeout + run records + stats
   └── SchedulerEngine           ticker, queue, retries, events
          ├── JobQueue           priority desc + FIFO + dueAt
          └── JobStore           persistent _jobs.json + _history.json
```

## Quick Start

```js
import { createSchedulerSystem } from './AgencyOS/scheduler/index.js';

const sys = createSchedulerSystem({ root: process.cwd(), tickMs: 1000 });

sys.registerJob({
  id: 'daily-leads',
  name: 'Daily lead discovery',
  workflowId: 'lead-discovery',
  schedule: { cron: '30 6 * * *' }        // 06:30 every day
});

sys.start();
```

## Job Definition

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `id` | string | auto (`job-{ts}-{rand}`) | unique job id |
| `name` | string | — | human-readable label |
| `workflowId` | string | — | workflow to execute (xor with `handler`) |
| `handler` | string | — | named handler registered via `registerHandler` |
| `type` | string | — | `handler` forces handler dispatch |
| `input` | object | `{}` | static input payload (merged with trigger input) |
| `options` | object | — | executor options (e.g. `seed`) |
| `schedule` | object | — | `{ cron, intervalMs, at }` — see below |
| `priority` | int | `5` | 0–10; higher runs first |
| `maxAttempts` | int | `1` | retries on failure (including first run) |
| `retryDelayMs` | int | `200` | base retry delay |
| `backoff` | string | `exponential` | `exponential` or `fixed` |
| `timeoutMs` | int | `60000` | per-run execution timeout |
| `enabled` | bool | `true` | disabled jobs never run |
| `nextRunAt` | ISO | — | persisted next scheduled run (managed) |

## Schedules

- **cron** — 5 or 6 fields (optional seconds first). Names (`MON`–`SUN`,
  `jan`–`dec`), lists, ranges, steps (`*/15`), `?` wildcard, DOM/DOW OR semantics,
  `7` alias for Sunday. `sys.schedule('30 6 * * 1-5')` returns `{ valid, summary,
  nextRunAt, hasSeconds }`.
- **interval** — `{ intervalMs: 60000 }`; runs every N ms (not drift-corrected).
- **at** — `{ at: '<ISO>' }`; one-shot run at a timestamp.

## Behavior

- **Manual trigger** — `await sys.trigger(id, input)` resolves with the final run
  record (after retries). Queued with the job's priority; unknown / disabled jobs
  are rejected.
- **Retries** — failed attempts are re-queued with `retryDelayMs * 2^(attempt-1)`
  (capped at 1h for exponential). Every attempt is recorded in history.
- **Concurrency** — at most `maxWorkers` runs at once; the queue is drained after
  each run completes.
- **Persistence** — jobs and run history survive restarts under
  `storage/scheduler-engine/` (`_jobs.json`, `_history.json`). History is capped at
  100 runs per job / 2000 total.
- **Events** — `job_started`, `job_retry`, `job_succeeded`, `job_failed` via
  `sys.on(event, cb)`.
- **Control** — `pause` / `resume` / `updateJob` / `removeJob` / `stop` / `close`.

## Errors

All scheduler errors use `E_SCH_*` codes from `AgencyOS/scheduler/errors.js`:

| Code | Meaning |
| --- | --- |
| `E_SCH_UNKNOWN_JOB` | trigger / update / remove on a missing job |
| `E_SCH_DUPLICATE_JOB` | `registerJob` with an existing id |
| `E_SCH_INVALID_JOB` | job without `workflowId` or `handler` |
| `E_SCH_CRON_INVALID` | unparseable cron expression |
| `E_SCH_SCHEDULE_INVALID` | invalid interval / one-shot schedule |
| `E_SCH_INPUT_INVALID` | bad input payload |
| `E_SCH_JOB_DISABLED` | trigger on a disabled job |
| `E_SCH_EXECUTOR_ERROR` | execution failure (also surfaced in run records) |
| `E_SCH_STORE_ERROR` | persistence failure |

## API Surface (stable, `SCHEDULER_API_VERSION = '1.0'`)

`registerJob` · `updateJob` · `removeJob` · `trigger` · `pause` · `resume` ·
`listJobs` · `getJob` · `history` · `stats` · `schedule` · `nextRunAt` ·
`registerHandler` · `on` / `off` · `start` · `stop` · `close`

## Smoke & Demo

```bash
node AgencyOS/scheduler/smoke.mjs   # 49 PASS, 0 FAIL
node AgencyOS/scheduler/demo.mjs    # end-to-end demo on real storage
```
