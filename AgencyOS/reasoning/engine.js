import { rsnError, RSN_CODES } from './errors.js';

const VERDICT_LINES = {
  APPROVE: 'Approved for outreach: all qualification rules met, risk accepted, policies satisfied.',
  REJECT: 'Rejected: a mandatory policy failed and cannot be overridden.',
  ESCALATE: 'Escalated to human review: risk signals exceed the automated tolerance.',
  PARK: 'Parked: insufficient data to qualify; revisit after more signals arrive.'
};

export class ReasoningEngine {
  chain(decision, context) {
    const ctx = context || {};
    const dec = decision || {};
    const est = dec.estimates || {};
    const risk = dec.risk || { level: 'unknown', reason: 'no risk computed' };
    const matched = (dec.ruleResults || []).filter((r) => r.matched);
    const steps = [];

    steps.push({
      step: 'context',
      label: 'Context assembled',
      evidence: {
        businessId: dec.businessId,
        opportunity: (ctx.scores || {}).opportunity ?? (dec.priority || {}).opportunity?.value,
        sourceCount: ctx.sourceCount,
        websiteStatus: (ctx.presence || {}).websiteStatus
      },
      contribution: 'input data prepared for estimation'
    });

    steps.push({
      step: 'estimation',
      label: 'Financial estimates computed',
      evidence: { websiteValue: est.websiteValue, devCost: est.devCost, salesValue: est.salesValue, roi: est.roi, closingProbability: est.closingProbability },
      contribution: 'quantifies the deal: value, cost, margin'
    });

    steps.push({
      step: 'confidence',
      label: 'Confidence scored',
      evidence: { confidence: dec.confidence },
      contribution: 'how reliable the estimates are'
    });

    steps.push({
      step: 'risk',
      label: 'Risk assessed',
      evidence: { level: risk.level, reason: risk.reason },
      contribution: 'blocks automation when signals are severe'
    });

    steps.push({
      step: 'rules',
      label: `${matched.length} qualification rule(s) matched`,
      evidence: matched.map((r) => ({ id: r.ruleId, label: r.label, score: r.score, reason: r.reason })),
      contribution: 'objective evidence for or against proceeding'
    });

    if (dec.policySummary) {
      steps.push({
        step: 'policy',
        label: `Policy gate: ${dec.policySummary.verdict}`,
        evidence: { mandatoryFailed: dec.policySummary.mandatoryFailed, summary: dec.policySummary.summary },
        contribution: 'mandatory guardrails checked'
      });
    }

    steps.push({
      step: 'verdict',
      label: `Verdict: ${dec.verdict}`,
      evidence: { qualificationScore: dec.qualificationScore, confidence: dec.confidence, risk: risk.level },
      contribution: VERDICT_LINES[dec.verdict] || `Final verdict ${dec.verdict}`
    });

    return steps;
  }

  trace(decision, context) {
    if (!decision || !decision.businessId) throw rsnError(RSN_CODES.MISSING_DECISION, 'trace requires a decision with businessId');
    if (!context || !context.businessId) throw rsnError(RSN_CODES.MISSING_CONTEXT, 'trace requires a context with businessId');
    const chain = this.chain(decision, context);
    const dec = decision;
    const est = dec.estimates || {};
    const risk = dec.risk || {};
    const matched = (dec.ruleResults || []).filter((r) => r.matched).map((r) => r.ruleId);
    const topRule = matched.length ? matched[0] : null;

    const rationale = (() => {
      switch (dec.verdict) {
        case 'REJECT': {
          const p = dec.policySummary || {};
          return `Rejected because ${p.mandatoryFailed} mandatory polic${p.mandatoryFailed === 1 ? 'y' : 'ies'} failed: ${p.summary || 'see policy results'}.`;
        }
        case 'ESCALATE':
          return `Escalated because risk is ${risk.level}: ${risk.reason}.`;
        case 'PARK':
          return `Parked because no-data rule matched: no reviews, no rating and missing contact. Revisit when new signals arrive.`;
        default:
          return `Approved: ${matched.length} rule(s) supported the decision (${matched.join(', ') || 'no rules'}), estimated ROI ${est.roi}, closing probability ${est.closingProbability}, risk ${risk.level}.`;
      }
    })();

    return {
      decisionId: dec.decisionId,
      businessId: dec.businessId,
      verdict: dec.verdict,
      headline: `Business ${dec.businessId} ${dec.verdict === 'APPROVE' ? 'approved' : dec.verdict === 'REJECT' ? 'rejected' : dec.verdict === 'ESCALATE' ? 'escalated' : 'parked'} (opportunity ${(dec.priority && dec.priority.opportunity && dec.priority.opportunity.value) ?? 'n/a'}, risk ${risk.level})`,
      influences: {
        estimation: { websiteValue: est.websiteValue, roi: est.roi, salesValue: est.salesValue, closingProbability: est.closingProbability },
        rule: matched,
        policy: dec.policySummary ? { verdict: dec.policySummary.verdict, mandatoryFailed: dec.policySummary.mandatoryFailed } : null,
        confidence: dec.confidence,
        risk: risk.level,
        topRule
      },
      rationale,
      chain
    };
  }

  explain(decision, context) {
    const t = this.trace(decision, context);
    const lines = [t.headline, t.rationale];
    for (const step of t.chain) {
      lines.push(`- ${step.step}: ${step.label} (${step.contribution})`);
    }
    return lines.join('\n');
  }
}

export function createReasoningEngine() {
  return new ReasoningEngine();
}
