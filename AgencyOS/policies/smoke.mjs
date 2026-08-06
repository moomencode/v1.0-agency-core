import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PolicyEngine, createPolicyEngine } from './index.js';
import { polError, POL_CODES } from './errors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const PASS = [];
let n = 0;
function assert(cond, label, info = '') {
  n++;
  if (cond) { PASS.push(label); return; }
  throw new Error(`FAIL ${label} ${info}`);
}

const defaults = JSON.parse(fs.readFileSync(path.join(ROOT, 'defaults.json'), 'utf8'));
const engine = PolicyEngine.fromJson(defaults);
assert(engine.list().length === 8, 'default policy set has 8 policies');
assert(engine.get('minOpportunity').value === 50, 'min opportunity default 50');
assert(engine.get('maxBuildCost').value === 25000, 'max build cost default 25000');
assert(engine.get('minClosingProbability').value === 0.35, 'min closing probability 0.35');
assert(engine.list().every((p) => typeof p.mandatory === 'boolean'), 'mandatory flag everywhere');

const strong = {
  scores: { opportunity: 82, reviews: 300 },
  flags: { premiumWebsite: false, closed: false, duplicate: false, missingContact: false },
  estimates: { devCost: 1800, closingProbability: 0.72 }
};
const res = engine.evaluate(strong);
assert(res.verdict === 'pass', 'strong business passes all policies');
assert(res.passed === 8 && res.failed === 0, '8/8 policies passed');
assert(res.mandatoryFailed === 0, 'no mandatory failures');

const weak = { scores: { opportunity: 12, reviews: 3 }, flags: { premiumWebsite: true, closed: false, duplicate: false, missingContact: true }, estimates: { devCost: 30000, closingProbability: 0.1 } };
const res2 = engine.evaluate(weak);
assert(res2.verdict === 'fail', 'weak business fails policies');
assert(res2.failed === 6, '6 of 8 fail', JSON.stringify(res2.results.map((r) => r.id)));
assert(res2.mandatoryFailed === 4, 'mandatory failures counted');
const mid = { scores: { opportunity: 55, reviews: 40 }, flags: { premiumWebsite: false, closed: true, duplicate: false, missingContact: false }, estimates: { devCost: 1500, closingProbability: 0.4 } };
const res3 = engine.evaluate(mid);
assert(res3.verdict === 'fail', 'closed business rejected');
assert(res3.results.find((r) => r.id === 'ignoreClosedBusinesses').passed === false, 'closed flag rejected');

const summarize = engine.summarize(res2);
assert(summarize.verdict === 'fail' && summarize.reasons.length === 6, 'summary lists all reasons');
const sumPass = engine.summarize(res);
assert(sumPass.summary === 'all policies satisfied', 'summary passes clean');

const missingData = { scores: { opportunity: 60, reviews: 5 }, flags: { premiumWebsite: false, closed: false, duplicate: false, missingContact: false }, estimates: { closingProbability: 0.4 } };
const res4 = engine.evaluate(missingData);
assert(res4.results.find((r) => r.id === 'maxBuildCost').passed === true, 'missing estimate skips non-mandatory threshold');

const edited = engine.applyOverrides([{ id: 'minOpportunity', value: 70 }, { id: 'requireContact', mandatory: false }]);
assert(edited === engine, 'applyOverrides returns engine');
assert(engine.get('minOpportunity').value === 70, 'override changes value without code');
assert(engine.get('requireContact').mandatory === false, 'override changes mandatory');
assert(engine.evaluate({ ...strong, scores: { opportunity: 65, reviews: 300 } }).verdict === 'fail', 'higher threshold enforced');

let threw = false;
try { engine.applyOverrides([{ id: 'nope' }]); } catch (e) { threw = e.code === POL_CODES.UNKNOWN_POLICY; }
assert(threw, 'override unknown policy throws UNKNOWN_POLICY');
threw = false;
try { engine.get('nope'); } catch (e) { threw = e.code === POL_CODES.UNKNOWN_POLICY; }
assert(threw, 'get unknown throws UNKNOWN_POLICY');
threw = false;
try { new PolicyEngine(); } catch (e) { threw = e.code === POL_CODES.INVALID_POLICY; }
assert(threw, 'empty engine throws INVALID_POLICY');

const custom = createPolicyEngine({ policies: [{ id: 'only', kind: 'threshold', field: 'scores.opportunity', op: 'gte', value: 60, mandatory: true }] });
assert(custom.evaluate({ scores: { opportunity: 59 } }).verdict === 'fail', 'custom single policy');
assert(custom.evaluate({ scores: { opportunity: 61 } }).verdict === 'pass', 'custom single policy pass');

console.log(`=== POLICIES SMOKE: ${n} PASS, 0 FAIL ===`);
process.exit(0);
