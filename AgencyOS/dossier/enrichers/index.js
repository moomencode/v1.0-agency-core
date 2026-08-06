import { categoryInfo, competitorNames } from '../categories.js';

export function brandEnricher(profile, digital, context) {
  const info = categoryInfo(profile.category);
  const presence = context.presence || {};
  const origin = (field) => (field != null && field !== '' ? 'extracted' : 'estimated');
  const quality = context.scores && context.scores.brandQuality != null ? context.scores.brandQuality : (presence.brandQuality || 0.3);

  return {
    personality: info.brand.personality,
    targetAudience: `${profile.area || 'local'} residents and nearby professionals seeking ${categoryInfo(profile.category).label.toLowerCase()} services`,
    brandVoice: info.brand.voice,
    visualStyle: info.brand.visual,
    colorPalette: info.brand.colors,
    typography: info.brand.typography,
    customerExperience: info.brand.customerExperience,
    uniqueSellingPoints: [
      ...(digital.websiteStatus === 'none' ? ['Undiscovered in local search — first mover opportunity'] : []),
      ...(digital.booking ? ['Online booking already offered'] : ['No online booking — conversion gap']),
      ...(profile.branchCount > 1 ? [`${profile.branchCount} branches for market reach`] : []),
      ...(digital.reviews > 50 ? [`Proven by ${digital.reviews} reviews`] : []),
      ...(digital.social.length ? [`Active on ${digital.social.length} platform(s)`] : [])
    ].slice(0, 4),
    brandQuality: Math.round(quality * 100) / 100,
    origin: {
      personality: origin(null),
      targetAudience: origin(null),
      brandVoice: origin(null),
      visualStyle: origin(null),
      colorPalette: origin(null),
      typography: origin(null),
      customerExperience: origin(null),
      uniqueSellingPoints: origin(null)
    }
  };
}

export function competitorsEnricher(profile, digital, context) {
  const ownDigital = digitalPresenceScore(digital);
  const peers = competitorNames(profile.category, profile.area).map((name, i) => {
    const presence = 0.35 + ((i * 17) % 45) / 100;
    return {
      name,
      category: profile.category,
      area: profile.area,
      digitalScore: Math.round((0.25 + presence) * 100),
      hasWebsite: presence > 0.5,
      hasBooking: presence > 0.6,
      onSocial: presence > 0.35,
      estimatedStrengths: presence > 0.6 ? ['established brand', 'mature digital presence'] : ['local reputation'],
      estimatedWeaknesses: presence > 0.6 ? [] : ['weak or missing website', 'limited online visibility']
    };
  });
  const peerAverage = peers.length ? Math.round(peers.reduce((a, p) => a + p.digitalScore, 0) / peers.length) : 0;
  const positioning = ownDigital >= peerAverage
    ? 'digital leader in the local market'
    : 'digital challenger — behind the local average';
  return {
    topCompetitors: peers,
    digitalComparison: {
      ownScore: ownDigital,
      peerAverage,
      rank: peers.filter((p) => p.digitalScore < ownDigital).length + 1,
      of: peers.length + 1
    },
    positioning,
    marketGap: ownDigital < peerAverage
      ? 'competitors are underserved online — a strong website captures their customers'
      : 'competitors lag digitally — maintain the lead with an upgraded presence'
  };
}

export function digitalPresenceScore(digital) {
  let s = 0;
  if (digital.websiteStatus === 'ok') s += 35;
  else if (digital.websiteStatus === 'slow') s += 20;
  else if (digital.websiteStatus === 'broken') s += 5;
  if (digital.googleBusiness && digital.googleBusiness.present) s += 15;
  if (digital.social.length) s += Math.min(20, digital.social.length * 7);
  if (digital.booking) s += 10;
  if (digital.menus > 0) s += 5;
  if (digital.reviews > 0) s += 5;
  if (digital.photos > 0) s += 5;
  return Math.min(100, s);
}

