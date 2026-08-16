# AgencyOS Rollback Runbook

**Version:** v1.8.2-production-readiness  
**Baseline:** v1.8.0-foundation-trust (1661 PASS / 0 FAIL)  
**Last Updated:** 2026-08-16

---

## Overview

This runbook documents the **existing rollback mechanism** in AgencyOS. The system uses **provider alias promotion** (Vercel's `promote` API) to switch traffic from a bad deployment back to a known-good previous deployment.

**Key Properties:**
- **Atomic**: Single provider API call (`promote`) switches traffic
- **Verified**: Post-promotion `verify()` polls until `READY`
- **Audited**: Full timeline in immutable deployment record
- **Reversible**: `revert()` re-promotes the original deployment
- **Guarded**: Requires explicit human approval (`approveRollback`)

---

## When Rollback Is Appropriate

| Scenario | Rollback? | Notes |
|----------|-----------|-------|
| Site returns 5xx/404 post-deploy | **YES** | Immediate action |
| Critical functionality broken | **YES** | If hotfix > 10 min |
| Performance regression > 50% | **YES** | If not cache-related |
| SEO/analytics broken | **MAYBE** | Assess impact first |
| Minor cosmetic issue | **NO** | Hotfix preferred |
| Vercel platform outage | **NO** | Wait for provider recovery |

---

## Prerequisites for Rollback

1. **Previous deployment exists** with status `recorded`, `verified`, or `deployed`
2. **Previous deployment passes QA** (checked automatically via `_verifyPrevious()`)
3. **Previous package checksum matches** (validated automatically)
4. **Human operator approval** via `approveRollback(recordId, { by: 'operator-id' })`
5. **Deployment record in terminal state** (`recorded`, `verified`, or `deployed`)

---

## Rollback Mechanism: How It Works

```
CURRENT (bad)                    PREVIOUS (good)
┌─────────────────┐              ┌─────────────────┐
│ dep_abc123      │              │ dep_def456      │
│ status: recorded│              │ status: recorded│
│ deployment.id:  │              │ deployment.id:  │
│ vercel-xyz789   │◄──promote─── │ vercel-uvw012   │
└─────────────────┘              └─────────────────┘
      │                              ▲
      │ 1. approveRollback()         │
      │ 2. rollback()                │
      │    - verifyPrevious()        │
      │    - provider.promote()      │
      │    - provider.verify()       │
      │ 3. status: rolled_back       │
```

---

## Exact Commands

### 1. Identify the Bad Deployment
```bash
# List recent deployments for a business
node -e "
const { createDeliverySystem } = require('./AgencyOS/delivery/index.js');
const { ArtifactSystem } = require('./AgencyOS/artifacts/index.js');
const { MemorySystem } = require('./AgencyOS/memory/index.js');

const root = '<STORAGE_ROOT>';
const system = createDeliverySystem({ root, ... });

const history = system.history('<BUSINESS_ID>');
console.log('Recent deployments:');
history.forEach(r => console.log(' ', r.id, r.status, r.createdAt, r.deployment?.id, r.deployment?.url));
"
```
**Output Example:**
```
dep_a1b2c3  recorded  2026-08-16T10:30:00Z  vercel-xyz789  https://bad-site.vercel.app
dep_d4e5f6  recorded  2026-08-16T09:15:00Z  vercel-uvw012  https://good-site.vercel.app
```

### 2. Verify Previous Deployment Is Rollback-Eligible
```bash
node -e "
const record = system.getRecord('dep_d4e5f6');
console.log('Status:', record.status);  // Must be 'recorded' | 'verified' | 'deployed'
console.log('Deployment ID:', record.deployment?.id);
console.log('Build ID:', record.trace?.buildId);

// Check QA passed
const qa = system.qa.loadReport(record.trace.buildId);
console.log('QA Passed:', qa.passed, 'Checks:', qa.checkCount);

// Check package checksum
const manifest = system.packaging.loadManifest(record.trace.buildId);
const actual = system.packaging.bundleSha256(record.trace.buildId);
console.log('Manifest SHA:', manifest.bundle.sha256);
console.log('Actual SHA:', actual);
console.log('Match:', manifest.bundle.sha256 === actual);
"
```
**Expected:** All checks pass. If any fail → **Rollback blocked** (previous deployment corrupted).

### 3. Approve Rollback (MANDATORY)
```bash
node -e "
const approved = system.rollback.approveRollback('dep_a1b2c3', {
  by: 'operator-jdoe',
  note: 'Rollback due to 500 errors on checkout page post-deploy'
});
console.log('Rollback approved:', approved.rollbackApproval);
"
```
**Effect:** Sets `rollbackApproval: { approved: true, by, note, at }` on the **current (bad) record**.

**Failure:** `E_DEL_UNKNOWN_RECORD` if recordId wrong

### 4. Execute Rollback
```bash
# DRY-RUN first (recommended)
node -e "
const result = await system.rollback.rollback({
  recordId: 'dep_a1b2c3',
  by: 'operator-jdoe',
  mode: 'dry-run'
});
console.log('Dry-run:', result.dryRun);
"

# PRODUCTION rollback
node -e "
const result = await system.rollback.rollback({
  recordId: 'dep_a1b2c3',
  by: 'operator-jdoe',
  mode: 'explicit'   // or 'auto' if DELIVERY_AUTO_ALLOWED=true
});
console.log('Rollback result:', result.original.status);  // 'rolled_back'
console.log('Rolled back to:', result.previous.deployment.id);
console.log('New URL:', result.previous.deployment.url);
"
```

**State Transitions:**
```
recorded --ROLLBACK_START--> rollback_requested --ROLLBACK_OK--> rolled_back
```

**Timeline Events Added:**
- `ROLLBACK_START` (actor: operator, note: "rollback to previous deployment...")
- `RETRY` (if promote retried)
- `ROLLBACK_OK` (actor: operator, note: "rolled back to <buildId>")

**Failure Modes:**
| Error | Cause | Action |
|-------|-------|--------|
| `E_DEL_ROLLBACK_INVALID` | Record not in rollbackable state | Check record.status |
| `E_DEL_APPROVAL_REQUIRED` | Missing `approveRollback()` | Run Step 3 first |
| `E_DEL_QA_FAILED` | Previous package fails QA | Cannot rollback to this version |
| `E_DEL_PACKAGE_MISSING` | Previous package checksum mismatch | Cannot rollback to this version |
| `E_DEL_PROVIDER_ERROR` | Vercel promote/verify failed | Check Vercel status, retry |

---

## Verification After Rollback

### 5. Verify Live Site Restored
```bash
node -e "
const record = system.getRecord('dep_a1b2c3');
console.log('Status:', record.status);  // 'rolled_back'
console.log('Rollback info:', record.rollback);
console.log('Timeline:', record.timeline.slice(-3).map(t => t.event + ': ' + t.note).join('\n'));

// Manual check
// curl -I <record.rollback.url>
// curl -s <record.rollback.url> | grep -c '<title>'
"
```
**Expected:**
- `record.status === 'rolled_back'`
- `record.rollback.url` = previous deployment's live URL
- Site responds HTTP 200 with correct content

### 6. Record Rollback Artifact
Automatic - `artifacts.writeRecord({ kind: 'rollback', ... })` creates rollback report artifact.

---

## Revert (Undo Rollback)

If rollback was premature and original deployment is actually fine:

### 7. Approve Revert (MANDATORY)
```bash
node -e "
system.rollback.approveRollback('dep_a1b2c3', {
  by: 'operator-jdoe',
  note: 'Revert rollback - original deployment was healthy, false alarm'
});
// Reuses same approval field (revertApproval = rollbackApproval)
"
```

### 8. Execute Revert
```bash
node -e "
const result = await system.rollback.revert({
  recordId: 'dep_a1b2c3',
  by: 'operator-jdoe',
  mode: 'explicit'
});
console.log('Revert result:', result.status);  // 'reverted'
console.log('Reverted to:', result.revertedTo);  // original deployment.id
"
```

**State Transitions:**
```
rolled_back --REVERT_START--> reverting --REVERT_OK--> reverted
```

---

## State Machine Summary

```
Normal Deploy:     created → packaged → awaiting_approval → approved → deploying → deployed → verified → recorded
                                                                      │
                                                                      ▼
                                                               rollback_requested → rolled_back → (reverting) → reverted
```

**Terminal States:** `rejected`, `failed`, `recorded`, `rolled_back`, `reverted`

**Rollback-Valid Source States:** `recorded`, `verified`, `deployed`

**Revert-Valid Source State:** `rolled_back` only

---

## Failure Handling

### Rollback Fails During Promotion
```
recorded --ROLLBACK_START--> rollback_requested --ABORT--> failed
```
- Check `record.rollback.error` for details
- Vercel API error (5xx, 429) → retry automatically (max 3 via `deliveryRetry`)
- Vercel auth error (401) → **never retried** → fix token, manual intervention

### Rollback Verification Times Out
- `pollUntil` max 10 attempts × 25ms initial delay (exponential backoff)
- If `verified.status !== 'READY'` → `E_DEL_PROVIDER_ERROR`, record.status = `failed`
- Check Vercel dashboard for deployment state

### No Previous Deployment Available
```
E_DEL_ROLLBACK_INVALID: "no previous recorded deployment for business..."
```
- Check `system.history(businessId)` for candidates
- Previous must have `status: recorded|verified|deployed` AND `deployment.id`

### Previous Deployment Fails QA/Checksum
```
E_DEL_QA_FAILED: "previous package fails QA gate"
E_DEL_PACKAGE_MISSING: "previous package checksum mismatch"
```
- **Cannot rollback to this version** - data corruption
- Investigate how previous deployment passed originally
- May need to rebuild from dossier (Step 2 of Deployment Runbook)

---

## Rollback Decision Checklist

Before executing rollback, confirm:

- [ ] Current deployment is `recorded` (or `verified`/`deployed`)
- [ ] Issue confirmed as deployment-related (not upstream API, DNS, etc.)
- [ ] Previous deployment identified in history
- [ ] Previous deployment status = `recorded` | `verified` | `deployed`
- [ ] Previous deployment QA passes (auto-checked)
- [ ] Previous deployment checksum matches (auto-checked)
- [ ] Operator approval recorded with `by` and `note`
- [ ] Dry-run executed and reviewed
- [ ] Stakeholders notified of rollback

---

## Post-Rollback Actions

1. **Verify site health** (Step 5 above)
2. **Update incident record** in IntelligenceEngine
3. **Create post-mortem** if root cause unknown
4. **Schedule hotfix build** if rollback was due to code defect
5. **Review deployment process** for prevention

---

## Intelligence Monitoring for Rollbacks

```bash
node -e "
const { createIntelligence } = require('./AgencyOS/intelligence/index.js');
const intel = createIntelligence({ root: '<STORAGE_ROOT>', ... });
intel.start();
const health = intel.health();
console.log('Open Incidents:', health.openIncidents);
const incidents = intel.incidents.list({ kind: 'provider_error' });
console.log('Provider incidents:', incidents.length);
intel.stop();
"
```

Rollbacks create `provider_error` incidents automatically when provider calls fail.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.8.2-production-readiness | 2026-08-16 | Initial rollback runbook (Production Readiness hardening) |

---

**End of Runbook** — This document must be reviewed after every rollback event.