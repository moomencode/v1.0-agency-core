# AgencyOS Deployment Runbook

**Version:** v1.8.2-production-readiness  
**Baseline:** v1.8.0-foundation-trust (1661 PASS / 0 FAIL)  
**Last Updated:** 2026-08-16

---

## Overview

This runbook documents the **10-step explicit deployment workflow** for AgencyOS. It is designed for human operators (L4 autonomy) who must approve every production deployment.

**Prerequisites:**
- `VERCEL_TOKEN` configured in environment or `.env` file
- `VERCEL_PROJECT_ID` (and optionally `VERCEL_TEAM_ID`) configured
- Business dossier built and validated (pipeline completed, QA passed)
- Operator has access to deployment records and approval API

---

## 10-Step Deployment Workflow

### Step 1: Verify Prerequisites
```bash
# Check Vercel credentials are available
node -e "console.log(process.env.VERCEL_TOKEN ? 'VERCEL_TOKEN: SET' : 'VERCEL_TOKEN: MISSING')"
node -e "console.log(process.env.VERCEL_PROJECT_ID ? 'VERCEL_PROJECT_ID: SET' : 'VERCEL_PROJECT_ID: MISSING')"

# Verify provider configuration
node -e "
const { VercelProvider } = require('./AgencyOS/delivery/providers/vercel/index.js');
const p = new VercelProvider({ project: process.env.VERCEL_PROJECT_ID }, {
  secrets: { require: (k) => process.env[k] }
});
p.validateConfig().then(r => console.log('Preflight:', r.ok ? 'PASS' : 'FAIL', r)).catch(e => console.log('Preflight FAIL:', e.message));
"
```
**Expected:** Both credentials present, preflight returns `{ ok: true, project: {...}, tokenPresent: true }`

**Artifacts:** None

**Failure State:** `E_DEL_SECRET_MISSING` or `E_DEL_CONFIG_INVALID` → Fix credentials and retry

---

### Step 2: Run Pipeline to Produce Build Package
```bash
# From a dossier (already built)
node AgencyOS/pipeline/demo.mjs --businessId=<BUSINESS_ID> --version=<V>
```
**Expected:** Pipeline completes with status `ready`, 19 config files generated, QA passed (`qaPassed: true`)

**Artifacts:**
- `storage/build/website-config/*.json` (19 files)
- `storage/build/artifacts/summary.json` (contains `bundleSha256`, `configCount`, `checksums`)
- `storage/build/artifacts/manifest.json`
- `storage/build/reports/*.md`

**Failure State:** Pipeline stage fails → Check `ctx.failedStage`, `ctx.error`; resume with `--resume --runId=<runId>`

---

### Step 3: Build Delivery Record
```bash
# Build delivery record (creates build record, runs QA, packages)
node -e "
const { createDeliverySystem } = require('./AgencyOS/delivery/index.js');
const { ArtifactSystem } = require('./AgencyOS/artifacts/index.js');
const { MemorySystem } = require('./AgencyOS/memory/index.js');

const root = '<STORAGE_ROOT>';
const artifacts = new ArtifactSystem({ root });
const memory = new MemorySystem({ root, validate: true });
const system = createDeliverySystem({ root, engine: <YOUR_ENGINE>, artifacts, memory, autoAllowed: false });

const result = await system.builds.build('<BUSINESS_ID>', { site, validation, trace });
console.log('Build ID:', result.buildId);
console.log('QA Passed:', result.qa.passed);
"
```
**Expected:** Build record created with `buildId` (format: `bld-<hash>`), QA passed

**Artifacts:**
- Build record in `storage/delivery/builds/<buildId>.json`
- QA report artifact (`type: qa-report`)
- Package manifest artifact

**Failure State:** `E_DEL_QA_FAILED` → Inspect `qa.failedChecks`, fix source, rebuild

---

### Step 4: Create Deployment Record (Explicit Mode)
```bash
node -e "
const record = await system.deliver({
  buildId: '<BUILD_ID>',
  mode: 'explicit',          // REQUIRED for production
  provider: 'vercel',        // or 'local' for testing
  target: { project: process.env.VERCEL_PROJECT_ID }
});
console.log('Deployment Record ID:', record.id);
console.log('Status:', record.status);  // 'awaiting_approval'
"
```
**Expected:** Record status = `awaiting_approval`, no provider contact made

**Artifacts:**
- Deployment record in `storage/delivery/records/<dep-<hash>>.json`
- Deployment report artifact (`type: deployment-report`)