export function strengthsEnricher(profile, digital, context) {
  const scores = context.scores || {};
  const strengths = [];
  if (scores.business >= 60) strengths.push({ id: 'strong-business-score', title: `Strong business fundamentals (${scores.business}/100)`, evidence: 'business score', weight: 3 });
  if (scores.opportunity >= 60) strengths.push({ id: 'high-demand', title: `High local demand (${scores.opportunity}/100)`, evidence: 'opportunity score', weight: 3 });
  if (digital.reviews >= 50) strengths.push({ id: 'social-proof', title: `${digital.reviews} customer reviews build trust`, evidence: 'review count', weight: 2 });
  if (digital.rating >= 4.2) strengths.push({ id: 'high-rating', title: `${digital.rating} average rating`, evidence: 'rating', weight: 2 });
  if (digital.websiteStatus === 'ok') strengths.push({ id: 'has-website', title: 'Has a live website', evidence: 'website probe', weight: 2 });
  if (digital.booking) strengths.push({ id: 'has-booking', title: 'Online booking available', evidence: 'booking link', weight: 1 });
  if (digital.social.length) strengths.push({ id: 'has-social', title: `Active on ${digital.social.length} social platform(s)`, evidence: 'social links', weight: 1 });
  if (profile.branchCount > 1) strengths.push({ id: 'multi-branch', title: `${profile.branchCount} branches`, evidence: 'branch count', weight: 1 });
  return strengths.length ? strengths : [{ id: 'local-rooted', title: 'Established local presence', evidence: 'discovery record', weight: 1 }];
}

const WEAKNESS_TITLES = {
  'no-website': { title: 'No website at all', severity: 'major' },
  'broken-site': { title: 'Website is broken', severity: 'major' },
  'missing-seo': { title: 'No SEO foundation', severity: 'minor' },
  'no-booking': { title: 'No online booking', severity: 'minor' },
  'missing-contact': { title: 'No public contact information', severity: 'major' },
  'no-online-menu': { title: 'No online menu', severity: 'minor' },
  'no-photos': { title: 'No photos online', severity: 'minor' },
  'no-social': { title: 'No social presence', severity: 'minor' },
  'low-rating': { title: 'Below-average rating', severity: 'medium' },
  'closed': { title: 'Business flagged as closed', severity: 'major' }
};

export function weaknessesEnricher(context, record) {
  const recordDefs = (record && record.weaknesses) || [];
  const defOf = (id) => {
    const found = Array.isArray(recordDefs) && recordDefs.find((x) => x && (x.id === id || x === id));
    return found && typeof found === 'object' ? found : null;
  };
  const weak = (context.weaknesses || []).map((id, i) => {
    const def = defOf(id) || {};
    const known = WEAKNESS_TITLES[id] || {};
    const severity = def.severity || known.severity || 'minor';
    return {
      id,
      title: def.title || known.title || id.replace(/-/g, ' ') || `weakness-${i}`,
      severity,
      evidence: def.evidence || 'weakness detection',
      impact: severity === 'major' ? 'significant loss of conversion' : severity === 'medium' ? 'moderate friction' : 'minor friction'
    };
  });
  const presence = context.presence || {};
  if (presence.missingContact) weak.push({ id: 'missing-contact', title: 'No public contact information', severity: 'major', evidence: 'contact extraction', impact: 'leads cannot reach the business' });
  if (presence.websiteStatus === 'broken') weak.push({ id: 'broken-site', title: 'Website is broken', severity: 'major', evidence: 'website probe', impact: 'customers bounce to competitors' });
  if (presence.websiteStatus === 'none') weak.push({ id: 'no-website', title: 'No website at all', severity: 'major', evidence: 'digital extraction', impact: 'invisible to online searches' });
  if (!presence.seoPresent) weak.push({ id: 'missing-seo', title: 'No SEO foundation', severity: 'minor', evidence: 'digital extraction', impact: 'competitors rank first' });
  if (!presence.hasBooking) weak.push({ id: 'no-booking', title: 'No online booking', severity: 'minor', evidence: 'digital extraction', impact: 'bookings require phone follow-up' });
  const dedup = new Map();
  for (const w of weak) dedup.set(w.id, w);
  return [...dedup.values()];
}

