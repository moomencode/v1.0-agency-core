import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ValidationSystem } from './index.js';

const AGENCY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(AGENCY, '..');
const sys = new ValidationSystem();

let total = 0;
let failed = 0;
function check(label, valid, report = null) {
  total++;
  if (valid) console.log(`PASS ${label}`);
  else {
    failed++;
    console.log(`FAIL ${label}`);
    if (report) console.log(sys.reportMarkdown(report));
  }
}

for (const [kind, file] of [['theme-config', 'config/theme.json'], ['business-config', 'config/business.json']]) {
  const report = sys.validateFile(kind, path.join(REPO, file));
  check(`${file} (${report.summary.errors} errors)`, report.valid, report);
}

const agentDir = path.join(AGENCY, 'agents');
let agentsOk = 0;
for (const entry of fs.readdirSync(agentDir)) {
  const cfg = path.join(agentDir, entry, 'config.json');
  if (!fs.existsSync(cfg)) continue;
  const report = sys.validateConfig(fs.readFileSync(cfg, 'utf8'));
  if (report.valid) agentsOk++;
  else check(`agents/${entry}/config.json`, false, report);
}
check(`agent configs valid (${agentsOk})`, agentsOk >= 9);

const wfDir = path.join(AGENCY, 'workflows');
let wfOk = 0;
let wfTotal = 0;
for (const entry of fs.readdirSync(wfDir)) {
  for (const f of ['workflow.json', 'definition.json']) {
    const full = path.join(wfDir, entry, f);
    if (!fs.existsSync(full)) continue;
    wfTotal++;
    const report = sys.validateFile('json', full);
    if (report.valid) wfOk++;
  }
}
check(`workflow files valid (${wfOk}/${wfTotal})`, wfOk === wfTotal);

console.log('\n--- sample report: broken business config ---');
console.log(sys.reportMarkdown(sys.validateBusinessConfig({ name: 'X', type: 'spaceship', locale: 'fr', languages: ['en'], sections: [] })));

console.log(`\nDEMO: ${total - failed}/${total} valid (${failed} invalid)`);
