# Shared Module: Validation

> Contract enforcement at every boundary.

## Purpose

Every agent input and output is validated against its JSON Schema at the
boundary. Garbage in is rejected before it becomes a document; garbage
out is a defect, not a surprise.

## Boundaries

| Boundary | Validated against | On failure |
|---|---|---|
| Agent input | `agents/{agent}/input.schema.json` | reject with `E_VA_SCHEMA` |
| Agent output | `agents/{agent}/output.schema.json` | defect, re-run |
| Cross-agent doc | canonical `schemas/*.schema.json` | gate blocks workflow |
| Engine config | engine `scripts/qa.mjs` rules | build aborted |

## Rules

- **Validate early:** inputs are validated before any work starts.
- **Validate always:** outputs are validated before the agent completes —
  an agent that cannot produce a valid document reports a defect instead
  of emitting bad JSON.
- **Strict mode:** `additionalProperties: false` on all canonical schemas
  — unknown fields are errors, not noise.
- **Semantic checks** complement schema checks (e.g. menu category ↔
  dish consistency, phone digits pattern, i18n locale maps) and live in
  the engine QA script (`Garcia2/scripts/qa.mjs`) — they are re-run by
  Deployment before any build.
- Validation results are logged with the `validated` event; failures
  carry the exact schema path.

## Failure Modes

| Mode | Handling |
|---|---|
| Schema invalid on input | reject; log `E_VA_SCHEMA` with path |
| Schema invalid on output | agent re-emits; if repeated → defect |
| Engine QA semantic fail | Deployment aborts; defect routed |
| Schema drift (canonical vs agent copy) | central schema is source of truth; agent files must not diverge |
