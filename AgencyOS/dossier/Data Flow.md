# Dossier Engine — Data Flow

```
DISCOVERY RECORD                          (from discovery/ probe, enrichment)
   │  { id, name, category, phone, email, whatsapp, instagram, facebook,
   │    address, coordinates, photos[], menus[], booking, rating, reviews,
   │    website, probe{ok,status,timeMs}, sources[], weaknesses[], scores{} }
   ▼
prepareInput()
   │  ContextEngine.build(record)   ──▶ context (scores, presence, flags, weaknesses)
   │  DecisionEngine.estimate(ctx)  ──▶ estimates (websiteValue, devCost, salesValue, ROI, closing)
   │  DecisionEngine.evaluate(ctx, {policies}) ──▶ decision (verdict, risk, confidence, priority)
   │  (when brain wired: Brain.runBusiness = the three above in one call)
   ▼
EXTRACTORS ──▶ PROFILE        name, category, area, tags, status
            ──▶ CONTACT       phone/email/whatsapp/website/address (raw)
            ──▶ DIGITAL       website, probe, social links, booking, photos, menus
            ──▶ COMMERCE      rating, reviews, hours
   ▼  (each raw value passes through the matching normalizer)
NORMALIZERS   phone ─▶ +20… (Egyptian E.164) · email ─▶ lowercased
              url ─▶ https protocol · social ─▶ profile URLs
              coords ─▶ {lat,lng,rounded} + mapsUrl · hours ─▶ ranges
   ▼
ENRICHERS (context-aware)
   brandEnricher          name signals · tagline · category keywords
   competitorsEnricher    competitor names + advantage notes
   strengthsEnricher      strengths from presence/scores/weakness absence
   weaknessesEnricher     recordDefs + detected gaps (missing-contact, no-website…)
   opportunitiesEnricher  ranking from weaknesses + presence gaps
   risksEnricher          ranking from context + weakness severity
   recommendationsEnricher quick wins · top problems · website recs (w-build, w-booking…)
   grades                 healthGrade (A–E) · digitalGrade (A–E)
   ▼
BUILDERS ──▶ 20 documents (each validated against its JSON schema)
   business  brand  contact  location  hours  social  website  seo  reviews
   photos  services  products  pricing  competitors  strengths  weaknesses
   opportunities  risks  recommendations  summary
   ▼
RENDERER ──▶ 5 markdown reports (executive, business-health, digital-presence,
             opportunity, website-recommendation)
   ▼
PERSIST ──▶ storage/dossiers/<businessId>/v<N>/ (README + 20 JSON + 5 MD)
   │        index.json update · latest.json repoint
   ▼
EVENTS ──▶ dossier.started → dossier.validated → dossier.created|updated → dossier.reports_ready
MEMORY ──▶ put('business', 'business:<id>', <id>, { dossierId, version, healthGrade, verdict })
```

## Versioning Flow

```
build(record)                    → v1 (fresh)
build(record, { update: true })  → v2 (rating change) — v1 untouched
load(id)                         → newest version
load(id, { version: 1 })         → historical snapshot
```

## Search Index

```
storage/dossiers/index.json
[{ businessId, name, category, area, verdict, opportunity, healthGrade,
   version, updatedAt }]
```

Queries: `q` (name match), `category`, `verdict`, `area`,
`minOpportunity`, `minHealth`.
