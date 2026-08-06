# AgencyOS Runtime Execution Engine

Phase 3.0 of AgencyOS. Turns the Phase 2 architecture (agents, workflows, canonical
schemas, shared contracts) into an executable engine. Workflows are loaded from the
registry, dependencies are resolved, steps are executed deterministically, outputs are
validated against agent schemas, failures are retried per policy, outputs are cached,
and every run produces logs, artifacts, memory, and metrics.

```
AgencyOS/
  runtime/            <- this engine (Phase 3.0)
  agents/             <- 9 agents, each with config / schemas / prompt / README (Phase 2)
  workflows/          <- 6 workflows, each with contract + executable definition (Phase 2 + definitions)
  schemas/            <- canonical cross-agent schemas (Phase 2)
  shared/             <- shared module contracts: MEMORY, LOGGING, CACHING, RETRY, ERRORS, VALIDATION (Phase 2)
  storage/            <- runtime state: documents, artifacts, memory, cache, indexes
  logs/               <- per-run and daily ndjson logs
```

## Module Map

| Module | Responsibility |
| --- | --- |
| `executor.js` | Facade. Loads the registry (`workflows/` + `agents/`), wires all modules, exposes `run`, `resume`, `runAll`, `stats`, `registerAgentImplementation`. |
| `workflowRunner.js` | Executes a workflow definition end-to-end: per-run event bus + logger, checkpoint resume, gate evaluation hooks, run summary, artifacts, run index. |
| `stepExecutor.js` | Executes one step or one pipeline stage. Steps route through `agentRunner`; stages run a nested workflow via `workflowRunner`; evaluates post-step gates. |
| `agentRunner.js` | Executes one agent call: input validation, cache-first lookup, strategy dispatch, output validation, canonical (advisory) check, retry policy, memory/cache writes. Also hosts the schema-driven `Simulator`. |
| `dependencyResolver.js` | Loads agent configs + schemas + impl probes, and workflow definitions (additive `definition.json` beside the Phase 2 `workflow.json` contract). |
| `validator.js` | Custom JSON Schema draft-07 subset (`$ref`, `allOf`/`anyOf`/`oneOf`, `const`/`enum` deep-equality, type/string/number/array constraints). |
| `contextManager.js` | Per-run run-context: documents (versioned + checksummed), step/stage/gate records, metrics, checkpoints, persisted to `storage/documents/runs/{runId}/`. |
| `cacheManager.js` | Disk cache of agent outputs (`storage/cache/`), TTL 24h, negative TTL 5min, single-flight. |
| `memoryManager.js` | Agent memory: short-term (in-process, 30 min) + long-term (`storage/memory/{agent}/{key}.json`, 30 days). |
| `logger.js` | NDJSON event log per run (`logs/runs/run-{runId}.ndjson`) plus daily rollup (`logs/daily/{date}.ndjson`). |
| `eventBus.js` | Typed event emitter; every module emits structured events (`EVENTS`), run-scoped buses forward to the global bus. |
| `retry.js` | Retry with per-agent policy (maxAttempts, backoff, retryable codes); retryable: `E_TR_*`, HTTP 429/5xx. |
| `errors.js` | Typed errors with a stable code taxonomy (`E_TR_*`, `E_VA_*`, `E_DA_*`, `E_IN_*`, `E_ST_*`). |
| `cli.mjs` | `list`, `run`, `resume`, `stats` command-line interface. |
| `smoke.mjs` | Acceptance suite (~20 assertions) covering registry, runs, resume, determinism, logs, artifacts, memory, cache, pipeline, index. |

## Execution Flow

```
Executor.run(workflowId, input, opts)
  -> DependencyResolver.loadWorkflow(workflowId)       # definition + contract
  -> WorkflowRunner.run(...)                            # fresh run context, bus, logger
       for each step:
         StepExecutor.executeStep(...)
           -> AgentRunner.run(agentId, input, ctx)      # cache -> strategy -> validate
                # strategy: impl (agents/{id}/impl/index.mjs)
                #           | command (agent config.command)
                #           | simulator (schema-driven, deterministic)
           -> post-step gate? -> ContextManager + metrics
       for each stage (full-pipeline):
         StepExecutor.executeStage(...)
           -> WorkflowRunner.run(childWorkflow, { nested: true })   # 'unavailable' if not registered
           -> stage gate -> rework loops
  -> summary, artifacts, run index, log flush
Executor.resume(runId, opts)                            # reload checkpoint, skip completed steps
```