**Failure State:**
- `E_DEL_QA_FAILED` → QA didn't pass (should be caught at Step 3)
- `E_DEL_UNKNOWN_BUILD` → Invalid buildId
- `E_DEL_PROVIDER_UNKNOWN` → Provider not registered

---

### Step 5: Review Deployment Record
```bash
# Inspect pending approval
node -e "
const record = system.getRecord('<DEPLOYMENT_RECORD_ID>');
console.log('Business:', record.buildRecord.businessId);
console.log('Bundle SHA256:', record.package.bundleSha256);
console.log('QA Checks:', record.qaReport.checkCount, 'passed:', record.qaReport.passed);
console.log('Timeline:', record.timeline.map(t => t.event).join(' -> '));
console.log('Approvals:', record.approvals);
"
```
**Operator Decision Point:** Verify:
- ✅ Correct business ID
- ✅ Bundle SHA256 matches expected
- ✅ QA passed with all checks
- ✅ No secrets in QA report (`secrets:scan` check passed)

**Failure State:** If any check fails → Do NOT approve. Run `system.deliver()` again with fixed build.

---

### Step 6: Approve Deployment
```bash
const approved = await system.approve('<DEPLOYMENT_RECORD_ID>', {
  by: '<OPERATOR_ID>',       // e.g., 'operator-jdoe'
  note: 'Production deploy approved per runbook Step 6'
});
console.log('New Status:', approved.status);  // 'deploying' -> 'verifying' -> 'recorded'
```
**Expected:** Status transitions: `awaiting_approval` → `deploying` → `verifying` → `recorded`

**Artifacts:** Updated deployment record with approval token, timeline events

**Failure State:**
- `E_DEL_APPROVAL_NOT_PENDING` → Record not in `awaiting_approval`
- `E_DEL_RECORD_CONFLICT` → Record was modified (another approval attempted)

---

### Step 7: Monitor Deployment Verification
```bash
# Poll for completion (typically 30-120 seconds for Vercel)
node -e "
const record = system.getRecord('<DEPLOYMENT_RECORD_ID>');
console.log('Status:', record.status);
console.log('Deployment:', record.deployment);
console.log('Timeline:', record.timeline.slice(-5).map(t => t.event + ': ' + t.detail).join('\n'));
"
```
**Expected:** Final status = `recorded`, `deployment.state` = `READY`, `deployment.url` = live HTTPS URL

**Timeline Events to Watch:**
- `DEPLOY_STARTED` → Provider deploy called
- `RETRY` (optional) → Transient failure retried
- `VERIFY_STARTED` → Polling Vercel readyState
- `VERIFY_OK` → ReadyState = `READY`
- `PROMOTED` → Alias promoted (production)
- `RECORDED` → Immutable record finalized

**Failure State:**
- `failed` status → Check `record.error`:
  - `E_DEL_AUTH_FAILED` (401) → **Never retried** - Fix token, create new build
  - `E_DEL_PROVIDER_ERROR` (5xx/rate-limit) → Retried automatically (max 3)
  - `E_DEL_QA_FAILED` → Should not happen (pre-validated)
  - `E_DEL_PROVIDER_BUDGET` → Vercel quota exceeded

---

### Step 8: Verify Live Deployment
```bash
# Automated verification (run by system)
# Manual spot-check:
curl -I <DEPLOYMENT_URL>
curl -s <DEPLOYMENT_URL> | grep -c '<title>'

# Check Vercel dashboard for:
# - Project: <VERCEL_PROJECT_ID>
# - Deployment: <DEPLOYMENT_ID>
# - State: READY
# - Production alias: promoted
```
**Expected:** HTTP 200, HTML content, correct title, HTTPS, Vercel dashboard shows READY + promoted

**Failure State:** Site returns 404/500 → Check Vercel logs, consider rollback (see Rollback Runbook)

---

### Step 9: Record Immutable Deployment Record
**Automatic** - Happens as part of Step 7 when status reaches `recorded`.

**Verification:**
```bash
node -e "
const record = system.getRecord('<DEPLOYMENT_RECORD_ID>');
console.log('Record ID:', record.id);
console.log('Bundle SHA256:', record.package.bundleSha256);
console.log('Manifest SHA256:', record.package.manifestSha256);
console.log('Match:', record.package.bundleSha256 === record.package.manifestSha256);
console.log('Timeline complete:', record.timeline.length, 'events');
"
```
**Expected:** Bundle SHA256 == Manifest SHA256, full timeline, `status: recorded`

**Artifacts:**
- Immutable deployment record (never modified after `recorded`)
- Mirrored under `storage/delivery/records/dep-<hash>.json`

---

