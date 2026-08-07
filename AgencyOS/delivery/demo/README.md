# Delivery & Deployment Demo (Phase 4.4)

End-to-end demonstration of the Autonomous Delivery & Deployment system:

```
Production Build -> Final QA -> Immutable Package -> Approval Gate -> Provider Deploy -> Record
```

## Running

```bash
node delivery/demo/demo.mjs
```

Output is written to `storage/delivery-demo/` (gitignored). The demo uses the
`local` and `mock` providers only — zero network traffic.

## What the demo shows

| # | Scenario | Guard demonstrated |
|---|----------|--------------------|
| 1 | `dry-run` delivery for demo-cafe-001 | simulated plan, provider untouched |
| 2 | `explicit` approval → local deploy | approval gate opens, record `recorded` |
| 3 | approval rejected | record terminates `rejected`, no provider contact |
| 4 | site with a broken internal link | QA gate blocks with `E_DEL_QA_FAILED` |
| 5 | provider returns 500 once | transient failure retried (timeline `RETRY`), succeeds |
| 6 | provider returns 401 | auth failure `E_DEL_AUTH_FAILED`, never blind-retried |
| 7 | v1 → v2 → rollback → revert | rollback promotes v1, revert re-promotes v2 |

## Where things land

| Path | Contents |
|------|----------|
| `storage/delivery-demo/storage/delivery/records/` | One immutable `dep_<buildId>.json` per deployment |
| `storage/delivery-demo/storage/delivery/packages/` | Immutable zip bundles + manifests |
| `storage/delivery-demo/storage/delivery/local/` | Local provider deploys (`current.json` alias) |
| `storage/delivery-demo/logs/delivery/` | Redacted NDJSON audit log |
| `storage/delivery-demo/storage/artifacts-engine/` | `deployment-report` + `qa-report` artifacts |
| `storage/delivery-demo/storage/memory-engine/` | Deployment facts per business |
