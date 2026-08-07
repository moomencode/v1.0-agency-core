# Asset Report

Business: Nile Terrace (dis-cairo-010)
Layout: Restaurant

References: 13  |  In-manifest: 13  |  Placeholders: 0  |  Missing: 0  |  External: 0

| ref | status | group | source |
|---|---|---|---|
| /logo/logo.png | in-manifest | logos | client |
| /logo/logo-light.png | in-manifest | logos | client |
| /logo/favicon.png | in-manifest | logos | client |
| /hero/dark-hero.jpg | in-manifest | hero | unsplash |
| /hero/light-hero.jpg | in-manifest | hero | unsplash |
| /placeholders/gallery-1.jpg | in-manifest | placeholders | generated |
| /placeholders/gallery-2.jpg | in-manifest | placeholders | generated |
| /placeholders/gallery-3.jpg | in-manifest | placeholders | generated |
| /placeholders/gallery-4.jpg | in-manifest | placeholders | generated |
| /placeholders/food-1.jpg | in-manifest | placeholders | generated |
| /gallery/b322ce26.jpg | in-manifest | gallery | unsplash |
| /placeholders/food-2.jpg | in-manifest | placeholders | generated |
| /placeholders/food-3.jpg | in-manifest | placeholders | generated |

## Placeholder policy

Any image reference with no file on disk is served from a deterministic generated SVG placeholder
(`/placeholders/*.svg`) so the site always renders complete. Real photography is a drop-in upgrade:
download the manifest entries into the site `public/` folder and rebuild — output stays identical
except for the image bytes.
