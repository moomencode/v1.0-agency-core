# Template: Website Config Bundle

> The empty shell WebsiteBuilder fills per business. Mirrors the engine
> contract at `Garcia2/config/*` — one file per engine config key.

## Contract

| Engine key | File (in `businesses/<id>/config/`) | Content source |
|---|---|---|
| business | `business.json` | BusinessAnalyzer (dossier) |
| brand | `brand.json` | BusinessAnalyzer + ContentWriter voice |
| theme | `theme.json` | WebsiteBuilder palette derivation |
| seo | `seo.json` | ContentWriter |
| social | `social.json` | BusinessAnalyzer |
| contact | `contact.json` | BusinessAnalyzer (facts sacred) |
| navigation | `navigation.json` | WebsiteBuilder (section order) |
| hero | `hero.json` | ContentWriter copy + Media |
| menu | `menu.json` | ContentWriter from dossier offerings |
| offers | `offers.json` | ContentWriter |
| gallery | `gallery.json` | Media manifest mapping |
| booking | `booking.json` | WebsiteBuilder (hours + contact) |
| features | `features.json` | WebsiteBuilder (type defaults) |
| services | `services.json` | ContentWriter |
| stats | `stats.json` | ContentWriter (facts only) |
| reviews | `reviews.json` | BusinessAnalyzer (verified only) |
| faq | `faq.json` | ContentWriter |
| footer | `footer.json` | ContentWriter |
| i18n | `i18n.json` | ContentWriter (locale maps) |

## Baseline Shape (to be filled, never invented)

```jsonc
{
  "id": "<businessId>",
  "type": "restaurant",          // engine enum
  "sections": [ ... ],           // engine section ids, ordered
  "locale": "en",                // default
  "languages": ["en", "ar"],     // actual locales used
  "currency": "USD",             // dossier fact
  "phoneDigits": "+10000000000", // dossier fact
  // ...engine keys follow the Garcia2/config/* shapes exactly
}
```

## Rules for WebsiteBuilder

1. Copy the engine file shapes from `Garcia2/config/*.json` verbatim —
   never invent new keys.
2. Every locale map: `{en: ..., ar: ...}` or `{singleLocale: true, value}`
   per the ContentWriter contract.
3. Palette: 10 `"R G B"` triplet tokens per mode (light/dark) —
   `base, base-deep, surface, surface-2, surface-3, primary, primary-light,
   primary-dark, ink, ink-muted` — derived from dossier brand colors.
4. Facts (prices, hours, contact) pass through from the dossier
   unchanged; conflicts are recorded in `conflicts[]`, never resolved
   by guessing.
5. Assets referenced by relative paths under `businesses/<id>/assets/`;
   every missing file is listed with `isPlaceholder: true` in the
   assetManifest.
