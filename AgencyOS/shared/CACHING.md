# Shared Module: Caching

> Read-side speed without stale decisions.

## Purpose

Caches expensive, read-heavy lookups (dossier data, media metadata,
scoring reference tables, engine schema fingerprints) so agents spend
less time re-fetching and more time working.

## Policy

| Cache | Key | TTL | Staleness policy |
|---|---|---|---|
| Dossier facts | `dossier::{businessId}::{field}` | 24 h | re-verify `needsVerification` fields |
| Media metadata | `media::{sourceUrl}` | 7 d | re-check on 404 |
| Engine schema fingerprint | `engine::{version}` | on version change | invalidate on bump |
| Scoring reference | `scoring::{niche}` | 30 d | ops-tunable |

## Rules

- Cache is a speed layer only — **decisions never depend on stale data**:
  facts tagged `needsVerification` bypass the cache.
- Cache entries are immutable; invalidation deletes, never patches.
- Write-through: after a successful fetch, update the cache; failed
  fetches are never cached as negative results for more than 5 minutes.
- Cache-busting: bump the key on schema/version changes, not on time only.

## Failure Modes

| Mode | Handling |
|---|---|
| Cache miss | fetch source, write-through |
| Cache node down | serve from source; log degraded mode |
| Cache stampede | single-flight: one fetch per key window |
