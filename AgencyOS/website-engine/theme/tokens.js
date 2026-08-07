function rgb(v) {
  return String(v).trim().split(/\s+/).slice(0, 3).map(Number);
}

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function parseColor(v) {
  if (!v) return null;
  if (/^#/.test(v)) return hexToRgb(v);
  const p = rgb(v);
  return p.length === 3 && p.every((n) => Number.isFinite(n)) ? p : null;
}

function luminance(a) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(a[0]) + 0.7152 * f(a[1]) + 0.0722 * f(a[2]);
}

export function contrastRatio(fg, bg) {
  const l1 = luminance(parseColor(fg));
  const l2 = luminance(parseColor(bg));
  if (l1 === null || l2 === null) return null;
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function contrastPairs(colors) {
  const pairs = {
    inkOnBase: colors.ink && colors.base ? contrastRatio(colors.ink, colors.base) : null,
    primaryOnBase: colors.primary && colors.base ? contrastRatio(colors.primary, colors.base) : null,
    primaryOnPrimary: colors.primary && colors['primary-dark'] ? contrastRatio(colors['primary-dark'], colors.primary) : null
  };
  for (const k of Object.keys(pairs)) pairs[k] = pairs[k] !== null ? Number(pairs[k].toFixed(2)) : null;
  return pairs;
}

export function parseTheme(themeJson) {
  if (!themeJson || typeof themeJson !== 'object') throw Object.assign(new Error('theme.json required'), { code: 'WEB_MISSING_CONFIG' });
  const colors = themeJson.colors || {};
  if (!colors.dark || !colors.light) throw Object.assign(new Error('theme.json must define colors.dark and colors.light'), { code: 'WEB_INVALID_BUNDLE' });
  const modes = { dark: colors.dark, light: colors.light };
  for (const mode of Object.keys(modes)) {
    for (const key of ['base', 'primary', 'ink']) {
      if (!modes[mode][key]) throw Object.assign(new Error(`theme.json colors.${mode}.${key} required`), { code: 'WEB_INVALID_BUNDLE' });
    }
  }
  return {
    name: themeJson.name || 'site',
    defaultMode: themeJson.defaultMode === 'light' ? 'light' : 'dark',
    storageKey: themeJson.storageKey || 'site-theme',
    colors: modes,
    contrast: { dark: contrastPairs(colors.dark), light: contrastPairs(colors.light) },
    typography: themeJson.typography || { display: "'Inter', sans-serif", body: "'Inter', sans-serif", fontsUrl: null },
    spacing: themeJson.spacing || {},
    radius: themeJson.radius || {},
    shadows: themeJson.shadows || {},
    buttons: themeJson.buttons || {},
    cards: themeJson.cards || {},
    animations: themeJson.animations || {},
    icons: themeJson.icons || {},
    gradients: themeJson.gradients || {}
  };
}
