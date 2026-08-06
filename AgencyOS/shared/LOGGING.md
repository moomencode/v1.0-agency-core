# Shared Module: Logging

> Structured, central observability for every agent.

## Purpose

Every agent emits structured logs. Logs are the audit trail of the OS:
they feed reports, debugging, and Analytics. Without logs, a run cannot
be replayed.

## Conventions

- **Format:** one JSON object per line with the shape below.
- **Levels:** `debug`, `info`, `warn`, `error`, `fatal`.
- **Correlation:** every run carries `runId`; every document carries its
  `documentId`; both are included in every log line.

```json
{
  "ts": "2026-08-06T10:00:00Z",
  "level": "info",
  "runId": "run_abc123",
  "agent": "lead-hunter",
  "documentId": "lead_l1",
  "event": "lead_qualified",
  "detail": { "score": 82 },
  "durationMs": 3120
}
```

## Rules

- No unstructured messages: events map to fixed `event` names
  (`agent_started`, `agent_completed`, `gate_passed`, `gate_failed`,
  `defect_raised`, `rejected`, `retry`).
- `error` logs carry `detail.error` and `detail.attempt`.
- Logs are append-only, rotated daily, retained 90 days.

## Failure Modes

| Mode | Handling |
|---|---|
| Log sink down | buffer to memory; flush on recovery; never drop fatal |
| PII in detail | scrub before emit — phone/email masked |
| Event naming drift | central registry in `reports/AGENT_COMMUNICATION.md` |
