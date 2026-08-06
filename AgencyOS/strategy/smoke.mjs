import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StrategyEngine, strategyScore } from './index.js';
import { strError, STR_CODES } from './errors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const PASS = [];
let n = 0;
function assert(cond, label, info = '') {
  n++;
  if (cond) { PASS.push(label); return; }
  throw new Error(`FAIL ${label} ${info}`);
}

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'strategies', 'default.json'), 'utf8'));
const engine = StrategyEngine.fromJson(config);
assert(engine.list().length === 3, 'three strategies');
assert(engine.list()[0].id === 'premium' && engine.list()[0].minScore === 70, 'premium threshold 70');
assert(engine.get('light').planHint === 'light', 'get strategy');

const premiumCtx = { scores: { opportunity: 85 }, estimates: { roi: 2.5, closingProbability: 0.7 } };
const sel = engine.select(premiumCtx);
assert(sel.id === 'premium' && sel.planHint === 'premium', 'premium selection');
assert(sel.score > 70, 'premium score computed');

const standardCtx = { scores: { opportunity: 60 }, estimates: { roi: 1.2, closingProbability: 0.45 } };
const sel2 = engine.select(standardCtx);
assert(sel2.id === 'standard', 'standard selection');
assert(sel2.score >= 45 && sel2.score < 70, 'standard range');

const lightCtx = { scores: { opportunity: 30 }, estimates: { roi: 0.4, closingProbability: 0.2 } };
const sel3 = engine.select(lightCtx);
assert(sel3.id === 'light', 'light selection');

const boundary = engine.select({ scores: { opportunity: 46 }, estimates: { roi: 1, closingProbability: 0.5 } });
assert(boundary.id === 'standard', 'boundary 46 -> standard');

const score = strategyScore({ scores: { opportunity: 50 }, estimates: { roi: 1, closingProbability: 0.5 } });
assert(Math.abs(score - 47) < 0.01, 'strategyScore formula', String(score));
assert(strategyScore({}) === 0, 'strategyScore zero default');

const custom = new StrategyEngine({ strategies: [{ id: 'vip', minScore: 90, planHint: 'vip' }, { id: 'basic', minScore: 0, planHint: 'basic' }] });
assert(custom.select({ scores: { opportunity: 95 }, estimates: { roi: 3, closingProbability: 0.95 } }).id === 'vip', 'custom strategies');
assert(custom.select({ scores: { opportunity: 5 }, estimates: {} }).id === 'basic', 'custom fallback');

let threw = false;
try { new StrategyEngine(); } catch (e) { threw = e.code === STR_CODES.INVALID_STRATEGY; }
assert(threw, 'empty engine throws');
threw = false;
try { engine.get('nope'); } catch (e) { threw = e.code === STR_CODES.INVALID_STRATEGY; }
assert(threw, 'unknown strategy throws');
threw = false;
try { new StrategyEngine({ strategies: [{ id: 'a', minScore: 5 }, { id: 'a', minScore: 9 }] }); } catch (e) { threw = e.code === STR_CODES.INVALID_STRATEGY; }
assert(threw, 'duplicate ids rejected');
const negative = new StrategyEngine({ strategies: [{ id: 'x', minScore: -5, planHint: 'x' }] });
assert(negative.select({ scores: { opportunity: 0 }, estimates: {} }).id === 'x', 'negative threshold matches any');

const combined = engine.withStrategies([{ id: 'ultra', minScore: 95, planHint: 'ultra' }]);
assert(combined.list().length === 4, 'withStrategies extends');
assert(combined.select({ scores: { opportunity: 97 }, estimates: { roi: 3, closingProbability: 0.95 } }).id === 'ultra', 'extended strategy selected');

console.log(`=== STRATEGY SMOKE: ${n} PASS, 0 FAIL ===`);
process.exit(0);
