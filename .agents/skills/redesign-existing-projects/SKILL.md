# Redesigning Existing Projects

## Assessment Framework
When redesigning a project that has "good bones" but lacks finesse:

### 1. Typography Assessment
- **Are fonts loaded correctly?** Check for `preconnect`, `display=swap`, correct weights
- **Is there hierarchy?** 4+ distinct type sizes, 2+ weights per family
- **Line-height**: Headings 1.0–1.2, body 1.6–1.8
- **Headings need "presence"**: Not just bigger — they need letter-spacing, weight, and `text-wrap: balance`

### 2. Color Assessment
- **Background**: Not pure black (replace with warm charcoal `#1a1c1a`)
- **Text**: Not pure white (replace with `#e8e6e3` or similar warm off-white)
- **Accent**: Used sparingly — accent overload cheapens the experience
- **Hover states**: Do all interactive elements change? Color alone is not enough

### 3. Layout Assessment
- **Section padding**: 80–120px desktop, 48–64px mobile (replace default py-12/py-16)
- **Max-width containers**: 1200px for content, 1400px for immersive sections
- **Break symmetry**: Avoid 3-equal-column layouts, center-align without being rigid
- **Cards**: Add generous padding, hover elevation, subtle borders

### 4. Interactivity Assessment
- **Navigation**: Active state, scrolled state, mobile menu (slide/fade)
- **Cards**: Hover lift (translateY -4px to -8px), shadow increase
- **Buttons**: 3 states (rest, hover, active/pressed)
- **Links**: Underline animation on hover (not instant underline)
- **Images**: Lazy loading with blur placeholder or low-res preview

### 5. Content Assessment
- **Generic text**: Replace "Delicious food" with specific descriptions
- **Placeholder images**: Replace with curated Unsplash or real photography
- **Missing sections**: Contact information, social links, business hours
- **CTA clarity**: Every section should have a purpose — remove sections that don't convert

## Implementation Rules
1. Keep the existing framework/library — don't suggest rewrites
2. Work in layers: structure → typography → spacing → color → details → motion
3. Test after each layer — broken hierarchy is worse than no hierarchy
4. When in doubt, remove before adding
5. Every change should pass the "would Aman Resorts do this?" test

## The Aman Test
Ask yourself for every component:
- Would you find this in a Aman Resorts property?
- Is this refined enough for a Soho House member?
- Would this feel at home in a Four Seasons lobby?

If not, iterate until it does.
