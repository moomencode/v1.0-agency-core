# Dossier Engine — Schema Guide

## 1. Schema Registry

All 20 document schemas are registered centrally in `schemas/index.js`
under IDs `agencyos:dossier/<document-id>` (e.g. `agencyos:dossier/contact`).
The dossier envelope itself validates against
`schemas/business.schema.json` (`agencyos:dossier`).

```
listSchemaIds()   → 20 ids
getSchema(id)     → the JSON Schema
validateDocuments(docs) → { valid, errors[] }
```

## 2. Common Document Envelope

Every document carries the same envelope, so consumers can rely on a stable
shape:

```json
{
  "schemaId": "agencyos:dossier/contact",
  "dossierId": "dos-7efd86f7ed",
  "businessId": "dis-cairo-001",
  "documentId": "contact",
  "version": 1,
  "createdAt": "2026-08-06T14:11:16.074Z",
  "updatedAt": "2026-08-06T14:11:16.074Z",
  "content": { }
}
```

- `schemaId` — the schema that validated this document.
- `version` — the dossier version this document belongs to.
- `content` — the document-specific payload (see section 3).

## 3. Content Payloads (summary)

| Document | `content` keys |
|---|---|
| `business` | `name, category, area, tags[], status, verified, source` |
| `brand` | `nameSignals[], tagline, keywords[], category` |
| `contact` | `phone, phoneE164, email, whatsapp, website, address` (nulls allowed) |
| `location` | `area, coordinates{lat,lng}|null, mapsUrl\|null` |
| `hours` | `hours[] {days, from, to}` |
| `social` | `instagram\|null, facebook\|null, linkedin\|null, links[]` |
| `website` | `status (none\|ok\|broken\|slow), url, speedMs, pages, estimatedPages, recommendation[]` |
| `seo` | `present, title\|null, keywords[], suggestions[]` |
| `reviews` | `rating, ratingE2, count` |
| `photos` | `count` |
| `services` | `services[] {name, description}` |
| `products` | `products[] {name, description}` |
| `pricing` | `level (affordable\|mid-range\|premium), signals[]` |
| `competitors` | `competitors[] {name, advantage}` |
| `strengths` | `strengths[] {id, title, evidence}` |
| `weaknesses` | `weaknesses[] {id, severity}` |
| `opportunities` | `opportunities[] {id, title, potential, effort, priority}` |
| `risks` | `risks[] {id, title, likelihood, impact, priority}` |
| `recommendations` | `quickWins[], topProblems[], websiteRecommendations[], priorities{p1,p2,p3}` |
| `summary` | `verdict, risk, confidence, nextStep, nextActions[], dossierId, version` |

## 4. Conventions

- **Null over absence** — a missing phone is `"phone": null`, never a missing
  key. Keeps schemas stable and search predictable.
- **Deterministic** — two builds from the same record produce identical
  documents except `createdAt`/`updatedAt`.
- **Versioned** — `version` in the envelope always matches the dossier
  version on disk.
- **Graded** — health/digital grades live on the dossier envelope AND inside
  the `summary` document, so reports and consumers read one source.
- **Validated at build** — every builder output is validated before
  persist; a failing document fails the build (`DOS_CODES.INVALID_DOSSIER`).

## 5. Extending a Schema

1. Edit or add a schema in `schemas/` and register it in `schemas/index.js`.
2. Add/extend the matching builder in `builders/index.js`.
3. Re-run `unit.mjs` + `smoke.mjs` — the snapshot asserts
   `schemas === 20` (update the expected count when adding documents).
4. Optionally render the new document in a template under `templates/`.
