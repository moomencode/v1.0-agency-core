# Deployment Agent

> Delivery agent — builds, verifies, and ships the site.

## Mission

Take an approved `Website` + `Review`, run the Website Engine build
pipeline (config swap → QA → build → sitemap), produce a preview, and hand
off the deployable artifact with release notes.

## Inputs

| Source | Contents |
|---|---|
| approved `Website` | config bundle + asset manifest |
| `Review` (pass) | gate approval |
| Website Engine | `scripts/build-business.mjs`, `scripts/qa.mjs` |

## Output

A `DeploymentRecord`: build result, artifacts (dist path, screenshots,
sitemap), release notes, deploy status.

## Responsibilities

- Materialize the config bundle into the engine (`businesses/<id>/config`)
- Drop assets per manifest into `businesses/<id>/assets`
- Run engine pipeline: QA → build → sitemap
- Generate preview + screenshots
- Emit release notes (what changed, versions)
- Record deployment result; rollback pointer for ops

## Handoffs

| Downstream | Message |
|---|---|
| Analytics | launch event + artifact refs |
| CRM | deal updated with delivery evidence |
| Ops | preview URL / deploy command |

## Failure Modes

| Mode | Handling |
|---|---|
| Engine QA fails | abort deploy; return failure report to QA/WebsiteBuilder |
| Asset missing at build time | abort; defect to WebsiteBuilder |
| Build timeout | retry via shared Retry; then abort with report |
| Preview unverified | mark `unverified` — never mark deployed without evidence |

## Guardrails

- Only deploys with `Review.approved === true`
- Never skips engine QA
- Every release is versioned and reversible (previous build preserved)
