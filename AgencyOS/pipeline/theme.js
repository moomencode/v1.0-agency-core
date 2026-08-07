import { clamp } from './utils.js';

function rgb(v) {
  return String(v).trim().split(/\s+/).slice(0, 3).map(Number);
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function lighten(rgbArr, t) {
  return mix(rgbArr, [255, 255, 255], t);
}

function darken(rgbArr, t) {
  return mix(rgbArr, [0, 0, 0], t);
}

function rgbStr(a) {
  return a.join(' ');
}

function luminance(a) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(a[0]) + 0.7152 * f(a[1]) + 0.0722 * f(a[2]);
}

function contrastPair(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function fontsUrl(display, body) {
  const map = {
    "'Cormorant Garamond', serif": 'Cormorant+Garamond:wght@500;600;700',
    "'Playfair Display', serif": 'Playfair+Display:wght@500;600;700',
    "'Merriweather', serif": 'Merriweather:wght@400;700',
    "'Lora', serif": 'Lora:wght@400;500;600',
    "'Fraunces', serif": 'Fraunces:wght@400;500;600',
    "'Sora', sans-serif": 'Sora:wght@400;600;700',
    "'Outfit', sans-serif": 'Outfit:wght@400;500;600;700',
    "'Oswald', sans-serif": 'Oswald:wght@400;500;600',
    "'Bebas Neue', sans-serif": 'Bebas+Neue',
    "'Nunito Sans', sans-serif": 'Nunito+Sans:wght@300;400;600;700',
    "'Inter', sans-serif": 'Inter:wght@300;400;500;600;700',
    "'Source Sans 3', sans-serif": 'Source+Sans+3:wght@300;400;600'
  };
  const d = map[display] || 'Inter:wght@400;600;700';
  const b = map[body] || 'Inter:wght@300;400;600;700';
  return `https://fonts.googleapis.com/css2?family=${d}&family=${b}&display=swap`;
}

export function generateThemeTokens(n, { overridePrimary = null } = {}) {
  const profile = n.profile;
  const primary = overridePrimary || (n.brand.primaryColor) || profile.palette.primary;
  let p;
  if (/^#/.test(primary)) p = hexToRgb(primary);
  else p = rgb(primary);
  p = p.map((v) => clamp(v, 0, 255));
  const base = rgb(profile.palette.base);
  const ink = rgb(profile.palette.ink);

  const isDarkFriendly = luminance(contrastPair(ink, base) >= 7 ? ink : [255, 255, 255]) < 0.4;

  const dark = {
    base: rgbStr(base),
    'base-deep': rgbStr(darken(base, 0.35)),
    surface: rgbStr(lighten(base, 0.14)),
    'surface-2': rgbStr(lighten(base, 0.26)),
    'surface-3': rgbStr(lighten(base, 0.38)),
    primary: rgbStr(p),
    'primary-light': rgbStr(lighten(p, 0.18)),
    'primary-dark': rgbStr(darken(p, 0.22)),
    ink: rgbStr(ink),
    'ink-muted': rgbStr(mix(ink, base, 0.42))
  };

  const light = {
    base: rgbStr(lighten(base, 0.9)),
    'base-deep': rgbStr(lighten(base, 0.78)),
    surface: '255 255 255',
    'surface-2': rgbStr(mix(base, [255, 255, 255], 0.78)),
    'surface-3': rgbStr(mix(base, [255, 255, 255], 0.6)),
    primary: rgbStr(darken(p, 0.22)),
    'primary-light': rgbStr(p),
    'primary-dark': rgbStr(darken(p, 0.4)),
    ink: rgbStr(darken(base, 0.2)),
    'ink-muted': rgbStr(mix(ink, [255, 255, 255], 0.55))
  };

  const tokens = {
    colors: { dark, light },
    contrast: {
      dark: { primaryOnPrimary: contrastPair(darken(p, 0.3), p).toFixed(2), inkOnBase: contrastPair(ink, base).toFixed(2), primaryOnBase: contrastPair(lighten(p, 0.25), base).toFixed(2) },
      light: { primaryOnPrimary: contrastPair(lighten(p, 0.4), darken(p, 0.22)).toFixed(2), inkOnBase: contrastPair(darken(base, 0.2), lighten(base, 0.9)).toFixed(2), primaryOnBase: contrastPair(darken(p, 0.22), lighten(base, 0.9)).toFixed(2) }
    },
    typography: {
      display: profile.fonts.display,
      body: profile.fonts.body,
      fontsUrl: fontsUrl(profile.fonts.display, profile.fonts.body)
    },
    spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2.5rem', '2xl': '4rem' },
    radius: { sm: '0.5rem', md: '0.75rem', lg: '1rem', xl: '1.25rem', full: '9999px' },
    shadows: {
      primary: '0 4px 24px -4px rgb(var(--c-primary) / 0.35)',
      'primary-lg': '0 8px 40px -8px rgb(var(--c-primary) / 0.3)',
      elevated: '0 12px 48px -12px rgba(0, 0, 0, 0.5)'
    },
    buttons: {
      primary: { radius: '0.75rem', paddingX: '1.5rem', paddingY: '0.7rem', fontWeight: '600' },
      secondary: { radius: '0.75rem', paddingX: '1.5rem', paddingY: '0.7rem', fontWeight: '600' }
    },
    cards: { radius: '1rem', padding: '1.5rem', borderOpacity: '0.08' },
    animations: {
      ease: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      durationFast: '150ms',
      durationBase: '300ms',
      durationSlow: '600ms'
    },
    icons: { strokeWidth: '1.8', sizeSm: '16px', sizeMd: '24px', sizeLg: '36px' },
    gradients: {
      hero: `linear-gradient(180deg, rgb(var(--c-base) / 0.92) 0%, rgb(var(--c-base) / 0.55) 45%, rgb(var(--c-base) / 0.92) 100%)`,
      primaryFade: `linear-gradient(135deg, rgb(var(--c-primary) / 0.25), rgb(var(--c-primary) / 0.05))`
    }
  };

  return { tokens, defaultMode: isDarkFriendly ? 'dark' : 'light' };
}

export function themeJsonFromTokens(tokens, n, { defaultMode = 'dark', storageKey = null } = {}) {
  return {
    name: n.id,
    defaultMode,
    storageKey: storageKey || 'site-theme',
    colors: tokens.colors,
    typography: tokens.typography,
    spacing: tokens.spacing,
    radius: tokens.radius,
    shadows: tokens.shadows,
    buttons: tokens.buttons,
    cards: tokens.cards,
    animations: tokens.animations,
    icons: tokens.icons,
    gradients: tokens.gradients
  };
}
