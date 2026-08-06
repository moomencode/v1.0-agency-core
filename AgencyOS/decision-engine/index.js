import { DecisionEngine, createDecisionEngine, VERDICTS } from './engine.js';
import { computeEstimates, computeConfidence, computeRisk, computePriorities, pageCount, priorityTierOf } from './estimates.js';

export { DecisionEngine, createDecisionEngine, VERDICTS, computeEstimates, computeConfidence, computeRisk, computePriorities, pageCount, priorityTierOf };
export const DECISION_ENGINE_API_VERSION = '1.0';
