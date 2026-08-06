export const SCORE_VERSION = '1.0';

export function computeBusinessScore(record) {
  const probe = record.probe && typeof record.probe === 'object' ? record.probe : null;

  let presence = 0;
  if (record.website) presence += 12;
  if (probe) {
    if (probe.ok) presence += 2;
    if (probe.timeMs > 0 && probe.timeMs < 2500) presence += 2;
    if (probe.isHttps) presence += 1;
    if (probe.title) presence += 1;
    if (probe.hasViewport) presence += 1;
    if (probe.metaDescription) presence += 1;
  }
  if (record.instagram) presence += 5;
  if (record.facebook) presence += 5;

  const contact = (record.phone ? 5 : 0) + (record.whatsapp ? 5 : 0) + (record.email ? 5 : 0) + (record.address ? 5 : 0);

  let content = 0;
  const photoCount = (record.photos || []).length;
  content += Math.min(1, photoCount / 8) * 10;
  if (record.menus && record.menus.length) content += 10;
  if (record.openingHours && record.openingHours.length) content += 5;

  let reputation = 0;
  if (record.rating != null) reputation += 15 * (record.rating / 5);
  if (record.reviews != null) reputation += 10 * Math.min(1, Math.log10(record.reviews + 1) / 3);

  const value = Math.round(Math.min(100, presence + contact + content + reputation));
  return {
    value,
    breakdown: {
      presence: round2(presence),
      contact: round2(contact),
      content: round2(content),
      reputation: round2(reputation)
    }
  };
}

export function computeOpportunityScore(record, businessScore) {
  let demand = 0;
  if (record.reviews != null) demand += 50 * Math.min(1, Math.log10(record.reviews + 1) / 3);
  if (record.rating != null) demand += 50 * (record.rating / 5);
  const neglect = 100 - businessScore;

  const major = (record.weaknesses || []).filter((w) => w.severity === 'major').length;
  const minor = (record.weaknesses || []).filter((w) => w.severity === 'minor').length;
  const bonus = 6 * Math.min(3, major) + 3 * Math.min(3, minor);

  const value = Math.round(Math.max(0, Math.min(100, 0.4 * demand + 0.6 * neglect + bonus)));
  return { value, demand: round2(demand), neglect: round2(neglect), bonus: round2(bonus), major, minor };
}

export function priorityTier(opportunity) {
  if (opportunity >= 70) return 'high';
  if (opportunity >= 50) return 'medium';
  return 'low';
}

export function scoreRecord(record) {
  const business = computeBusinessScore(record);
  const opportunity = computeOpportunityScore(record, business.value);
  record.scores = {
    version: SCORE_VERSION,
    business,
    opportunity,
    salesPriority: { tier: priorityTier(opportunity.value), rank: null, percentile: null }
  };
  return record.scores;
}

export function assignRanks(records) {
  const sorted = records
    .slice()
    .sort((a, b) => b.scores.opportunity.value - a.scores.opportunity.value || b.scores.business.value - a.scores.business.value);
  const total = Math.max(1, sorted.length);
  sorted.forEach((record, i) => {
    record.scores.salesPriority.rank = i + 1;
    record.scores.salesPriority.percentile = round2(((total - i) / total) * 100);
  });
  return sorted;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
