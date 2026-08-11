# Autonomous Agency Workflow Orchestrator — Phase 4.5

`AgencyOS/orchestrator/` — coordinates the full agency loop
(discover → qualify → brain decision → dossier → pipeline → website → QA →
approval → deploy → verify → report) as **campaigns of executions**, with a
persistent state machine, human-in-the-loop approvals, autonomy levels,
killswitch, crash recovery, budget limits and full observability.
API version 1.0.

```
Discovery → Brain verdicts → Dossier → Pipeline → Website → Final QA (secret scan)
   → Approval gates (L4) → Local/Mock/Vercel deploy → Verify → Report
```

## Quick start

```js
import { createOrchestratorSystem } from './orchestrator/index.js';
import { createStack } from './orchestrator/tests/helpers.mjs'; // real adapters wired to scratch storage

const root = './storage/orchestrator-tests/quickstart';
const stack = await createStack(root);
const sys = createOrchestratorSystem({ root, ...stack });
await sys.boot(); // RecoveryManager: stale locks + resumable campaigns

const started = sys.startCampaign({
  name: 'cairo-market-2026',
  discovery: { market: 'Cairo', category: 'cafe', query: {}, sources: ['simulated'] },
  filters: { minOpportunityScore: 40, requireNoWebsiteOrWeak: false },
  autonomyLevel: 'L4',
  deployment: { provider: 'local', target: { project: 'agency-test' }, allowedProviders: ['local'] },
  limits: { maxBusinesses: 6, maxConcurrent: 3, maxRetries: 2, maxAiCalls: 100,
            maxProviderCalls: 100, maxDeployments: 50,
            maxExecutionDurationMs: 120000, maxCampaignDurationMs: 600000 },
  approvals: { requireDeploymentApproval: true, requireEscalationApproval: true }
});

await sys.runCampaign(started.campaignId);          // runs until humans are needed
const pending = sys.pendingApprovals();             // DEPLOY + ESCALATE records
sys.approve(pending[0].id, { by: 'operator', reason: 'verified' });

const summary = sys.status(started.campaignId);     // poll until terminal
sys.close();
```

Run the full demo: `node AgencyOS/orchestrator/demo/demo.mjs` — six businesses,
L4, 3 APPROVE / 2 REJECT / 1 ESCALATE, local deploys, crash recovery,
emergency stop.

## The loop, per execution

| # | Step | Gate |
|---|---|---|
| 1 | `discover` → CREATED | — |
| 2 | `qualify` → QUALIFIED | filter checks (min opportunity, premium/duplicate, closed) |
| 3 | `evaluate` → EVALUATED | **Brain verdict** — APPROVE/REJECT/ESCALATE/PARK, never re-scored |
| 4 | `build-dossier` → DOSSIER_READY | dossier engine |
| 5 | `generate-config` / `render-site` → SITE_RENDERING | pipeline + website engine |
| 6 | `run-qa` → QA_RUNNING / QA_FAILED | final QA incl. **secret scan**; failure needs human (override/retry/archive) |
| 7 | `request-delivery` → AWAITING_APPROVAL | approval gate (L4) |
| 8 | `deploy` / `verify` → DEPLOYED | provider deploy + verification |
| 9 | `persist` / `report` → ARCHIVED | memory facts, artifacts, execution report |

## States

- **Execution (20):** CREATED → QUALIFIED → EVALUATED → DOSSIER_READY →
  GENERATING → SITE_RENDERING → QA_RUNNING → READY_FOR_DELIVERY →
  AWAITING_APPROVAL → DELIVERING → DEPLOYING → VERIFYING → DEPLOYED, plus
  ESCALATED, REJECTED, QA_FAILED, FAILED, RETRYING, ROLLED_BACK, ARCHIVED.
  Recovery states (`ESCALATED`, `AWAITING_APPROVAL`, `QA_FAILED`, `FAILED`)
  survive restarts.
