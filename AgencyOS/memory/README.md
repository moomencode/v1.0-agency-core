# AgencyOS Long-Term Memory Engine — Phase 3.2

The persistent memory system of AgencyOS. Every agent, workflow, and execution can
remember facts across runs — with automatic loading and saving, version history,
snapshots, rollback, compression, expiration, indexing, search, cross-workflow reuse,
and **no duplicated memories**.

```
AgencyOS/memory/
  index.js           MemorySystem facade (validation + store + engine)
  engine.js          MemoryEngine: automatic load/save, working memory lifecycle,
                     typed handles (project/business/brand/customer/agent/workflow/execution)
  store.js           MemoryStore: versioned entries, snapshots, rollback, compression,
                     expiration sweeper, dedupe, index, search
  types.js           the 8 memory types: labels, scopes, defaults, TTLs
  errors.js          E_MEM_* error taxonomy
  schemas/entry.schema.json   canonical memory entry contract
  smoke.mjs          36-assert acceptance suite (node memory/smoke.mjs)
```

## The Eight Memory Types

| Type | Scope | Default TTL | Persistence | Purpose |
| --- | --- | --- | --- | --- |
| **Working** | `run:<id>` | 30 min | in-process | Ephemeral scratch for the active run; auto-cleared by `endWorking`. |
| **Project** | `project:<id>` | ∞ | disk | Engagement knowledge shared by every workflow of the project. |
| **Business** | `business:<id>` | ∞ | disk | Facts, corrections, and preferences about a business. |
| **Brand** | `global` / `brand:<id>` | ∞ | disk | Brand identity and guidelines. |
| **Customer** | `customer:<id>` | ∞ | disk | Per-customer knowledge: preferences, history. |
| **Agent** | `agent:<id>` | 30 days | disk | Per-agent state: strategies, corrections, learned rules. |
| **Workflow** | `workflow:<id>` | ∞ | disk | Gate history, decisions, partial progress. |
| **Execution** | `run:<id>` | 7 days | disk | Run records: summaries, errors, timings (append-oriented). |

Scope is enforced per type: `project:<id>` scope cannot be written into business
memory and vice versa (`E_MEM_SCOPE_INVALID`).

## Automatic Loading & Saving

- Every `put` is persisted immediately and atomically (auto-save on by default) — a new
  process, workflow, or instance reading the same `(type, scope, key)` gets the same
  memory (automatic loading on access). The smoke test proves it with a second
  `MemorySystem` instance.
- `autoSave: false` defers persistence with a debounce for high-throughput writes.
- Working memory lives in-process with TTL and `endWorking(runId)` cleanup.

## Version History, Snapshots, Rollback

- Entries are immutable snapshots: an update bumps `version` and preserves the previous
  state in `versions` (newest first, capped by `maxVersions`).
- **Snapshots** capture the full state (one type or all) to
  `storage/memory-engine/_snapshots/`; `restoreSnapshot(id)` rewrites the store from a
  snapshot.
- **Rollback** restores any historical version — including compressed ones — as a new
  version, keeping the timeline intact.

## Compression

Versions beyond the newest `uncompressedKeep` (default 3) are gzip-compressed
(`node:zlib`) and stored base64 inline; `versions()` and `rollback()` decompress on
demand transparently. `compress()` / `rebuildIndex()` are available for maintenance.

## Expiration

`ttlMs` (per type default or per put) sets `expiresAt`. Expiry is enforced lazily on
`get`/`exists` and by a background sweeper (60 s, unref'd); expired entries are removed
and unindexed.

## Indexing, Search, Dedupe

- A persisted index (`_index.json`) maps every entry: id, type, scope, key, fingerprint,
  content-fingerprint, tags, summary. `rebuildIndex()` rescans the store from disk.
- **Search** (`search(query, {type, scope, limit})`) scores token matches: key match >
  tag > summary > content, returning ranked results with snippets.
- **No duplicated memories.** Each entry carries two fingerprints:
  - `fingerprint` — full identity `(type, scope, key, content)`; re-saving the same
    value touches the entry without creating a version.
  - `contentFingerprint` — `(type, scope, content)`; writing identical content under a
    **different key** is detected and returns the existing entry
    (`{ deduped: true, duplicateOf: <id> }`) instead of creating a duplicate.
- Secrets (keys matching `token|password|secret|api_key|credential`) are rejected with
  `E_MEM_SECRET_REJECTED` — they never enter memory.

## Cross-Workflow Reuse

Memory is keyed by `(type, scope, key)`, not by producer: `lead-discovery` writes
workflow progress, `sales` reads the same workflow memory; project knowledge written by
one workflow is visible to all others in the project. Agents still never read another
agent's long-term memory directly (Phase 2 contract) — exchange happens via canonical
documents; memory provides the persistent substrate.

## Usage

```js
import { MemorySystem } from '../memory/index.js';

const mem = new MemorySystem({ root: 'AgencyOS' });

mem.put('business', 'business:cafe-cairo', 'profile', { cuisine: 'koshary', rating: 4.5 });
mem.get('business', 'business:cafe-cairo', 'profile').content;          // automatic load

const brand = mem.engine.brand();                                       // typed handles
brand.put('voice', { tone: 'playful', keywords: ['fresh', 'local'] });
brand.search('local');

mem.engine.project('acme').put('roadmap', { phase: 3 });                // cross-workflow
mem.engine.workflow('sales').get('progress');

mem.engine.putWorking('run-42', 'scratch', { pending: true });          // working memory
mem.engine.endWorking('run-42');

const snap = mem.snapshot('release-3.2', { type: 'brand' });            // snapshot
mem.store.rollback('brand', 'global', 'voice', 1);                      // rollback
mem.store.search('koshary');                                            // search
```

## Storage Layout

```
storage/memory-engine/
  {type}/{scope}/{key}.json     entries (versioned, compressed history inline)
  _index.json                   search + dedupe index
  _snapshots/snap-{name}-{ts}.json
```

## Verification

```
node AgencyOS/memory/smoke.mjs       # 36 assertions — expect ALL PASS
node AgencyOS/communication/smoke.mjs  # Phase 3.1 regression
node AgencyOS/runtime/smoke.mjs        # Phase 3.0 regression
```
