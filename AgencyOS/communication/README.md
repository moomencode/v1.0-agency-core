# AgencyOS Communication Layer — Phase 3.1

The production-grade communication layer of AgencyOS. **Agents communicate only through
Events** — there is no direct agent-to-agent call. This module is the transport, queuing,
and liveness backbone underneath the runtime:

- every message follows a schema (envelope + per-type payload schemas, validated at the
  boundary; invalid messages are rejected and never delivered),
- execution is asynchronous end-to-end,
- delivery is reliable: priority queues, timeouts, retries with backoff, a dead letter
  queue, explicit execution acknowledgements,
- producers announce liveness with heartbeats and answer directed liveness probes,
- a transport interface keeps the core broker-agnostic so execution can become
  distributed without changing agent code.

```
AgencyOS/communication/
  index.js           CommunicationSystem facade (bus + queues + dlq + heartbeat + transport)
  bus.js             publish / subscribe / emit / broadcast, topic patterns, async dispatch
  queue.js           MessageQueue (FIFO + priority), DeadLetterQueue, QueueManager
  heartbeat.js       HeartbeatController: beat producers, liveness monitors, ping/response
  transport.js       Transport interface + LocalTransport (distributed-ready seam)
  message.js         MessageRegistry + envelope factory + payload validation
  registry.json      message type registry: type -> topic + payload JSON Schema
  schemas/envelope.schema.json   canonical message envelope contract
  errors.js          E_COM_* error taxonomy
  smoke.mjs          25-assert acceptance suite (node communication/smoke.mjs)
  demo.mjs           runnable showcase (node communication/demo.mjs)
```

## Message Model

Every message is a validated envelope:

```json
{
  "schema": "https://agency.os/communication/envelope",
  "id": "msg-<uuid>",
  "type": "agent.completed",
  "topic": "agent.completed",
  "payload": { "agentId": "qa", "runId": "run-x", "workflowId": "wf", "status": "completed", "durationMs": 7, "strategy": "simulator" },
  "meta": { "ts": "...", "origin": "runtime", "instanceId": "local-1", "priority": 0, "ttlMs": 30000, "deliveryCount": 1, "state": "acked" }
}
```

- The envelope contract lives in `schemas/envelope.schema.json` and is validated on every
  publish/emit/broadcast/enqueue.
- The registry (`registry.json`) maps each message type to its topic and payload schema.
  There are 25 registered types: runtime mirrors (`run.*`, `step.*`, `agent.*`,
  `gate.*`, `validated`, `retry`, `rejected`, `document.emitted`, `stage.unavailable`,
  `external.step`) and communication primitives (`heartbeat.beat|request|response|missed`,
  `queue.acked|nacked|expired|dead`).
- `E_COM_SCHEMA_INVALID` / `E_COM_UNKNOWN_TYPE` are thrown at the boundary; invalid data
  cannot propagate (same rule as documents in the runtime).

## Public API

| API | Purpose |
| --- | --- |
| `publish(type, payload, opts)` | Validated, routed message with transport + delivery; resolves after all (async) subscribers finish — execution acknowledgement. |
| `emit(type, payload, opts)` | In-process dispatch to matching subscribers (no transport, no queue binding). |
| `broadcast(topic, payload, opts)` | Fan-out to **every** subscriber regardless of topic. |
| `subscribe(topic, handler, opts)` | Exact, segment-wildcard (`agent.*`), or catch-all (`#`) subscriptions; optional `timeoutMs`, `once`. Returns `{ unsubscribe() }`. |
| `queue(name, opts)` | Create/fetch a durable message queue (see below). |
| `heartbeat.start(id, opts)` | Emit periodic `heartbeat.beat` messages. |
| `heartbeat.watch(id, opts)` | Track liveness; fires `onMissed` / `onRecovered` and `heartbeat.missed` messages. |
| `heartbeat.ping(id)` / `answerPings()` | Directed request/response liveness probe. |
| `attachRuntimeEvents(runtimeBus)` | Bridges the runtime EventBus events into schema-valid typed messages. |
| `stats()` / `close()` | Observability / graceful shutdown. |

## Queues, Timeouts, and Acks

`queue(name, { priority, ttlMs, maxAttempts, retryDelayMs, timeoutMs, concurrency })`
returns a `MessageQueue`:

- **Priority queues** — `priority: true` orders by `meta.priority` (higher first) using a
  binary heap; FIFO within equal priority.
- **Timeouts** — `ttlMs` (message must be consumed before expiry → DLQ as `expired`);
  `timeoutMs` (consumer must finish/ack before it is auto-nacked as `consumer_timeout`).
- **Execution acknowledgements** — the consumer receives a message handle with
  `msg.ack(reason)`, `msg.nack(reason, { requeue })`, `msg.renew()`. A clean return
  auto-acks; a throw auto-nacks. Explicit calls always win (idempotent).
- **Retries + DLQ** — nack requeues with exponential backoff until `maxAttempts`, then
  the message moves to the **dead letter queue** with its reason and attempt count.
  `dlq.list()` / `dlq.requeue(messageId)` / `dlq.count()` manage dead letters.
- Queue lifecycle messages (`queue.acked`, `queue.nacked`, `queue.expired`,
  `queue.dead`) are themselves schema-validated messages.

## Heartbeat

`heartbeat.start(id, { intervalMs })` publishes `heartbeat.beat` on an interval.
`heartbeat.watch(id, { timeoutMs })` monitors last-seen per producer and emits
`heartbeat.missed` + calls `onMissed` when the window lapses, and recovers automatically
when beats resume. `heartbeat.ping(id)` performs a directed request/response round trip
(`heartbeat.request` → `heartbeat.response`) for deep liveness checks.

## Async and Distributed Execution

- All handlers may be async; `publish` awaits subscriber completion (per-subscriber
  error isolation — failures are counted in `stats.bus.deliveryFailures`, never thrown to
  the publisher).
- The **Transport seam**: `publish` routes records through
  `transport.send({ message, topic })`. `LocalTransport` ships in-process;
  a distributed deployment swaps in a remote transport (e.g. Redis Streams, NATS, HTTP
  fan-out) that forwards records to other instances. Receiving instances call
  `bus.receiveRemote(record)` — the same dispatch path as local delivery. Envelopes
  already carry `traceId`-compatible `id`, `origin`, and `instanceId` so messages stay
  attributable across machines. Agent code is untouched by the switch.
- Heartbeat probes double as the distributed liveness protocol.

## Integrating with the Runtime (Phase 3.0)

```js
import { Executor } from '../runtime/executor.js';
import { CommunicationSystem } from './index.js';

const runtime = new Executor({ root: 'AgencyOS' });
const comm = new CommunicationSystem();
comm.attachRuntimeEvents(runtime.bus);   // runtime events -> typed, validated messages
await runtime.run('lead-discovery', { niche: 'Cairo F&B', region: 'EG' });
```

Every runtime event (`agent_completed`, `gate_passed`, `validated`, …) becomes a
schema-valid message on the bus; agents, monitors, and future remote instances consume
them through `subscribe` or bound queues.

## Verification

```
node AgencyOS/communication/smoke.mjs   # 25 assertions — expect ALL PASS
node AgencyOS/communication/demo.mjs    # bus + priority queue + heartbeat showcase
node AgencyOS/runtime/smoke.mjs         # Phase 3.0 regression — still ALL PASS
```
