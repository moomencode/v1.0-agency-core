import { defineRule } from '../../rules/index.js';

export const QUALIFICATION_RULES = [
  defineRule({
    id: 'strong-demand',
    category: 'qualification',
    weight: 3,
    label: 'Strong market demand',
    evaluate: (ctx) => ({
      matched: (ctx.scores && ctx.scores.opportunity) >= 70,
      score: Math.min(1, ((ctx.scores && ctx.scores.opportunity) || 0) / 100),
      reason: `opportunity ${ctx.scores && ctx.scores.opportunity} (demand signal)`
    })
  }),
  defineRule({
    id: 'high-value',
    category: 'qualification',
    weight: 2,
    label: 'High estimated sales value',
    evaluate: (ctx) => ({
      matched: (ctx.estimates && ctx.estimates.salesValue) >= 3500,
      score: Math.min(1, ((ctx.estimates && ctx.estimates.salesValue) || 0) / 6000),
      reason: `estimated sales value $${ctx.estimates && ctx.estimates.salesValue}`
    })
  }),
  defineRule({
    id: 'profitable',
    category: 'qualification',
    weight: 2,
    label: 'Profitable engagement',
    evaluate: (ctx) => ({
      matched: (ctx.estimates && ctx.estimates.roi) >= 1,
      score: Math.min(1, ((ctx.estimates && ctx.estimates.roi) || 0) / 3),
      reason: `estimated ROI ${ctx.estimates && ctx.estimates.roi}`
    })
  }),
  defineRule({
    id: 'weak-brand',
    category: 'qualification',
    weight: 1.5,
    label: 'Weak branding needs upgrade',
    evaluate: (ctx) => ({
      matched: (ctx.scores && ctx.scores.brandQuality) < 0.4,
      score: 1 - Math.min(1, (ctx.scores && ctx.scores.brandQuality) || 0),
      reason: `brand quality ${ctx.scores && ctx.scores.brandQuality}`
    })
  }),
  defineRule({
    id: 'no-data',
    category: 'qualification',
    weight: 1,
    label: 'Insufficient data',
    evaluate: (ctx) => ({
      matched: !(ctx.scores && ctx.scores.reviews) && !(ctx.scores && ctx.scores.rating) && (ctx.presence && ctx.presence.missingContact),
      reason: 'no reviews, no rating and no contact information'
    })
  })
];

export const RISK_RULES = [
  defineRule({
    id: 'risk-high',
    category: 'risk',
    weight: 1,
    label: 'High risk',
    evaluate: (ctx) => ({
      matched: ctx.risk && ctx.risk.level === 'high',
      reason: ctx.risk && ctx.risk.reason
    })
  }),
  defineRule({
    id: 'risk-medium',
    category: 'risk',
    weight: 0.5,
    label: 'Medium risk',
    evaluate: (ctx) => ({
      matched: ctx.risk && ctx.risk.level === 'medium',
      reason: ctx.risk && ctx.risk.reason
    })
  })
];

export const POLICY_RULES = [
  defineRule({
    id: 'policy-blocked',
    category: 'policy',
    weight: 3,
    label: 'Blocked by mandatory policy',
    evaluate: (ctx) => ({
      matched: !!(ctx.policySummary && ctx.policySummary.mandatoryFailed > 0),
      score: 1,
      reason: ctx.policySummary ? ctx.policySummary.summary : 'no policy summary'
    })
  })
];

export const ALL_DECISION_RULES = [...QUALIFICATION_RULES, ...RISK_RULES, ...POLICY_RULES];