Agents never call each other. All communication flows through the Runtime: agent outputs
become documents in the run context, gates read documents, and nested workflows consume
documents from the parent stage.

## Determinism, Caching, and Resume

- **Deterministic execution.** A run carries a `seed` (default `agency-os`). The
  `Simulator` derives every generated value from `seededRng(mulberry32)` seeded with
  `hash(seed + step input)` — same seed + same input yields byte-identical documents.
  Only time fields (`createdAt`, `discoveredAt`, …) vary; they are recorded as
  date-time strings.
- **Output cache.** Agent outputs are cached on disk under
  `agent-output:{agent}:{step}:{seed}:{input-hash}`. A hit skips execution entirely
  (`strategy: 'cache'`, `fromCache: true`) and increments `metrics.cache.hits`.
- **Checkpoint resume.** After every step the run context is persisted. `resume(runId)`
  reloads the context, skips `completedStepIds`, and continues from the first incomplete
  step. A run that stopped with status `blocked` (gate not satisfied) resumes identically.
- **Gate evaluation.** Post-step and stage gates are expressions over the run documents:
  `lead.qualityScore >= 60`, `website.conflicts.length == 0`, `review.verdict != fail`,
  `proposal.status == ready`, combined with `&&`, `||`, parentheses, and
  `== != > >= < <= contains in`.

## Validation Boundaries

- Agent **input** and **output** are validated against the agent's own schemas.
  Output schema failure throws `E_VA_SCHEMA` (non-retryable).
- Canonical schemas (`schemas/*.schema.json`) are an **advisory** cross-check: a
  mismatch emits a `canonical-warning` and increments `metrics.validations.canonicalWarnings`,
  because agent schemas intentionally carry richer/looser shapes than the canonical
  cross-agent documents. Pass `--strict` (or `context.options.strict: true`) to treat
  canonical mismatches as hard failures.

## Storage, Logs, and Metrics

| Artifact | Location |
| --- | --- |
| Run context (documents, steps, stages, gates, metrics, checkpoint) | `storage/documents/runs/{runId}/context.json` |
| Documents emitted as artifacts | `storage/artifacts/runs/{runId}/{document}.json` + `run-meta.json` |
| Run index | `storage/indexes/runs.json` |
| Long-term agent memory | `storage/memory/{agent}/{key}.json` |
| Output cache | `storage/cache/*.json` |
| Per-run event log | `logs/runs/run-{runId}.ndjson` |
| Daily event rollup | `logs/daily/{date}.ndjson` |

Every run records a summary with status, duration, per-step/stage records, gate results,
and metrics (`agentRuns`, `stepDurationsMs`, `retries`, `validations`, `cache`,
`memoryOps`, `gates`, `documentsEmitted`, `unavailableStages`). Events
(`agent_started`, `agent_completed`, `agent_failed`, `gate_passed`, `gate_failed`,
`retry`, `validated`, `rejected`, …) flow through the run-scoped bus to the logs and to
the global bus.

## Agent Implementation Overrides

The simulator is the default strategy for agents without an implementation. To make an
agent real, without touching the architecture:

1. Drop an ESM implementation at `agents/{Agent}/impl/index.mjs` exporting
   `async function run(input, context, deps)` — the runtime probes for it and switches
   the strategy to `impl`.
2. Or set `command` in `agents/{Agent}/config.json` — the runtime spawns it
   (`strategy: 'command'`), passing input as JSON on stdin and reading JSON from stdout.
3. Or call `executor.registerAgentImplementation(agentId, fn)` at runtime.

## CLI

```
node runtime/cli.mjs list                          # registry: workflows + agents
node runtime/cli.mjs run <workflowId> --input in.json --seed demo --run-id my-run
node runtime/cli.mjs resume <runId>                # continue from checkpoint
node runtime/cli.mjs stats                         # registry + storage summary
```

```
node runtime/smoke.mjs                             # acceptance suite (expect ALL PASS)
```

## Workflow Definitions

Executable payloads live additively in `workflows/{id}/definition.json` next to the
Phase 2 `workflow.json` contract. Simple workflows declare ordered steps
(`id`, `actor`, `action`, `output`, optional `gate`); `full-pipeline` declares ordered
stages (`order`, `workflow`, `entry`, `exit`, `gate`) with `reworkLoops`. Stages whose
workflow is not registered degrade gracefully to `unavailable` records so the pipeline
never hard-fails on a missing stage.
