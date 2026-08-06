import { defineRule, RuleRegistry } from './index.js';
import { rulError, RUL_CODES } from './errors.js';

const PASS = [];
let n = 0;
function assert(cond, label, info = '') {
  n++;
  if (cond) { PASS.push(label); return; }
  throw new Error(`FAIL ${label} ${info}`);
}

assert(defineRule({ id: 'x', category: 'qualification', evaluate: () => ({ matched: true }) }).id === 'x', 'defineRule returns def');
let threw = false;
try { defineRule({ id: '', category: 'q', evaluate: () => 1 }); } catch (e) { threw = e.code === RUL_CODES.INVALID_RULE; }
assert(threw, 'defineRule rejects empty id');
threw = false;
try { defineRule({ id: 'y', category: 'q' }); } catch (e) { threw = e.code === RUL_CODES.INVALID_RULE; }
assert(threw, 'defineRule rejects missing evaluate');

const registry = new RuleRegistry({
  rules: [
    defineRule({ id: 'big-reviews', category: 'qualification', weight: 2, evaluate: (ctx) => ({ matched: ctx.reviews >= 100, score: ctx.reviews >= 100 ? 1 : 0, reason: `reviews=${ctx.reviews}` }) }),
    defineRule({ id: 'no-site', category: 'priority', weight: 3, evaluate: (ctx) => ({ matched: ctx.websiteStatus === 'none', score: 1, reason: 'no website' }) }),
    defineRule({ id: 'explode', category: 'qualification', evaluate: () => { throw new Error('boom'); } })
  ]
});

assert(registry.has('big-reviews'), 'registry has rule');
assert(!registry.has('nope'), 'registry missing rule');
assert(registry.list().length === 3, 'list all rules');
assert(registry.list({ category: 'qualification' }).length === 2, 'list by category');
assert(registry.categories().includes('qualification') && registry.categories().includes('priority'), 'categories()');
assert(registry.get('no-site').label === 'no-site', 'get returns def');
registry.unregister('explode');
assert(registry.list().length === 2, 'unregister removes rule');

const res = registry.run({ reviews: 250, websiteStatus: 'none' });
assert(res.length === 2, 'run evaluates all rules');
assert(res[0].matched === true && res[0].score === 1 && res[0].weight === 2, 'matched rule result');
const res2 = registry.run({ reviews: 5, websiteStatus: 'ok' });
assert(res2[0].matched === false && res2[0].score === 0, 'unmatched rule result');
assert(res2[1].matched === false, 'second unmatched');
assert(res2.every((r) => typeof r.reason === 'string'), 'reasons present');
threw = false;
try { registry.get('zzz'); } catch (e) { threw = e.code === RUL_CODES.UNKNOWN_RULE; }
assert(threw, 'get unknown throws UNKNOWN_RULE');
const boom = new RuleRegistry({ rules: [defineRule({ id: 'explode', category: 'q', evaluate: () => { throw new Error('boom'); } })] });
threw = false;
try { boom.run({}); } catch (e) { threw = e.code === RUL_CODES.EVAL_FAILED; }
assert(threw, 'run propagates eval failure as EVAL_FAILED');
const filtered = registry.run({ reviews: 250, websiteStatus: 'none' }, { category: 'priority' });
assert(filtered.length === 1 && filtered[0].ruleId === 'no-site', 'run filtered by category');

console.log(`=== RULES SMOKE: ${n} PASS, 0 FAIL ===`);
process.exit(0);
