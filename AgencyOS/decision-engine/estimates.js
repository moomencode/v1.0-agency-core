function num(v, fallback = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function pageCount(ctx) {
  let pages = 6;
  if (num(ctx.presence && ctx.presence.menus) > 0) pages += 2;
  if (num(ctx.presence && ctx.presence.photos) >= 3) pages += 1;
  if (ctx.presence && ctx.presence.hasBooking) pages += 1;
  if (ctx.presence && ctx.presence.hasWhatsapp) pages += 1;
  return Math.min(12, pages);
}

export function computeEstimates(ctx) {
  const opportunity = num(ctx.scores && ctx.scores.opportunity);
  const business = num(ctx.scores && ctx.scores.business);
  const presence = num(ctx.scores && ctx.scores.presence);
  const brandQuality = num(ctx.scores && ctx.scores.brandQuality, num(ctx.presence && ctx.presence.brandQuality));
  const reviews = num(ctx.scores && ctx.scores.reviews);
  const rating = num(ctx.scores && ctx.scores.rating);
  const seoPresent = !!(ctx.presence && ctx.presence.seoPresent);
  const socialActivity = num(ctx.presence && ctx.presence.socialActivity);
  const contactComplete = !!(ctx.presence && ctx.presence.contactComplete);
  const websiteStatus = (ctx.presence && ctx.presence.websiteStatus) || 'none';
  const weaknesses = Array.isArray(ctx.weaknesses) ? ctx.weaknesses.length : 0;
  const pages = pageCount(ctx);

  const websiteValue = Math.round(presence * 40 + brandQuality * 2000 + (seoPresent ? 800 : 0) + socialActivity * 1000);
  const devCost = 900 + pages * 120;
  const salesValue = Math.round((opportunity / 100) * 5000 + Math.min(1500, Math.log10(reviews + 1) * 400));
  const roi = salesValue === 0 ? 0 : Math.round(((salesValue - devCost) / devCost) * 1000) / 1000;
  const closingProbability = Math.round(clamp01(
    0.25 * (contactComplete ? 1 : 0) +
    0.2 * (rating / 5) +
    0.2 * socialActivity +
    0.2 * (opportunity / 100) +
    0.15 * (websiteStatus !== 'broken' ? 1 : 0) +
    0.1 * (business / 100)
  ) * 1000) / 1000;
  const buildTimeMs = 180000 + pages * 45000 + weaknesses * 15000;

  return {
    websiteValue,
    devCost,
    salesValue,
    roi,
    closingProbability,
    buildTimeMs,
    pages
  };
}

export function computeConfidence(ctx) {
  const presence = ctx.presence || {};
  let c = 0;
  if (presence.contactComplete) c += 0.25;
  if (presence.hasWhatsapp) c += 0.1;
  if (num(presence.socialActivity) > 0) c += 0.15;
  if (num(ctx.scores && ctx.scores.reviews) > 0) c += 0.1;
  if (num(ctx.scores && ctx.scores.rating) > 0) c += 0.1;
  if (presence.hasWebsite !== undefined) c += 0.1;
  if ((ctx.sourceCount || 0) >= 2) c += 0.15;
  if (presence.hasBooking || presence.menus > 0) c += 0.05;
  return Math.round(clamp01(c) * 1000) / 1000;
}

export function computeRisk(ctx, confidence) {
  const majors = num(ctx.weaknessMajor, 0);
  if (majors >= 2) return { level: 'high', reason: `${majors} major weaknesses` };
  const broken = ctx.presence && ctx.presence.websiteStatus === 'broken';
  const missingContact = !!(ctx.presence && ctx.presence.missingContact);
  if (broken) return { level: 'medium', reason: 'website is broken' };
  if (missingContact && confidence < 0.5) return { level: 'medium', reason: 'missing contact with low confidence' };
  if (ctx.flags && (ctx.flags.closed || ctx.flags.duplicate)) return { level: 'medium', reason: 'flagged record' };
  return { level: 'low', reason: 'no risk signals' };
}

export function priorityTierOf(value) {
  if (value >= 70) return 'high';
  if (value >= 50) return 'medium';
  return 'low';
}

export function computePriorities(ctx, estimates) {
  const opportunity = num(ctx.scores && ctx.scores.opportunity);
  const business = num(ctx.scores && ctx.scores.business);
  const closing = num(estimates.closingProbability);
  const roi = num(estimates.roi);
  const execution = 0.6 * opportunity + 0.4 * closing * 100;
  const resource = 0.5 * opportunity + 0.3 * closing * 100 + 0.2 * Math.min(100, roi * 40);
  return {
    business: { tier: priorityTierOf(business), value: Math.round(business) },
    opportunity: { tier: priorityTierOf(opportunity), value: Math.round(opportunity) },
    execution: { tier: priorityTierOf(execution), value: Math.round(execution) },
    resource: { tier: priorityTierOf(resource), value: Math.round(resource) }
  };
}
