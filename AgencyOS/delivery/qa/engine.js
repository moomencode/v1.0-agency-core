import { check, groupPassed } from './html.js';

export function runEngineGroup(site, validation) {
  const checks = [];
  if (!validation) {
    checks.push(check('engine-validation', false, ['engine validation report missing']));
  } else {
    checks.push(check(
      'engine-validation',
      validation.passed,
      validation.passed ? [] : [`${validation.totals.failed} failed checks`]
    ));
    for (const page of validation.pages || []) {
      checks.push(check(
        `page:${page.id}`,
        page.ok,
        page.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.errors.join('; ')}`)
      ));
    }
  }
  return { id: 'engine', checks, passed: groupPassed(checks) };
}
