# AgencyOS Artifact Generation Pipeline — Phase 3.3

Every workflow produces artifacts. The artifact engine turns run documents and workflow
outputs into versioned, checksummed, metadata-rich deliverables: research reports,
website configs, SEO reports, brand documents, UX audits, sales proposals, contracts,
PDFs, Markdown, JSON, images, and HTML — organized on disk, named automatically, and
cleaned up by policy.

```
AgencyOS/artifacts/
  index.js           ArtifactSystem facade (validation + captureRun + attachRuntime)
  manager.js         ArtifactManager: create/version/checksum/metadata/folders/naming/
                     list/search/verify/cleanup
  builders.js        Deliverable generators: run reports, SEO reports, website configs,
                     proposals, UX audits, brand documents, contracts
  formats.js         Format registry (markdown/json/html/text/svg/pdf/image) + type taxonomy
  errors.js          E_AR_* error taxonomy
  schemas/artifact.schema.json   canonical artifact record contract
  smoke.mjs          33-assert acceptance suite (node artifacts/smoke.mjs)
```

## Artifact Model

Every artifact is a file plus a metadata sidecar (`{file}.meta.json`) — both covered by
`schemas/artifact.schema.json`:

| Field | Meaning |
| --- | --- |
| `id` / `name` / `slug` | identity; slug is the filesystem-safe key |

**4.7.0 (ID-1) — deterministic ids.** `id` is no longer a random uuid: it is the
content address `art-<sha256(`${key}|v${version}`)[0..16]>` — the same
`(project, workflow, type, name, version)` always yields the same id on any
storage, making ids stable across rebuilds, restores and multi-machine runs.
Legacy random-id records stay readable: the index maps both new and old ids
(dual-read), so existing artifact stores remain fully queryable.
| `type` | taxonomy: `research-report`, `seo-report`, `brand-document`, `ux-audit`, `sales-proposal`, `contract`, `website-config`, `website`, `review`, `report`, `document`, `image`, `other` |
| `format` | `markdown` `.md`, `json` `.json`, `html` `.html`, `text` `.txt`, `svg` `.svg`, `pdf` `.pdf`, `image` `.png` |
| `version` | immutable version number within `(project, workflow, type, name)` |
| `checksum` | sha256 hex of the artifact bytes |
| `sizeBytes` / `mime` | size and media type |
| `createdAt` / `updatedAt` / `accessedAt` / `expiresAt` | lifecycle timestamps |
| `projectId` / `workflowId` / `runId` / `stepId` / `sourceDocument` | provenance |
| `title` / `summary` / `tags` / `generatedBy` / `metadata` | description and extensibility |

Records are validated against the schema on create (invalid records are rolled back);
unknown formats and types are rejected with `E_AR_FORMAT_UNKNOWN` / `E_AR_TYPE_UNKNOWN`.

## Versioning & Automatic Naming

- Versions are immutable: creating the same `(project, workflow, type, name)` again
  bumps `version` (`name-v2.md`, `name-v3.md`, …). `latest()` resolves the newest;
  `history()` returns every version in order.
- Filenames are derived automatically from the slug — optionally date-prefixed. With no
  name at all (`autoName: true`) the manager generates
  `{type}-{workflow}-{yyyymmddhhmmss}-v{n}.{ext}`.

## Folder Organization

```
storage/artifacts-engine/
  {projectId}/                 'unassigned' when no project
    {workflowId}/
      {type}/
        [{runId}/]             optional per-run subfolder
          {name}-v{n}.{ext}    artifact file
          {name}-v{n}.{ext}.meta.json   metadata sidecar
  _index.json                  fast lookup: keys -> versions -> latest, artifacts by id
```

`relativePath` on every record makes files addressable without guessing. `list()` filters
by project/workflow/type/run; `search()` ranks by name/title/summary/tags/content.

## Checksums & Verification

- Every artifact's sha256 is computed at write time and stored in the record.
- `verify(record)` recomputes the hash from disk and reports tampering
  (`E_AR_CHECKSUM_MISMATCH` territory — verification returns `false`).

## Builders — Workflow Outputs Become Deliverables

`captureRun(runResult)` materializes a completed run: every document becomes a JSON
artifact, and per-workflow builders produce the human deliverable:

| Workflow | Builder | Deliverable type |
| --- | --- | --- |
| `business-analysis` | research report | `research-report` (Markdown) |
| `website-generation` | `buildWebsiteConfig` | `website-config` (engine-ready JSON) |
| `qa` | `buildUxAudit` | `ux-audit` (Markdown) |
| `sales` | `buildProposal` | `sales-proposal` (Markdown) |
| any run | `buildRunReport` | `report` (Markdown run report) |

Standalone generators (`buildSeoReport`, `buildBrandDocument`, `buildContract`, …) cover
the remaining deliverables, and `fromDocument(doc, { format })` converts any runtime
document to JSON/Markdown/HTML in one call.

## Attaching to the Runtime

```js
import { ArtifactSystem } from './index.js';
import { Executor } from '../runtime/executor.js';

const runtime = new Executor({ root: 'AgencyOS' });
const artifacts = new ArtifactSystem({ root: 'AgencyOS' });
artifacts.attachRuntime(runtime, { projectId: 'acme' });   // every run now produces artifacts
await runtime.run('lead-discovery', { niche: 'Cairo F&B', region: 'EG' });
```

`attachRuntime` wraps `Executor.run` so every workflow run automatically emits its
documents and a run report as artifacts — no changes to the runtime itself.

## Cleanup

`cleanup({ projectId?, workflowId?, type?, olderThanDays?, maxVersions?, expire?, dryRun? })`
applies retention policies (all filters combine; `dryRun` reports without deleting):

- `maxVersions` — keep the N newest versions per artifact, prune the rest.
- `olderThanDays` — remove artifacts not accessed within N days.
- `expire` — remove artifacts whose `expiresAt` passed (TTL set per create via
  `expiresInMs`); a background sweeper (60 s, unref'd) enforces it automatically.
  The intelligence retention job (4.7.0) also delegates `expire` cleanup through
  `ArtifactManager.cleanup({ expire: true, dryRun })` + `sweepExpired()` so
  expired artifacts are reclaimed by the platform's daily sweep.

## Verification

`deterministic-ids` suite (`artifacts/tests/deterministic-ids.mjs`, 6 PASS) proves
ids are pure functions of content across independent storages and that legacy
random ids remain readable via the index.

```
node AgencyOS/artifacts/smoke.mjs       # 33 assertions — expect ALL PASS
node AgencyOS/memory/smoke.mjs          # Phase 3.2 regression
node AgencyOS/communication/smoke.mjs   # Phase 3.1 regression
node AgencyOS/runtime/smoke.mjs         # Phase 3.0 regression
```
