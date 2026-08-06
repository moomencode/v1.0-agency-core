# MASTER_TEMPLATE.md
# Universal Business Website Engine — Master Template

> One codebase. Any business. Zero manual coding.
> This repository is a **Website Generation Engine**, not a single website.
> The active site is a demonstration (Garcia Restaurant & Cafe); the same
> source powers a bakery, a clinic, a gym, a hotel — anything.

---

## 1. What This Engine Does

The engine turns **business data → premium website** automatically:

```
Business Research → Business Data → Config Files → Assets → Build → QA → Sitemap → Ready to Sell
```

- Every business lives in a folder under `businesses/<name>/`
- A business folder = `config/*.json` (all data) + `assets/` (all media)
- The React/Tailwind code is **100% generic** — it renders configuration
- New business types, sections, languages, and colors need **zero source changes**

### Supported business types (already mapped to Schema.org)

| Type | Type key (`business.json`) | Schema.org |
|---|---|---|
| Restaurant | `restaurant` | Restaurant |
| Cafe | `cafe` | CafeOrCoffeeShop |
| Bakery | `bakery` | Bakery |
| Pizza | `pizza` | FastFoodRestaurant |
| Burger | `burger` | FastFoodRestaurant |
| Dessert | `dessert` | IceCreamShop |
| Hotel | `hotel` | Hotel |
| Clinic | `clinic` | MedicalClinic |
| Gym | `gym` | HealthClub |
| Barber | `barber` | HairSalon |
| Beauty Salon | `beauty-salon` | BeautySalon |
| Anything else | any key | LocalBusiness (fallback) |

---

## 2. Quick Start

```bash
npm install          # once

npm run dev          # develop the active business (config/ + assets/)
npm run qa           # validate active config
npm run build        # production build of active business
npm run preview      # serve dist/
npm run sitemap      # generate dist/sitemap.xml
```

### Build any business (multi-business pipeline)

```bash
npm run new:business -- cafe-luna      # scaffold businesses/cafe-luna
# ... fill businesses/cafe-luna/config + assets ...
npm run qa                             # validate the ACTIVE config
npm run build:business -- cafe-luna    # swap config+assets, QA, build
```

`build:business` copies `businesses/<name>/config` → `config/` and
`businesses/<name>/assets` → `assets/`, validates with QA, builds, and
generates `dist/sitemap.xml`. The project root always holds the **active**
business; the `businesses/` folder holds the library.

---

## 3. Project Architecture

```
Garcia2/
├── config/                  ← ACTIVE business configuration (all JSON)
│   ├── business.json        ← identity, type, currency, sections
│   ├── brand.json           ← name, logo, tagline, description
│   ├── theme.json           ← colors, typography, shadows, radius
│   ├── seo.json             ← title, meta, OG, Twitter, canonical
│   ├── social.json          ← facebook / instagram / whatsapp / ...
│   ├── contact.json         ← phone, email, address, maps, hours
│   ├── navigation.json      ← nav items + CTA
│   ├── hero.json            ← hero copy, images, CTAs, info strip
│   ├── menu.json            ← categories + dishes + prices
│   ├── offers.json          ← promotions
│   ├── gallery.json         ← photos
│   ├── booking.json         ← reservation form labels + behavior
│   ├── features.json        ← About / "why us" module
│   ├── services.json        ← Services module
│   ├── stats.json           ← animated counters module
│   ├── reviews.json         ← testimonials module
│   ├── faq.json             ← FAQ accordion module
│   ├── footer.json          ← footer copy
│   └── i18n.json            ← shared UI strings
│
├── assets/                  ← ACTIVE business media (public root)
│   ├── logo/  hero/  gallery/  food/
│   ├── background/  icons/  videos/
│   └── robots.txt
│
├── businesses/              ← BUSINESS LIBRARY (one folder per business)
│   ├── garcia/              ← demo restaurant
│   │   ├── config/*.json
│   │   └── assets/*
│   └── cafe-luna/           ← second demo (cafe)
│
├── src/
│   ├── core/                ← THE ENGINE (framework-agnostic)
│   │   ├── site.js          ← aggregates all config JSON into SITE
│   │   ├── config.js        ← safe accessors, currency, section flags
│   │   ├── i18n.js          ← localization (t(), locale maps)
│   │   ├── assets.js        ← media resolver (URLs / local files)
│   │   ├── icons.js         ← icon name registry (lucide)
│   │   ├── seo.js           ← meta/OG/Twitter/JSON-LD injection
│   │   └── theme.js         ← CSS variables + fonts from theme.json
│   ├── components/          ← generic UI (Button, Card, SectionHeading...)
│   ├── sections/            ← data-driven page modules
│   ├── Context/ThemeContext.jsx
│   ├── App.jsx              ← renders sections from business.json
│   ├── main.jsx             ← boots theme + SEO + React
│   └── index.css            ← base styles (tokens come from theme.json)
│
├── scripts/
│   ├── qa.mjs               ← automatic config validation
│   ├── build-business.mjs   ← multi-business build pipeline
│   ├── new-business.mjs     ← business scaffolder
│   ├── generate-sitemap.mjs ← sitemap.xml generator
│   └── schemas.mjs          ← validation schema definitions
│
├── tailwind.config.js       ← generated from config/theme.json
├── vite.config.js           ← assets/ = public media root
├── index.html               ← empty shell (SEO injected at runtime)
└── MASTER_TEMPLATE.md
```

