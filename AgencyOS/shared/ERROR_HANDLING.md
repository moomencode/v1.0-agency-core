# Shared Module: Error Handling

> Typed errors, clear owners, and graceful degradation.

## Purpose

Every failure in the OS is a typed, structured `Error` that can be
routed: to a retry (transient), to a defect report (content/data), or to
ops (infrastructure). No silent failures.

## Error Taxonomy

| Kind | Code prefix | Examples | Routing |
|---|---|---|---|
| Transient | `E_TR_*` | `E_TR_TIMEOUT`, `E_TR_NETWORK` | Retry module |
| Validation | `E_VA_*` | `E_VA_SCHEMA`, `E_VA_MISSING_KEY` | defect to owner |
| Data | `E_DA_*` | `E_DA_NO_EVIDENCE`, `E_DA_UNRESOLVED_CONFLICT` | defect to owner |
| Infrastructure | `E_IN_*` | `E_IN_STORAGE`, `E_IN_AUTH` | ops alert |
| State | `E_ST_*` | `E_ST_INVALID_TRANSITION` | reject event |

## Error Object

```json
{
  "code": "E_VA_SCHEMA",
  "message": "config/menu.json missing categories",
  "agent": "website-builder",
  "documentId": "website_w1",
  "retryable": false,
  "defect": { "owner": "content-writer", "location": "config/menu.json" }
}
```

## Rules

- Agents never throw raw strings or swallow errors — every catch
  produces a typed error, logged via Logging.
- `retryable: true` → Retry module decides; `false` → Error is converted
  to a defect (QA route) or a rejection (CRM route) and emitted.
- The error taxonomy is additive: new codes are added centrally, never
  per-agent ad hoc.
- Fatal infrastructure errors put the run into `paused` state for ops;
  they never silently continue.

## Failure Modes

| Mode | Handling |
|---|---|
| Untyped error arrives | wrap as `E_IN_UNKNOWN`; ops alert |
| Error without owner | default to `website-builder`, escalate to ops |
| Error storm | per-run error budget (see Retry) |
