# AgencyOS Global Validation Layer — Phase 3.4

Contract enforcement at every boundary, now as a standalone engine: JSON parsing,
schema validation, config contracts, workflow/agent/prompt output checks, asset
integrity, duplicate detection, and reference resolution — with detailed, machine
readable reports.

```
AgencyOS/validation/
  index.js     ValidationSystem facade + createValidationSystem
  engine.js    ValidationEngine: rule registry, per-kind pipelines, stats
  rules.js     Built-in rules + strict JSON parser + format/theme/business contracts
  report.js    ValidationReport builder + human-readable Markdown renderer
  errors.js    E_VAL_* error taxonomy
  smoke.mjs    56-assert acceptance suite (node validation/smoke.mjs)
  demo.mjs     Validates the real project configs
```

## Kinds

`validate(kind, payload, options)` — payload is an object or JSON text:

| Kind | What it checks |
| --- | --- |
| `json` | syntax, trailing garbage, duplicate keys |
| `schema` | payload against a schema (file, object, or canonical title) |
| `config` | generic config: syntax, duplicate IDs, broken refs, required fields, asset manifests |
| `business-config` | engine `business.json` contract (type enum, locale in languages, sections, currency, phoneDigits) |
| `theme-config` | engine `theme.json` contract (10 palette tokens per mode, RGB triplets 0-255, defaultMode, typography) |
| `workflow-output` | run documents: ids present, canonical schema per document, cross-document refs |
| `agent-output` | schema match (inline / file / canonical) + refs |
| `prompt-output` | LLM response shape (`content`, `model`, `usage`) or plain text |
| `asset` | file existence, sha256 checksum, format/extension/mime consistency |

## Detectors

- **Missing fields** — explicit `required: ['name', 'sections']` (dotted paths like
  `currency.code`) or schema `required` arrays → `E_VAL_MISSING_FIELD`.
- **Duplicate IDs** — IDs inside arrays (`E_VAL_DUPLICATE_ID`); duplicate JSON keys
  (`E_VAL_DUPLICATE_KEY`) via the built-in strict parser that reports the exact path.
- **Invalid assets** — `E_VAL_ASSET_MISSING`, `E_VAL_ASSET_CHECKSUM`,
  `E_VAL_ASSET_MIME`; `isPlaceholder: true` entries are informational, not errors.
- **Broken references** — `sourceDocument`, `ref`, `$ref`, `references`,
  `parentId`, `derivedFrom`, `assetId`, `agentId`, and `schema` fields resolve
  against payload IDs, `agents/*/config.json` ids, canonical schemas, and the file
  system (`E_VAL_BROKEN_REF`).
- **Schema mismatch** — full JSON Schema validation (type, enum, pattern, format,
  required, additionalProperties: false) via the runtime Validator
  (`E_VAL_SCHEMA_MISMATCH`), with the exact `$.path` of every violation.

## Reports

Every validation returns a report:

```js
{
  kind: 'theme-config', target: 'businesses/acme/config/theme.json',
  valid: false, startedAt: '...', durationMs: 1.2,
  summary: { errors: 2, warnings: 0, infos: 1, total: 3 },
  checks: [{ id: 'theme-rules', label: 'theme config contract', passed: false, findings: 2 }, ...],
  findings: [{ code: 'E_VAL_THEME_INVALID', severity: 'error', path: '$.colors.dark.primary',
               message: 'token "primary" channel out of range (0-255): "300 0 0"', ref: 'primary' }, ...],
  value: <parsed payload>
}
```

`sys.reportMarkdown(report)` renders the same report as human-readable Markdown
(severity groups, paths, suggestions, per-check table).

## Real-world usage

```js
import { createValidationSystem } from './index.js';

const sys = createValidationSystem({ root: 'AgencyOS' });
const theme = sys.validateFile('theme-config', 'config/theme.json');
const run = sys.validateWorkflowOutput(runResult);
if (!run.valid) {
  for (const f of run.findings) console.log(`[${f.severity}] ${f.path}: ${f.message}`);
}
```

`demo.mjs` validates the actual project: `config/theme.json`, `config/business.json`,
all nine agent configs, and every workflow file — all must come back VALID.

## Verification

```
node AgencyOS/validation/smoke.mjs        # 56 assertions — expect ALL PASS
node AgencyOS/artifacts/smoke.mjs         # Phase 3.3 regression
node AgencyOS/memory/smoke.mjs            # Phase 3.2 regression
node AgencyOS/communication/smoke.mjs     # Phase 3.1 regression
node AgencyOS/runtime/smoke.mjs           # Phase 3.0 regression
```