---

## 4. The Configuration System

### 4.1 How the engine reads config

`src/core/site.js` statically imports every JSON in `config/` and exposes
one `SITE` object. `src/core/config.js` adds safe accessors:

```js
import { cfg, formatPrice, sectionEnabled } from '../core/config'

cfg('contact.phone')          // safe nested access (undefined instead of crash)
formatPrice(220)              // "220 EGP"  (currency from business.json)
sectionEnabled('stats')       // is the stats module on?
```

### 4.2 Design tokens (colors, fonts, shadows)

`config/theme.json` defines two palettes (dark/light) as **"R G B" triplets**:

```json
{
  "colors": {
    "dark":  { "base": "11 28 21", "surface": "18 42 32", "primary": "212 175 55", "ink": "244 239 230", "...": "..." },
    "light": { "base": "250 247 240", "...": "..." }
  },
  "typography": { "display": "'Playfair Display', serif", "body": "'Poppins', sans-serif", "fontsUrl": "https://fonts.googleapis.com/..." },
  "shadows": { "primary": "0 4px 24px -4px rgb(var(--c-primary) / 0.35)", "elevated": "0 12px 48px -12px rgba(0,0,0,0.5)" },
  "animations": { "ease": "cubic-bezier(...)", "spring": "..." }
}
```

- `src/core/theme.js` injects these as CSS custom properties at runtime
- `tailwind.config.js` derives the utility classes from the same file
  (`bg-base`, `text-primary`, `border-ink/20`, `shadow-elevated`, `font-display`...)

**To re-theme an entire site: edit one JSON file.** The class names stay
identical across businesses.

### 4.3 Text localization (unlimited languages)

Every text field accepts either a plain string or a **locale map**:

```json
{ "label": { "en": "View Menu", "ar": "\u0639\u0631\u0636 \u0627\u0644\u0645\u0646\u0648" } }
```

The `t()` helper (`src/core/i18n.js`) returns the string for the active
locale. Locale = `business.json → locale`, overridable via the
`site-locale` localStorage key. No string is hardcoded in components.

### 4.4 Icons

Config references icons by **string name** (registry in `src/core/icons.js`):

```json
{ "icon": "utensils-crossed" }        // or "map-pin", "coffee", "scissors", "dumbbell"...
```

---

## 5. Website Modules

`business.json → sections` is an ordered array. Add, remove, or reorder a
module without touching source code:

```json
"sections": ["navbar", "hero", "menu", "offers", "reservation", "gallery", "location", "footer"]
```

| id | Section | Reads from | Notes |
|---|---|---|---|
| `navbar` | Navbar | navigation, brand | sticky, mobile drawer, theme toggle |
| `hero` | Hero | hero, brand | theme-aware image, CTAs, info strip |
| `menu` | Menu | menu | category tabs + dishes + prices |
| `offers` | Offers | offers | promotion cards |
| `reservation` | Reservation | booking, contact, business | validated form + WhatsApp action |
| `gallery` | Gallery | gallery | responsive photo grid |
| `location` | Location | contact, brand | info card + Google Maps embed |
| `footer` | Footer | footer, navigation, social, contact | brand, links, contact, hours |
| `about` | About | features | feature grid (new module) |
| `services` | Services | services | icon service cards |
| `stats` | Stats | stats | animated counters |
| `testimonials` | Testimonials | reviews | review cards with stars |
| `faq` | Faq | faq | accordion |
| `orderOnline` | OrderOnline | order | phone mockup promo |

To add a **new module**: create `src/sections/Xxx.jsx` (rendering only
data), add it to `SECTION_REGISTRY` in `src/App.jsx`, create its config
file. That's the whole integration cost.

---

## 6. Media System

- `assets/` is the public root (see `vite.config.js → publicDir`)
- Files are referenced by URL: `/logo/logo.png`, `/hero/dark-hero.jpg`
- Remote images work too — any `https://` URL is used as-is
- `asset()` (src/core/assets.js) resolves both cases
- `themedImage({ dark, light }, theme)` picks per theme mode
- A missing/broken local image falls back to an inline SVG placeholder
  (components use the `Image` component)