### Step 10: Post-Deploy Intelligence Health Check
```bash
node -e "
const { createIntelligence } = require('./AgencyOS/intelligence/index.js');
const intel = createIntelligence({ root: '<STORAGE_ROOT>', orchestratorRoot: '<ORC_ROOT>', deliveryRoot: '<DEL_ROOT>' });
intel.start();
const health = intel.health();
console.log('Healthy:', health.healthy);
console.log('Sink:', health.sink);
console.log('Open Incidents:', health.openIncidents);
console.log('Active Alerts:', health.activeAlerts);
console.log('Storage:', health.stores.storageBytes, 'bytes');
intel.stop();
"
```
**Expected:** `healthy: true`, `sink.rejected: 0`, `openIncidents <= 25`, `activeAlerts: 0`

**If unhealthy:** Check incidents/alerts, investigate before next deployment

---

## Summary: Required Commands Quick Reference

| Step | Command | Expected Output |
|------|---------|-----------------|
| 1 | `node verify-creds.js` | Both credentials SET, preflight PASS |
| 2 | `node pipeline-demo.js` | Pipeline `ready`, QA passed |
| 3 | `system.builds.build()` | Build ID, QA passed |
| 4 | `system.deliver({mode:'explicit'})` | Record `awaiting_approval` |
| 5 | `system.getRecord()` | Verify bundle SHA, QA, no secrets |
| 6 | `system.approve({by:'operator'})` | Status transitions to `deploying` |
| 7 | Poll `system.getRecord()` | Final `recorded`, live URL |
| 8 | `curl <URL>` | HTTP 200, correct content |
| 8 | Verify `bundleSha256 === manifestSha256` | true |
| 10 | `intel.health()` | `healthy: true`, no rejected events |

---

## Failure Decision Tree

```
Deploy fails at Step 7?
├─ Auth failure (401/E_DEL_AUTH_FAILED)?
│   └─ YES → Fix VERCEL_TOKEN, NEW build (Step 2), NEW deploy (Step 4)
├─ Rate limit / 5xx (retryable)?
│   └─ YES → System auto-retries (max 3). If exhausted → investigate Vercel status
├─ QA failure?
│   └─ YES → Should be impossible (pre-validated). Check for race condition.
├─ Unknown readyState?
│   └─ YES → Treated as retryable. Max verify window 120s. Then PROVIDER_ERROR.
└─ Vercel quota/budget?
    └─ YES → E_DEL_PROVIDER_BUDGET. Request quota increase, retry.

Site broken at Step 8?
├─ Immediate rollback? → See Rollback Runbook
├─ Hotfix? → New build (Step 2), new deploy (Step 4)
└─ Investigate? → Check Vercel logs, Intelligence incidents
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `VERCEL_TOKEN` | **YES** | Vercel API token (Personal Account or Team) |
| `VERCEL_PROJECT_ID` | **YES** | Vercel project name or ID |
| `VERCEL_TEAM_ID` | Optional | Team slug (if project belongs to team) |
| `DELIVERY_AUTO_ALLOWED` | No | Set `true` to enable auto mode (bypasses approval) — **NOT for production** |
| `ORC_EMERGENCY_STOP` | No | Set `1` or create `EMERGENCY_STOP` file to halt all deployments |

---

## Artifacts Inventory (Per Deployment)

| Artifact Type | Location | Purpose |
|---------------|----------|---------|
| Build Record | `storage/delivery/builds/bld-<hash>.json` | Engine output, file tree, checksums |
| QA Report | `storage/artifacts/.../qa-report-<id>.json` | All QA check results |
| Package Manifest | `storage/delivery/packages/pkg-<hash>/manifest.json` | File list, SHA256 per file |
| Deployment Record | `storage/delivery/records/dep-<hash>.json` | **Immutable** - full timeline, approvals, bundle/manifest SHA256 |
| Deployment Report | `storage/artifacts/.../deployment-report-<id>.json` | Human-readable summary |
| Intelligence Reports | `storage/intelligence/reports/<date>/` | Health, operations, incidents |

---

## Escalation Contacts

| Issue | Contact |
|-------|---------|
| Vercel auth/config | DevOps / Platform Team |
| Deployment stuck | On-call Engineer |
| Site broken post-deploy | On-call Engineer + Rollback Runbook |
| Intelligence alerts | Data/Platform Team |
| Secret detected | Security Team + Rotate immediately |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.8.2-production-readiness | 2026-08-16 | Initial production runbook (Production Readiness hardening) |

---

**End of Runbook** — This document must be reviewed and updated after every production incident.