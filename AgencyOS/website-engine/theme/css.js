function cssVarsFor(modeColors, prefix = '') {
  const lines = [];
  for (const [key, value] of Object.entries(modeColors)) {
    lines.push(`  ${prefix}--c-${key}: ${value};`);
  }
  return lines.join('\n');
}

function cssVar(name) {
  return `var(--${name})`;
}

export function cssVariables(t) {
  const { defaultMode, storageKey } = t;
  const altMode = defaultMode === 'dark' ? 'light' : 'dark';
  const alt = `[data-theme="${altMode}"]`;
  const lines = [':root {', cssVarsFor(t.colors[defaultMode]), '}'];
  lines.push('', `${alt} {`, cssVarsFor(t.colors[altMode]), '}');
  const sp = (k, d = '1rem') => `  --space-${k}: ${t.spacing[k] || d};`;
  lines.push('', ':root {');
  lines.push(sp('xs', '0.25rem'));
  lines.push(sp('sm', '0.5rem'));
  lines.push(sp('md', '1rem'));
  lines.push(sp('lg', '1.5rem'));
  lines.push(sp('xl', '2.5rem'));
  lines.push(sp('2xl', '4rem'));
  const rd = (k, d) => `  --radius-${k}: ${t.radius[k] || d};`;
  lines.push(rd('sm', '0.5rem'), rd('md', '0.75rem'), rd('lg', '1rem'), rd('xl', '1.25rem'), rd('full', '9999px'));
  const sh = t.shadows || {};
  lines.push(`  --shadow-primary: ${sh.primary || '0 4px 24px -4px rgb(var(--c-primary) / 0.35)'};`);
  lines.push(`  --shadow-primary-lg: ${sh['primary-lg'] || '0 8px 40px -8px rgb(var(--c-primary) / 0.3)'};`);
  lines.push(`  --shadow-elevated: ${sh.elevated || '0 12px 48px -12px rgba(0, 0, 0, 0.5)'};`);
  const an = t.animations || {};
  lines.push(`  --ease-base: ${an.ease || 'cubic-bezier(0.25, 0.1, 0.25, 1)'};`);
  lines.push(`  --ease-spring: ${an.spring || 'cubic-bezier(0.34, 1.56, 0.64, 1)'};`);
  lines.push(`  --dur-fast: ${an.durationFast || '150ms'};`);
  lines.push(`  --dur-base: ${an.durationBase || '300ms'};`);
  lines.push(`  --dur-slow: ${an.durationSlow || '600ms'};`);
  const bt = t.buttons || {};
  lines.push(`  --btn-radius: ${bt.primary?.radius || '0.75rem'};`);
  lines.push(`  --btn-px: ${bt.primary?.paddingX || '1.5rem'};`);
  lines.push(`  --btn-py: ${bt.primary?.paddingY || '0.7rem'};`);
  const cr = t.cards || {};
  lines.push(`  --card-radius: ${cr.radius || '1rem'};`);
  lines.push(`  --card-padding: ${cr.padding || '1.5rem'};`);
  const ic = t.icons || {};
  lines.push(`  --icon-stroke: ${ic.strokeWidth || '1.8'};`);
  lines.push(`  --icon-sm: ${ic.sizeSm || '16px'};`);
  lines.push(`  --icon-md: ${ic.sizeMd || '24px'};`);
  lines.push(`  --icon-lg: ${ic.sizeLg || '36px'};`);
  const gr = t.gradients || {};
  lines.push(`  --grad-hero: ${gr.hero || 'linear-gradient(180deg, rgb(var(--c-base) / 0.92) 0%, rgb(var(--c-base) / 0.55) 45%, rgb(var(--c-base) / 0.92) 100%)'};`);
  lines.push(`  --grad-primary: ${gr.primaryFade || 'linear-gradient(135deg, rgb(var(--c-primary) / 0.25), rgb(var(--c-primary) / 0.05))'};`);
  lines.push('}');
  lines.push(`.theme-bootstrap { display: none; }`);
  return lines.join('\n');
}

export function themeBootstrapScript(t) {
  const key = JSON.stringify(t.storageKey || 'site-theme');
  return `(function(){try{var s=localStorage.getItem(${key});if(s==='light'||s==='dark')document.documentElement.setAttribute('data-theme',s);}catch(e){}})();`;
}

export function themeToggleScript(t) {
  const key = JSON.stringify(t.storageKey || 'site-theme');
  const alt = t.defaultMode === 'dark' ? 'light' : 'dark';
  return `function toggleSiteTheme(){var d=document.documentElement;var cur=d.getAttribute('data-theme')||${JSON.stringify(t.defaultMode)};var next=cur==='${alt}'?'${t.defaultMode}':'${alt}';d.setAttribute('data-theme',next);try{localStorage.setItem(${key},next)}catch(e){}var btn=document.querySelector('[data-theme-toggle]');if(btn){var label=next==='light'?'Dark mode':'Light mode';btn.setAttribute('aria-label',label);btn.title=label;}}`;
}
