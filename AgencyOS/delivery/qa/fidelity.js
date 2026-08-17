import { parseHtml, check, groupPassed } from './html.js';

const PLACEHOLDER_RE = /\{[a-z][a-z0-9-]*\}/g;

export function runFidelityGroup(files) {
  const checks = [];
  const htmlPages = Object.keys(files)
    .filter((p) => p.endsWith('.html'))
    .sort();

  if (htmlPages.length === 0) {
    checks.push(check('fidelity:pages', false, ['no html pages in production tree']));
  } else {
    for (const page of htmlPages) {
      const content = String(files[page]);
      const body = content.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
      const leaks = [...new Set(body.match(PLACEHOLDER_RE) || [])];
      checks.push(check(`fidelity:placeholder:${page}`, leaks.length === 0, [`literal placeholder(s) leaked into delivered page: ${leaks.join(', ')}`]));
    }
  }

  return { id: 'fidelity', checks, passed: groupPassed(checks) };
}