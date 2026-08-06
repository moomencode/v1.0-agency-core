# Shared Module: Rate Limiting

> Polite external access — the OS never hammers the web or itself.

## Purpose

LeadHunter and BusinessAnalyzer talk to external sites; every agent
talks to storage and each other. Rate limiting keeps the OS a good
citizen of the web and a stable system internally.

## Tiers

| Tier | Subject | Default limits |
|---|---|---|
| External (web) | per-source host | 10 req / min, burst 5 |
| External (social) | per platform | 20 req / min |
| Internal (storage) | per agent | 100 ops / min |
| Internal (agent-to-agent) | per producer | 30 msg / min |
| CRM writes | global | 60 / min |

## Algorithm

- **Token bucket** per key: capacity = burst, refill = steady rate.
- Keys: `ext::{host}`, `ext::{platform}`, `int::{producer}`,
  `crm::global`.
- On `429` from upstream, honor `Retry-After` up to a 60 s cap, then
  consult the Retry module.
- Queue with bounded depth (100); overflow becomes a typed
  `E_TR_RATE_LIMITED` error.

## Rules

- Backoff-aware: rate limits and retries share one budget per run — a
  run cannot retry its way past politeness limits.
- Headers: identify politely where the target allows (descriptive User
  Agent per runId); never spoof.
- The OS degrades gracefully: when external limits are exhausted,
  BusinessAnalyzer flags facts `low confidence` rather than hammering.

## Failure Modes

| Mode | Handling |
|---|---|
| Upstream anti-bot | stop fetching host; mark evidence missing |
| Self-inflicted thundering herd | stagger run starts (jitter ±10 s) |
| Limit misconfig | log `E_TR_RATE_LIMITED`; ops tunes tier |
