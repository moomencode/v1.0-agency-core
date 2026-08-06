import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ValidationSystem } from './index.js';
import { VAL_CODES } from './errors.js';
import { sha256 } from './rules.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_ROOT = path.resolve('storage', 'validation-smoke');
fs.rmSync(TEST_ROOT, { recursive: true, force: true });
fs.mkdirSync(path.join(TEST_ROOT, 'assets'), { recursive: true });

let passed = 0;
let failed = 0;
const failures = [];
function assert(cond, label, extra = '') {
  if (cond) { passed++; console.log(`PASS ${label}`); }
  else { failed++; failures.push(`${label} ${extra}`); console.log(`FAIL ${label} ${extra}`); }
}

const sys = new ValidationSystem({ root: TEST_ROOT, schemasDir: path.join(REPO, 'schemas') });
const realSys = new ValidationSystem();

const PALETTE = { base: '11 28 21', 'base-deep': '8 20 16', surface: '18 42 32', 'surface-2': '27 58 44', 'surface-3': '37 74 57', primary: '212 175 55', 'primary-light': '230 200 102', 'primary-dark': '169 134 42', ink: '244 239 230', 'ink-muted': '207 199 184' };

function makeTheme(overrides = {}, topOverrides = {}, omit = {}) {
  const lightBase = { ...PALETTE, primary: '178 136 26', 'primary-light': '224 181 74', 'primary-dark': '138 102 20', ink: '11 28 21', 'ink-muted': '74 80 73' };
  const dark = { ...PALETTE, ...(overrides.dark || {}) };
  const light = { ...lightBase, ...(overrides.light || {}) };
  for (const k of omit.light || []) delete light[k];
  for (const k of omit.dark || []) delete dark[k];
  return {
    name: 'garcia',
    defaultMode: 'dark',
    storageKey: 'site-theme',
    colors: { dark, light },
    typography: { display: "'Playfair Display', serif", body: "'Poppins', sans-serif", fontsUrl: 'https://fonts.example.com/css' },
    ...topOverrides
  };
}

const VALID_BUSINESS = { name: 'Garcia Restaurant & Cafe', type: 'restaurant', locale: 'en', languages: ['en', 'ar'], currency: { code: 'EGP', symbol: 'EGP', position: 'after', decimals: 0 }, phoneDigits: 11, sections: ['navbar', 'hero', 'menu', 'footer'] };
const VALID_DOSSIER = { businessId: 'b1', leadId: 'l1', name: 'Garcia', type: 'restaurant', location: { city: 'Cairo' }, sections: {}, confidence: {}, researchSummary: 'ok' };

const assetRel = path.join('assets', 'logo.png');
const assetBytes = Buffer.from('fake-png-bytes-123456');
fs.writeFileSync(path.join(TEST_ROOT, assetRel), assetBytes);
const assetChecksum = sha256(assetBytes);

const has = (report, code) => report.findings.some((f) => f.code === code);
const codesOf = (report) => report.findings.map((f) => f.code);

// ---- kind registry ----
const kinds = sys.kinds();
assert(kinds.length >= 9 && ['json', 'schema', 'config', 'business-config', 'theme-config', 'workflow-output', 'agent-output', 'prompt-output', 'asset'].every((k) => kinds.includes(k)), 'kind registry exposes all nine kinds');

// ---- theme configs ----
const goodTheme = sys.validateThemeConfig(makeTheme());
assert(goodTheme.valid === true, 'valid theme passes');

const missingToken = sys.validateThemeConfig(makeTheme({}, {}, { light: ['primary-light'] }));
assert(missingToken.valid === false && has(missingToken, VAL_CODES.MISSING_FIELD) && missingToken.findings.some((f) => f.path === '$.colors.light.primary-light'), 'theme missing palette token detected');

const badTriplet = sys.validateThemeConfig(makeTheme({ dark: { primary: '212 175' } }));
assert(has(badTriplet, VAL_CODES.THEME_INVALID) && badTriplet.findings.some((f) => f.path === '$.colors.dark.primary'), 'theme malformed triplet detected');

const outOfRange = sys.validateThemeConfig(makeTheme({ dark: { primary: '300 0 0' } }));
assert(has(outOfRange, VAL_CODES.THEME_INVALID) && outOfRange.summary.errors === 1, 'theme out-of-range channel detected');

