export function recommendationsEnricher({ profile, digital, context, weaknesses, opportunities, brand, estimates }) {
  const problems = [];
  const quickWins = [];
  const website = [];
  const seo = [];
  const brandRecs = [];
  const conversion = [];

  const has = (id) => weaknesses.some((w) => w.id === id);

  if (has('no-website')) {
    problems.push({ id: 'p-no-website', title: 'The business has no website and is invisible to online searches', severity: 'critical' });
    website.push({ id: 'w-build', title: 'Build a responsive website', detail: '5-9 pages: home, about, services, gallery, reviews, contact, booking', priority: 'P1' });
  }
  if (has('broken-site')) {
    problems.push({ id: 'p-broken-site', title: 'The current website is broken and drives customers away', severity: 'critical' });
    website.push({ id: 'w-rebuild', title: 'Rebuild the broken website on a modern stack', detail: 'restore uptime, mobile-first, 3s load target', priority: 'P1' });
  }
  if (digital.websiteStatus === 'slow') {
    problems.push({ id: 'p-slow-site', title: 'Website is slow (over 2.5s)', severity: 'high' });
    website.push({ id: 'w-speed', title: 'Speed optimization', detail: 'compress images, cache, remove heavy scripts', priority: 'P2' });
  }
  if (has('missing-contact')) {
    problems.push({ id: 'p-contact', title: 'No public contact information — leads cannot reach the business', severity: 'critical' });
    conversion.push({ id: 'c-contact', title: 'Publish phone, WhatsApp and email prominently', detail: 'footer, header, Google Business, social bios', priority: 'P1' });
    quickWins.push({ id: 'q-contact', title: 'Add contact details to Google Business Profile today', effort: '5 minutes' });
  }
  if (!context.presence || !context.presence.seoPresent) {
    problems.push({ id: 'p-seo', title: 'No SEO foundation — competitors rank first', severity: 'high' });
    seo.push({ id: 's-local', title: 'Local SEO setup', detail: 'Google Business Profile, consistent NAP, local keywords', priority: 'P1' });
    quickWins.push({ id: 'q-gbp', title: 'Claim and complete the Google Business Profile', effort: '20 minutes' });
  }
  if (!context.presence || !context.presence.hasBooking) {
    website.push({ id: 'w-booking', title: 'Add an online booking / reservation flow', detail: 'calendar-based booking with WhatsApp confirmation', priority: 'P2' });
    quickWins.push({ id: 'q-whatsapp', title: 'Enable WhatsApp ordering line', effort: '15 minutes' });
  }
  if (!digital.social.length) {
    seo.push({ id: 's-social', title: 'Start Instagram + Facebook pages', detail: 'weekly posts, local hashtags, geo tags', priority: 'P2' });
    quickWins.push({ id: 'q-social', title: 'Create Instagram and Facebook pages linked to GBP', effort: '30 minutes' });
  }
  if (digital.photos < 3) {
    website.push({ id: 'w-photos', title: 'Professional photo set', detail: '10+ images: storefront, interior, products, team', priority: 'P3' });
    quickWins.push({ id: 'q-photos', title: 'Capture 10 smartphone photos of the premises', effort: '1 hour' });
  }
  if (digital.reviews < 30) {
    conversion.push({ id: 'c-reviews', title: 'Review generation campaign', detail: 'post-purchase SMS/WhatsApp link targeting 50+ reviews', priority: 'P2' });
  }
  if (context.scores && context.scores.reviews < 15 && (context.scores.rating || 0) < 3.8) {
    problems.push({ id: 'p-rating', title: 'Low rating signals service issues that a website cannot fix alone', severity: 'medium' });
  }
  if (estimates && estimates.salesValue >= 3500) {
    website.push({ id: 'w-value', title: 'Premium conversion-focused build', detail: `expected sales value $${Math.round(estimates.salesValue)} justifies a polished flagship site`, priority: 'P1' });
  }
  if (profile.branchCount > 1) {
    seo.push({ id: 's-branches', title: 'Per-branch landing pages', detail: 'local SEO for each location with maps integration', priority: 'P2' });
  }
  if (!brand || brand.brandQuality < 0.4) {
    brandRecs.push({ id: 'b-identity', title: 'Brand identity refresh', detail: `color system ${(brand && brand.colorPalette) || []} with consistent typography`, priority: 'P2' });
  }

  if (!problems.length) problems.push({ id: 'p-none', title: 'No critical problems detected — the business is execution-ready', severity: 'info' });

  return {
    topProblems: problems.slice(0, 5),
    quickWins: quickWins.slice(0, 5),
    websiteRecommendations: website.slice(0, 5),
    seoRecommendations: seo.slice(0, 5),
    brandRecommendations: brandRecs.slice(0, 4),
    conversionRecommendations: conversion.slice(0, 4)
  };
}
