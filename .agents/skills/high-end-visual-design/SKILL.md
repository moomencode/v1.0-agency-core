# High-End Visual Design System

## Design Philosophy
Every pixel must justify its existence. Premium digital design is the art of reduction — removing everything that doesn't serve the experience until only the essential, beautiful, and functional remains.

## Visual Principles

### 1. Spatial Poetry
- **Whitespace is the most underrated luxury**. Sections breathe at 120–160px on desktop, 64–80px on mobile
- **Padding within cards**: 32px minimum, 48px for featured content
- **The 60-30-10 rule**: 60% primary surface, 30% secondary surface, 10% accent
- **Element grouping**: Related items touch at 8–16px, unrelated items breathe at 32–48px

### 2. Light & Shadow
- **Depth through shadow**: max 3 layers (surface, elevated, modal). Use `box-shadow` layers not `drop-shadow`
- **Light source**: consistent top-left origin for all shadows
- **Glow effects**: Use sparingly — only for true accents (gold highlights, active states)
- **Dark mode**: Warm dark grays (`#1a1c1a`) not pure black; adjust shadow opacity not color

### 3. Typography as Architecture
- **Font pairing**: Editorial serif for display + clean grotesk for UI = timeless combination
- **Capital letters**: Use for labels and metadata only — never shout full sentences in caps
- **Orphans & widows**: Use `text-wrap: balance` on all headings (CSS `text-wrap: pretty` on paragraphs)
- **Ligatures**: Enable `font-variant-ligatures: contextual` for serif fonts

### 4. Color Chemistry
- **Black is not a color**: Replace `#000` with `#1a1a1a`. Replace `#fff` with `#f5f5f0` or `#fafafa`
- **Saturation matters**: Luxury palettes use desaturated primaries + one saturated accent
- **Gradients**: Maximum 2 stops, angle 135° or 180°, contrast ratio minimum 4.5:1
- **Metallics**: Gold/Brass tones at 40–60% saturation feel premium; above 70% feels cheap.

### 5. Detail Density
- **Borders**: 1px thin borders feel refined; 2px+ feels functional
- **Border radius**: 4px (functional), 8px (card), 16px (modal), 24px (sheet) — never fully rounded
- **Dividers**: Thin (`1px`), low opacity (`0.1`), used as subtle rhythm not loud breaks

### 6. Interaction Finesse
- **Hover**: Scale 1.02–1.05 + shadow elevation (never just color change)
- **Active**: Scale 0.97 + faster duration (100–150ms)
- **Focus**: 2px box-shadow with 4px offset, matching accent color
- **Transition**: `cubic-bezier(0.25, 0.1, 0.25, 1)` for standard, `cubic-bezier(0.34, 1.56, 0.64, 1)` for spring

## Double-Bezel Card Architecture
A signature pattern for displaying content with depth and elegance:

```
[Outer Card] ← border: 1px solid rgba(255,255,255,0.08)
  [Padding: 32px]
    [Inner Container] ← background at +5% luminance from parent
      [Padding: 24px]
      [Content]
    [/Inner Container]
  [/Padding]
[/Outer Card]
```

- Outer card: subtle border, elevated shadow, 8px radius
- Inner container: inset shadow, 4px radius, creates nested depth
- Use for: feature cards, menu items, testimonial blocks, pricing tables