const badMode = sys.validateThemeConfig(makeTheme({}, { defaultMode: 'sepia' }));
assert(has(badMode, VAL_CODES.THEME_INVALID) && badMode.findings.some((f) => f.path === '$.defaultMode'), 'theme defaultMode without colors mode detected');

const noTypo = sys.validateThemeConfig(makeTheme({}, { typography: { display: 'x' } }));
assert(has(noTypo, VAL_CODES.MISSING_FIELD) && noTypo.findings.some((f) => f.path === '$.typography.body'), 'theme missing typography field detected');

assert(missingToken.summary.errors === 1 && missingToken.summary.total === 1 && missingToken.checks.some((c) => c.id === 'theme-rules' && !c.passed), 'theme report counts and checks accurate');

// ---- business configs ----
const goodBiz = sys.validateBusinessConfig(VALID_BUSINESS);
assert(goodBiz.valid === true, 'valid business config passes');

const badLocale = sys.validateBusinessConfig({ ...VALID_BUSINESS, locale: 'fr' });
assert(has(badLocale, VAL_CODES.BUSINESS_INVALID) && badLocale.findings.some((f) => f.path === '$.locale'), 'business locale not in languages detected');

const badType = sys.validateBusinessConfig({ ...VALID_BUSINESS, type: 'spaceship' });
assert(has(badType, VAL_CODES.BUSINESS_INVALID) && badType.findings.some((f) => f.path === '$.type'), 'business unknown type detected');

const noName = sys.validateBusinessConfig({ ...VALID_BUSINESS, name: undefined });
assert(has(noName, VAL_CODES.MISSING_FIELD) && noName.findings.some((f) => f.path === '$.name'), 'business missing name detected');

const emptySections = sys.validateBusinessConfig({ ...VALID_BUSINESS, sections: [] });
assert(has(emptySections, VAL_CODES.BUSINESS_INVALID) && emptySections.findings.some((f) => f.path === '$.sections'), 'business empty sections detected');

const badCurrency = sys.validateBusinessConfig({ ...VALID_BUSINESS, currency: { code: 'EGP', symbol: 'EGP', position: 'inline', decimals: 0 } });
assert(has(badCurrency, VAL_CODES.BUSINESS_INVALID), 'business bad currency position detected');

// ---- JSON ----
const jsonOk = sys.validateJson('{"name":"garcia","sections":["hero"]}');
assert(jsonOk.valid === true && jsonOk.value.name === 'garcia', 'valid JSON parses with value attached');

const jsonBad = sys.validateJson('{"name": "garcia",}');
assert(has(jsonBad, VAL_CODES.JSON_INVALID), 'malformed JSON detected');

const jsonGarbage = sys.validateJson('{"a":1} trailing');
assert(has(jsonGarbage, VAL_CODES.JSON_INVALID), 'trailing garbage detected');

const jsonDup = sys.validateJson('{"a":1,"a":2}');
assert(has(jsonDup, VAL_CODES.DUPLICATE_KEY) && jsonDup.findings.some((f) => f.path === '$.a'), 'duplicate JSON key detected');

const jsonDupNested = sys.validateJson('{"a":{"x":1,"x":2}}');
assert(jsonDupNested.findings.some((f) => f.path === '$.a.x'), 'nested duplicate JSON key detected');

const emptyPayload = sys.validateConfig(null);
assert(has(emptyPayload, VAL_CODES.EMPTY), 'empty payload detected');

// ---- schemas ----
const schemaGood = sys.validateSchema(VALID_DOSSIER, path.join(REPO, 'schemas', 'business.schema.json'));
assert(schemaGood.valid === true, 'dossier matches business schema');

const schemaBad = sys.validateSchema((({ researchSummary, ...rest }) => rest)({ ...VALID_DOSSIER, foo: 'bar' }), path.join(REPO, 'schemas', 'business.schema.json'));
const badPaths = schemaBad.findings.map((f) => f.path);
assert(schemaBad.valid === false && badPaths.includes('$.researchSummary') && badPaths.includes('$.foo') && has(schemaBad, VAL_CODES.SCHEMA_MISMATCH), 'missing required + additional property detected via schema');

const schemaTitle = sys.validateSchema(VALID_DOSSIER, null, { schemaTitle: 'BusinessDossier' });
assert(schemaTitle.valid === true, 'canonical schema resolved by title');

const schemaNone = sys.validateSchema(VALID_DOSSIER, null, {});
assert(schemaNone.valid === true && has(schemaNone, VAL_CODES.SCHEMA_MISSING), 'schema kind without schema warns only');

