# Website Engine Demo

End-to-end demonstration of the Universal Website Engine (Phase 4.3): for each
business, the full chain runs —

```
Business Dossier (Phase 4.1) → Pipeline (Phase 4.2) → Website Config Bundle → Website Engine → Website
```

## Running

```bash
node demo/demo.mjs
```

Output is written to `demo/sites/<businessId>/` with one directory per format:

| Directory  | Contents |
|------------|----------|
| `static/`  | Hostable HTML site (index.html, menu.html, contact.html, robots.txt, sitemap.xml, site.webmanifest, favicon, placeholders) |
| `react/`   | Complete Vite + React project (`npm install && npm run dev` / `npm run build`) |
| `json/`    | `site-bundle.json` — the full serialized site model |
| `vercel/`  | Vercel-ready React project with `vercel.json` |
| `preview/` | Single self-contained `index.html` preview with a page switcher |

`site-manifest.json` at each site root records per-file SHA-256 checksums.

## The 7 demo businesses

| Business | Category | Layout |
|----------|----------|--------|
| Cairo Roastery | cafe | cafe |
| Nile Terrace | restaurant | restaurant |
| Heliopolis Clinic | clinic | medical |
| Prime Properties | realestate | realestate |
| Delta Logistics | shop | corporate |
| Atelier Cairo | tailor | portfolio |
| Nile Books | other | default |

Every demo site passes the full validation gate (7 checks per page) before it is
exported; any site that failed would be reported in the run output and skipped.
