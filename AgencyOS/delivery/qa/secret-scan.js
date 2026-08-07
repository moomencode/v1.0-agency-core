import { scanFiles } from '../security/scan.js';
import { check, groupPassed } from './html.js';

export function runSecretScanGroup(files) {
  const results = scanFiles(files);
  const checks = results.map((r) =>
    check(
      `secrets:${r.path}`,
      false,
      r.matches.slice(0, 5).map((m) => `potential secret (${m.type}) found`)
    )
  );
  if (results.length === 0) {
    checks.push(check('secrets:scan', true, []));
  }
  return { id: 'secrets', checks, passed: groupPassed(checks), matches: results };
}