// ---- duplicate IDs ----
const dupIds = sys.validateConfig({ services: [{ id: 's1', name: 'A' }, { id: 's1', name: 'B' }, { id: 's2', name: 'C' }] });
assert(has(dupIds, VAL_CODES.DUPLICATE_ID) && dupIds.findings.some((f) => f.ref === 's1'), 'duplicate IDs in config detected');

// ---- broken references ----
const brokenAgent = sys.validateConfig({ agentId: 'ghost-agent' }, { baseDir: REPO });
assert(has(brokenAgent, VAL_CODES.BROKEN_REF) && brokenAgent.findings.some((f) => f.path === '$.agentId'), 'broken agent reference detected');

const okAgent = sys.validateConfig({ agentId: 'lead-hunter' }, { baseDir: REPO });
assert(okAgent.valid === true, 'existing agent reference resolves');

const brokenDoc = sys.validateConfig({ documents: [{ id: 'd1', sourceDocument: 'ghost' }] });
assert(has(brokenDoc, VAL_CODES.BROKEN_REF), 'broken sourceDocument reference detected');

// ---- required fields option ----
const required = sys.validateConfig({ type: 'restaurant' }, { required: ['name', 'sections', 'currency.code'] });
assert(has(required, VAL_CODES.MISSING_FIELD) && required.summary.errors === 3, 'explicit required fields enforced');

// ---- assets ----
const assetGood = sys.validateAsset({ path: assetRel, checksum: assetChecksum, format: 'png' }, { baseDir: TEST_ROOT });
assert(assetGood.valid === true, 'valid asset passes');

const assetMissing = sys.validateAsset({ path: 'assets/nope.png' }, { baseDir: TEST_ROOT });
assert(has(assetMissing, VAL_CODES.ASSET_MISSING), 'missing asset file detected');

const assetChecksumBad = sys.validateAsset({ path: assetRel, checksum: '0'.repeat(64) }, { baseDir: TEST_ROOT });
assert(has(assetChecksumBad, VAL_CODES.ASSET_CHECKSUM), 'asset checksum mismatch detected');

const assetMime = sys.validateAsset({ path: assetRel, format: 'pdf' }, { baseDir: TEST_ROOT });
assert(has(assetMime, VAL_CODES.ASSET_MIME), 'asset format/extension mismatch detected');

const assetPlaceholder = sys.validateAsset({ path: 'assets/photo-not-ready.jpg', isPlaceholder: true }, { baseDir: TEST_ROOT });
assert(assetPlaceholder.valid === true && assetPlaceholder.summary.infos === 1, 'placeholder asset is informational');

const assetArray = sys.validateAsset([{ path: assetRel }, { path: assetRel }], { baseDir: TEST_ROOT });
assert(assetArray.valid === true, 'asset array form accepted');

const bizWithAssets = sys.validateBusinessConfig({ ...VALID_BUSINESS, assets: [{ path: assetRel, checksum: assetChecksum }] }, { assetsPath: 'assets' });
assert(bizWithAssets.valid === true, 'asset manifest in business config validates');

const bizWithBrokenAsset = sys.validateBusinessConfig({ ...VALID_BUSINESS, assets: [{ path: 'assets/gone.png' }] }, { assetsPath: 'assets' });
assert(has(bizWithBrokenAsset, VAL_CODES.ASSET_MISSING), 'broken asset in business config detected');

const noAssetsList = sys.validateBusinessConfig(VALID_BUSINESS, { assetsPath: 'assetManifest' });
assert(has(noAssetsList, VAL_CODES.MISSING_FIELD), 'missing asset list path detected');

// ---- workflow outputs ----
const wfGood = sys.validateWorkflowOutput({ runId: 'run-1', workflowId: 'qa', documents: { 'doc-1': { id: 'doc-1', schema: 'BusinessDossier', ...VALID_DOSSIER }, 'doc-2': { id: 'doc-2', sourceDocument: 'doc-1' } } });
assert(wfGood.valid === true, 'valid workflow output passes');

const wfNoId = sys.validateWorkflowOutput({ documents: { 'doc-1': { content: 'x' } } });
assert(has(wfNoId, VAL_CODES.MISSING_FIELD) && wfNoId.findings.some((f) => f.path === '$.documents.doc-1.id'), 'document missing id detected');

