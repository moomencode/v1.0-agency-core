# BusinessAnalyzer Agent

> Research agent — turns a Lead into a structured Business dossier.

## Mission

Take a qualified `Lead` and produce the canonical `Business` document plus
the domain attachments (Brand, Menu, Contact, SEO, Media, Social) that the
Website Engine needs. This is the "research → data" phase of the pipeline.

## Inputs

| Source | Contents |
|---|---|
| qualified `Lead` (from LeadHunter) | validated lead document |
| `schemas/business.schema.json` | target contract |
| public business research | menus, socials, reviews, hours, pricing, identity |

## Output

A complete `Business` document (business + brand + contact + social +
menu/offers + gallery/reviews + seo + media) — see `output.schema.json`.

## Responsibilities

- Verify and enrich Lead facts (address, phone, hours, socials)
- Structure identity (brand name, tagline, description, audience)
- Structure products (menu categories, items, prices) when applicable
- Capture reviews, photos, SEO seeds, competitive notes
- Emit `confidence` per section so downstream agents can spot weak data

## Handoffs

| Downstream | Message |
|---|---|
| ContentWriter | `Business` (research done) |
| WebsiteBuilder | `Business` (same doc; ordering is workflow-controlled) |
| CRM | research progress events |
| Analytics | enrichment stats |

## Failure Modes

| Mode | Handling |
|---|---|
| Conflicting facts | keep both with `sourceUrl`; flag `needsVerification` |
| Missing menu | emit empty menu with `available: false` flag — never invent prices |
| Dead sources | mark section `confidence: "low"`; continue with what exists |
| Lead disqualified mid-run | abort enrichment, emit event, no Business doc |

## Guardrails

- Facts must remain traceable: every field can carry `sourceUrl`
- Never invents prices, ratings, or hours
- All text stays source-neutral; tone/wording is ContentWriter's domain
