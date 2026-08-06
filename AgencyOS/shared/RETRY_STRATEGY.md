# Shared Module: Retry Strategy

> Uniform, bounded retries for transient failures.

## Purpose

External calls (fetch, build, storage) fail. Retry gives each agent one
consistent way to recover from transient errors while never masking
permanent ones.

## Policy

| Property | Value |
|---|---|
| Max attempts | 3 (configurable per agent, `config.json → retry`) |
| Backoff | exponential: `initialDelay * 2^(attempt-1)` + jitter (±20%) |
| Initial delay | 500 ms (1 s for builds) |
| Retryable | `network-flake`, `timeout`, `5xx`, `rate-limited` |
| Non-retryable | `4xx` (except 429), `schema-invalid`, `permission` |

## Decision Table

| Error | Action |
|---|---|
| `network-flake` / `timeout` | retry with backoff |
| `429 rate-limited` | retry after `Retry-After` (respect cap) |
| `5xx` | retry (max 2 extra) |
| `4xx` non-429 | fail fast, log via Error Handling |
| schema invalid | fail fast — defect, do not retry |
| build failure (deterministic) | fail fast — route defect, no retry |

## Rules

- Every retry emits a `retry` log event with `attempt` and `error`.
- Total retry budget is capped per run (`runId`); runaway loops are
  forbidden — after the budget, the run fails and re-enters the workflow
  gate.
- Retries are idempotent: retried calls must be safe to repeat (create
  endpoints use client-generated ids).

## Failure Modes

| Mode | Handling |
|---|---|
| Budget exhausted | fail run; defect with attempt log |
| Jitter collision | acceptable; backoff window absorbs |
| Retry storm (multi-agent) | per-run budget + global 429-aware throttle |