Structure per business:

```
assets/
├── logo/        favicon + logo variants (dark/light)
├── hero/        hero backgrounds
├── gallery/     photo gallery
├── food/        menu items
├── background/  section backgrounds
├── icons/       custom icons
└── videos/      hero/section videos (future)
```

---

## 7. SEO System

All SEO lives in `config/seo.json` and is injected at runtime by
`src/core/seo.js`:

- `<title>`, description, keywords, author, robots
- canonical URL
- Open Graph (og:*) + Twitter card meta
- favicon (from `brand.logo.favicon`)
- **JSON-LD Schema.org** — type picked from `business.type` /
  `seo.schemaType` (see the table in §1), enriched with name, address,
  phone, hours, social links, image
- `<html lang>` from `business.locale`
- `npm run sitemap` → `dist/sitemap.xml` from canonical + navigation

---

## 8. How AI Agents Should Use This Template

This repo is designed to be operated by AI agents. The agent workflow:

```
Agent 1  Research the business                     → read businesses/<name> state, web research
Agent 2  Collect business information              → interview / forms → structured data
Agent 3  Generate configuration files              → write businesses/<name>/config/*.json
         + run `npm run qa`                        → iterate until PASSED
Agent 4  Generate assets                           → drop images into businesses/<name>/assets/*
         (logo/, hero/, gallery/, food/)           → reference them as /<kind>/file.ext
Agent 5  Build the website                         → npm run build:business -- <name>
Agent 6  Run QA                                    → node scripts/qa.mjs (exit code gates deploy)
Agent 7  Generate screenshots                      → browser tool against `npm run preview`
         (configure canonical URL first)
Agent 8  Generate a sales report                   → bundle screenshots + config summary
```

### Rules for agents

1. **Never edit** files under `src/` to customize a business — edit only
   the business folder.
2. **Never hardcode** text — use locale maps when the business is bilingual.
3. **Colors** = "R G B" triplets in `theme.json`. Keep all 10 tokens per
   palette; contrast: `ink` on `base`, `primary` on `base`.
4. **Menu** categories in `menu.json` must have matching `dishes.<id>`.
5. Every dish needs `name`, `price > 0`, `image`.
6. `sections` array must only contain registered ids (§5).
7. Always end with `npm run qa` passing and `npm run build:business -- <name>`.

### Creating a new business (agent script)

```bash
npm run new:business -- <slug>     # scaffold
# then overwrite config files with researched data
# then drop assets, run qa, run build:business
```

---

## 9. How to Replace Branding (manual)

1. `config/brand.json` — name, shortName, tagline, logo paths, description
2. `config/theme.json` — colors + fonts (two palettes)
3. `assets/logo/` — replace `logo.png` (dark), `logo3.png` (light), favicon
4. `config/seo.json` — title, description, canonical, OG images
5. Rebuild: `npm run build`

## How to Replace Content (manual)

Every section's copy is in its own JSON file (§5 table). Prices/currency:
`business.json → currency`. Phone validation: `business.json → phoneDigits`.

## How to Deploy

```bash
npm run build                     # outputs dist/ (fully static)
npm run sitemap                   # dist/sitemap.xml
# deploy dist/ anywhere: Netlify, Vercel, GitHub Pages, S3+CloudFront, cPanel
```

Static SPA — no server required. If you host under a sub-path, set
`base` in `vite.config.js`.

---

## 10. Future Roadmap

- **Backendless forms**: reservation/contact submissions to WhatsApp,
  email (Formspree/Web3Forms), or a headless API — all via `booking.json`
- **Multi-page engine**: menu page, about page, contact page as routes
  (navigation.json gains `url` keys); sitemap already supports it
- **Loading screen + custom favicon variants**: config-driven preloader
- **Videos**: hero/section videos from `assets/videos/`
- **i18n UI**: language switcher (the `t()` layer is ready)
- **Ordering cart**: menu.json `badges`/`available` fields are ready;
  add a cart module reading `menu.json`
- **AI screenshot pipeline**: Playwright script generating per-section
  screenshots into the business folder for the sales report
- **CMS sync**: import config from Airtable/Sheets/Strapi via a script
- **CLI**: `generate-business` interactive wizard wrapping `new:business`

---

## 11. Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `npm run qa` fails | A required key is missing — error lists file + key |
| Build error after editing theme.json | Keep tokens as "R G B" triplets (10 per palette) |
| Section not rendering | id not in `business.sections` or not registered in App.jsx |
| Images 404 | Reference files as `/<kind>/<file>` and keep them under `assets/<kind>/` |
| Fonts don't change | Check `theme.json → typography.fontsUrl` + `display`/`body` stacks |
| Price looks wrong | `business.json → currency` (symbol, position, decimals) |