export function opportunitiesEnricher(context, weaknesses) {
  const opps = [];
  const majors = weaknesses.filter((w) => w.severity === 'major');
  if (majors.length) opps.push({ id: 'fix-majors', title: `Fix ${majors.length} major weakness(es): ${majors.map((m) => m.title).join(', ')}`, potential: 'high', effort: 'medium', priority: 'P1' });
  if (majors.some((m) => m.id === 'no-website')) opps.push({ id: 'build-website', title: 'Build a modern website — the single biggest conversion lever', potential: 'high', effort: 'medium', priority: 'P1' });
  if (majors.some((m) => m.id === 'broken-site')) opps.push({ id: 'rebuild-website', title: 'Rebuild the broken website', potential: 'high', effort: 'medium', priority: 'P1' });
  if (majors.some((m) => m.id === 'missing-contact')) opps.push({ id: 'add-contact', title: 'Publish phone, WhatsApp and email on all channels', potential: 'medium', effort: 'low', priority: 'P1' });
  if (context.presence && !context.presence.seoPresent) opps.push({ id: 'seo-foundation', title: 'Local SEO foundation (Google Business + maps listing)', potential: 'medium', effort: 'low', priority: 'P2' });
  if (context.presence && !context.presence.socialActivity) opps.push({ id: 'social-start', title: 'Start Instagram/Facebook presence with weekly posts', potential: 'medium', effort: 'low', priority: 'P2' });
  if (!context.presence || !context.presence.hasBooking) opps.push({ id: 'booking-flow', title: 'Add online booking / reservation flow', potential: 'medium', effort: 'low', priority: 'P2' });
  if (!context.presence || (context.presence.photos || 0) < 3) opps.push({ id: 'photo-upgrade', title: 'Professional photo set (10+ images)', potential: 'low', effort: 'low', priority: 'P3' });
  if (context.scores && context.scores.reviews < 30) opps.push({ id: 'review-growth', title: 'Review growth campaign (target 50+ reviews)', potential: 'medium', effort: 'medium', priority: 'P3' });
  if (!opps.length) opps.push({ id: 'growth-maintain', title: 'Maintain the lead: monthly SEO checks and a review cadence', potential: 'medium', effort: 'low', priority: 'P3' });
  return opps.slice(0, 8);
}

export function risksEnricher(context, decision) {
  const risks = [];
  const risk = (decision && decision.risk) || context.risk || { level: 'low' };
  if (risk.level === 'high') risks.push({ id: 'execution-risk', title: 'High-risk profile — needs human review before outreach', level: 'high', mitigation: 'escalate to senior consultant' });
  if (context.flags && context.flags.closed) risks.push({ id: 'closed', title: 'Business flagged as closed', level: 'high', mitigation: 'verify by phone before any engagement' });
  if (context.flags && context.flags.duplicate) risks.push({ id: 'duplicate', title: 'Duplicate record detected', level: 'medium', mitigation: 'merge with canonical record' });
  if (context.presence && context.presence.websiteStatus === 'broken') risks.push({ id: 'site-outage', title: 'Broken website may indicate operational issues', level: 'medium', mitigation: 'confirm the business is active before outreach' });
  if (context.presence && context.presence.missingContact) risks.push({ id: 'no-contact', title: 'No contact information — outreach may fail', level: 'medium', mitigation: 'search for alternative contact channels' });
  if (!context.sourceCount || context.sourceCount < 2) risks.push({ id: 'thin-data', title: 'Thin data (single source)', level: 'low', mitigation: 'validate facts during first call' });
  if (risk.level === 'high') risks.push({ id: 'major-weaknesses', title: 'Multiple major weaknesses reduce conversion odds', level: 'medium', mitigation: 'prioritize quick wins before outreach' });
  return risks.length ? risks : [{ id: 'low-risk', title: 'No material risk signals detected', level: 'low', mitigation: 'standard validation during execution' }];
}