const wfBadDoc = sys.validateWorkflowOutput({ documents: { 'doc-1': { id: 'doc-1', schema: 'BusinessDossier' } } });
assert(has(wfBadDoc, VAL_CODES.SCHEMA_MISMATCH) && wfBadDoc.findings.some((f) => f.path.startsWith('$.documents.doc-1')), 'document schema mismatch detected');

const wfBadSchemaRef = sys.validateWorkflowOutput({ documents: { 'doc-1': { id: 'doc-1', schema: 'NopeSchema' } } });
assert(has(wfBadSchemaRef, VAL_CODES.BROKEN_REF), 'broken document schema reference detected');

const wfBrokenSource = sys.validateWorkflowOutput({ documents: { 'doc-1': { id: 'doc-1', sourceDocument: 'ghost' } } });
assert(has(wfBrokenSource, VAL_CODES.BROKEN_REF) && wfBrokenSource.findings.some((f) => f.path === '$.documents.doc-1.sourceDocument'), 'broken cross-document reference detected');

const wfDupIds = sys.validateWorkflowOutput({ documents: [{ id: 'd1' }, { id: 'd1' }] });
assert(has(wfDupIds, VAL_CODES.DUPLICATE_ID), 'duplicate document IDs detected');

// ---- prompt outputs ----
const promptGood = sys.validatePromptOutput({ content: 'Hello', model: 'fast', usage: { promptTokens: 10, completionTokens: 5 } });
assert(promptGood.valid === true, 'valid prompt output passes');

const promptNoContent = sys.validatePromptOutput({ model: 'fast' });
assert(has(promptNoContent, VAL_CODES.MISSING_FIELD) && promptNoContent.findings.some((f) => f.path === '$.content'), 'prompt output missing content detected');

const promptPlain = sys.validatePromptOutput('plain text answer');
assert(promptPlain.valid === true && promptPlain.summary.infos === 1, 'plain-text prompt output accepted');

const promptBadUsage = sys.validatePromptOutput({ content: 'x', model: 'm', usage: 'nope' });
assert(has(promptBadUsage, VAL_CODES.PROMPT_INVALID) && promptBadUsage.findings.some((f) => f.path === '$.usage'), 'invalid usage shape detected');

// ---- agent outputs ----
const agentSchema = { type: 'object', required: ['output'], additionalProperties: false, properties: { id: { type: 'string' }, output: { type: 'string' } } };
const agentGood = sys.validateAgentOutput({ id: 'a1', output: 'ok' }, { schema: agentSchema });
assert(agentGood.valid === true, 'agent output matches inline schema');

const agentBad = sys.validateAgentOutput({ id: 'a1', output: 5 }, { schema: agentSchema });
assert(has(agentBad, VAL_CODES.SCHEMA_MISMATCH) && agentBad.findings.some((f) => f.path === '$.output'), 'agent output schema mismatch detected');

// ---- reports ----
const reportShape = sys.validateThemeConfig(makeTheme({}, {}, { light: ['primary-light'] }));
assert(reportShape.summary.errors === 1 && reportShape.summary.total === 1 && reportShape.valid === false && Array.isArray(reportShape.checks) && reportShape.checks.length >= 3, 'report shape: summary, checks, validity');

const md = sys.reportMarkdown(reportShape);
assert(md.includes('# Validation Report') && md.includes('[ERROR]') && md.includes('$.colors.light.primary-light') && md.includes('INVALID'), 'markdown report renders findings');

try {
  sys.validate('nope-kind', {});
  assert(false, 'unknown kind rejected');
} catch (e) {
  assert(e.code === 'E_VAL_UNKNOWN_KIND', 'unknown kind rejected', `got ${e.code}`);
}

// ---- real project configs ----
const realTheme = realSys.validateFile('theme-config', path.resolve(REPO, '..', 'config', 'theme.json'));
assert(realTheme.valid === true, 'real theme.json is valid', codesOf(realTheme).join(','));

const realBiz = realSys.validateFile('business-config', path.resolve(REPO, '..', 'config', 'business.json'));
assert(realBiz.valid === true, 'real business.json is valid', codesOf(realBiz).join(','));

// ---- stats ----
assert(sys.stats.validations >= 40 && sys.stats.failures >= 12, 'validation stats accumulate');

console.log(`\n=== VALIDATION SMOKE: ${passed} PASS, ${failed} FAIL ===`);
if (failures.length) console.log('failures:', failures.join(' | '));
process.exit(failed === 0 ? 0 : 1);