- **Campaign (8):** DRAFT → QUEUED → RUNNING ⇄ PAUSED / STOPPED / LIMITS_REACHED
  → COMPLETED. A campaign with waiting executions stays RUNNING — it is
  explicitly designed to wait for humans.

## Autonomy levels

| Level | Behavior |
|---|---|
| L0–L1 | manual review, no autonomous steps |
| L2–L3 | step autonomy grows; deploy still human-gated |
| L4 | all steps autonomous; **humans decide on DEPLOY + ESCALATE + QA_OVERRIDE + SENSITIVE + POLICY_VIOLATION** |
| L5 | auto-approves DEPLOY, every auto-grant is written to the immutable approval ledger |

Approval records are immutable: one decision per record, stored in
`storage/orchestrator-engine/approvals/<apr-…>.json`.

## Safety

- **Killswitch** — `storage/orchestrator-engine/EMERGENCY_STOP` (file) or
  `ORC_EMERGENCY_STOP=1` (env) halts execution between steps; executions get
  outcome `STOPPED`, campaigns transition to STOPPED. Clear the switch and
  re-run (`force: true`) to recover.
- **Crash recovery** — `RecoveryManager.boot()` (called by `sys.boot()`)
  breaks stale locks, scans persisted campaigns, and resumes resumable
  executions from their checkpoints. Pending approvals survive restarts.
- **Budget limits** — businesses, deployments, AI calls, provider calls,
  retries, steps, execution/campaign wall-clock durations. Reached limits
  move the campaign to LIMITS_REACHED.
- **SEC-01 (fixed)** — caller-supplied run/business/campaign ids are
  sanitized at every filesystem boundary (`sanitizeRunId`): `..`, separators,
  dot-runs and leading dots collapse to a single safe segment; hostile ids
  are replaced by generated ids at the context boundary. See
  `orchestrator/tests/security.mjs`.
- **Secret hygiene** — traces, audit and reports are redacted via
  `safeForLog` (scan patterns + vault values); the final QA runs a secret
  scan on the production tree — credential-bearing content is blocked before
  deployment.

## Observability

Per execution: `trace.ndjson` events + assembled `trace.json` +
`execution-report.json` in `storage/orchestrator-engine/instances/<orc-…>/`.
Campaign-level: campaign report artifact, redacted NDJSON audit in
`logs/orchestrator/`, budget counters in the campaign file, orchestration
events on the shared bus (`ORC_EVENTS`).

## Tests

18 suites, all offline:

```bash
node orchestrator/tests/unit.mjs            # 13 — ids, specs, utils
node orchestrator/tests/state-machine.mjs   # 12 — legal/illegal transitions
node orchestrator/tests/approval.mjs        #  9 — immutable approval ledger
node orchestrator/tests/policy.mjs          # 10 — autonomy gate L0–L5
node orchestrator/tests/accounting.mjs      #  7 — budget counters
node orchestrator/tests/limits.mjs          # 10 — limit enforcement
node orchestrator/tests/resume.mjs          #  4 — crash recovery
node orchestrator/tests/smoke.mjs           #  1 — full L4 campaign (6 businesses)
node orchestrator/tests/concurrency.mjs     # 11 — bounded pool, per-business isolation
node orchestrator/tests/failure-isolation.mjs # 3 — one failure never sinks the campaign
node orchestrator/tests/idempotency.mjs     #  6 — re-runs are safe
node orchestrator/tests/security.mjs        # 13 — SEC-01 traversal, containment, redaction, secret scan
node orchestrator/tests/regression-45x.mjs  # 17 — prior phase regressions
node orchestrator/tests/chain1-integrity.mjs # 2 — orchestrator↔delivery chain
node orchestrator/tests/stress.mjs          #  1 — concurrency stress
```

Docs: `Architecture.md`, `../reports/PHASE4_5_ORCHESTRATOR_IMPLEMENTATION.md`.
