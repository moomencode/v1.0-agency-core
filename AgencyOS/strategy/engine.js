import { strError, STR_CODES } from './errors.js';

function num(v, fallback = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function strategyScore(ctx) {
  const opportunity = num(ctx.scores && ctx.scores.opportunity, num(ctx.opportunity, 0));
  const roi = num(ctx.estimates && ctx.estimates.roi, num(ctx.roi, 0));
  const closing = num(ctx.estimates && ctx.estimates.closingProbability, num(ctx.closingProbability, 0));
  return Math.round((0.5 * opportunity + 0.3 * Math.min(100, roi * 40) + 0.2 * closing * 100) * 100) / 100;
}

export class StrategyEngine {
  constructor({ strategies = null } = {}) {
    this.strategies = strategies && Array.isArray(strategies) ? strategies : [];
    if (!this.strategies.length) throw strError(STR_CODES.INVALID_STRATEGY, 'strategy engine requires a strategy set');
    const ids = new Set();
    for (const s of this.strategies) {
      if (!s.id || typeof s.minScore !== 'number') throw strError(STR_CODES.INVALID_STRATEGY, `invalid strategy definition: ${JSON.stringify(s)}`);
      if (ids.has(s.id)) throw strError(STR_CODES.INVALID_STRATEGY, `duplicate strategy "${s.id}"`);
      ids.add(s.id);
    }
  }

  static fromJson(strategiesJson) {
    const parsed = typeof strategiesJson === 'string' ? JSON.parse(strategiesJson) : strategiesJson;
    if (!parsed || !Array.isArray(parsed.strategies)) throw strError(STR_CODES.INVALID_STRATEGY, 'strategy config must be { strategies: [...] }');
    return new StrategyEngine({ strategies: parsed.strategies });
  }

  list() {
    return this.strategies.map((s) => ({ id: s.id, label: s.label, minScore: s.minScore, planHint: s.planHint }));
  }

  get(id) {
    const s = this.strategies.find((x) => x.id === id);
    if (!s) throw strError(STR_CODES.INVALID_STRATEGY, `unknown strategy "${id}"`);
    return s;
  }

  select(ctx) {
    const score = strategyScore(ctx);
    const sorted = this.strategies.slice().sort((a, b) => b.minScore - a.minScore);
    const chosen = sorted.find((s) => score >= s.minScore);
    if (!chosen) throw strError(STR_CODES.NO_STRATEGY, `no strategy matches score ${score}`);
    return { id: chosen.id, label: chosen.label, score, planHint: chosen.planHint, params: chosen.params, note: chosen.note };
  }

  withStrategies(strategies) {
    return new StrategyEngine({ strategies: [...this.strategies, ...strategies] });
  }
}

export function createStrategyEngine(opts) {
  return new StrategyEngine(opts);
}
