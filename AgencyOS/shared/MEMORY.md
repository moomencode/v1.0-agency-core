# Shared Module: Memory

> Per-agent and cross-agent state management.

## Purpose

Agents are stateless by default. Memory provides short-term (run-local)
and long-term (storage-backed) context so agents can resume interrupted
runs and share cross-agent facts without divergence.

## Architecture

```
┌─────────────────────────────────────────────┐
│ Memory (facade)                             │
│  ├─ shortTerm  — run-local, TTL 30 min      │
│  └─ longTerm   — storage-backed, key: agent │
│                  + documentRef, TTL 30 days │
└─────────────────────────────────────────────┘
```

## API (conceptual)

| Operation | Description |
|---|---|
| `put(agent, key, value, ttl?)` | store a fact |
| `get(agent, key)` | retrieve a fact |
| `forget(agent, key)` | remove a fact |
| `recall(agent, prefix)` | list facts by prefix |

## Rules

- Keys are namespaced: `{agent}::{documentId}::{field}`.
- Long-term facts are immutable snapshots; updates create new versions.
- Agents never read another agent's long-term memory directly — they
  exchange facts via canonical documents (see DATA_FLOW.md).
- Secrets (tokens, credentials) never enter memory — they live in the
  secure store only.

## Failure Modes

| Mode | Handling |
|---|---|
| TTL expired | treat as absent; re-fetch from source |
| Corrupt snapshot | skip entry; log via Logging |
| Write contention | last-write-wins with version number |
