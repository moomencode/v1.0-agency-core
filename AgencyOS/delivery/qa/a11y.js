import { contrastRatio } from '../../website-engine/theme/tokens.js';
import { parseHtml, check, groupPassed } from './html.js';

export function runA11yGroup(files, site) {
  const checks = [];
  const modes = site?.theme?.colors || {};
  for (const mode of Object.keys(modes)) {
    const colors = modes[mode];
    if (!colors) continue;
    const inkBase = contrastRatio(colors.ink, colors.base);
    checks.push(check(
      `a11y:contrast:${mode}:ink-base`,
      inkBase !== null && inkBase >= 4.5,
      [`${mode} ink/base contrast ${inkBase} < 4.5 (WCAG AA)`]
    ));
  }

  const htmlPages = Object.keys(files).filter((p) => p.endsWith('.html')).sort();
  for (const page of htmlPages) {
    const doc = parseHtml(files[page]);
    checks.push(check(
      `a11y:alt:${page}`,
      doc.imgsWithoutAlt === 0,
      [`${doc.imgsWithoutAlt} <img> without alt attribute`]
    ));
    const missing = ['header', 'main', 'nav', 'footer'].filter((l) => !doc.hasLandmarks[l]);
    checks.push(check(`a11y:landmarks:${page}`, missing.length === 0, [`missing landmarks: ${missing.join(', ')}`]));
  }

  return { id: 'a11y', checks, passed: groupPassed(checks) };
}
