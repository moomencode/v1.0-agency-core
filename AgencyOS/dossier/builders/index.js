import { nowIso, shortHash } from '../../runtime/utils.js';

function doc({ dossierId, businessId, version, documentId, schemaId, body, createdAt }) {
  return {
    schemaId,
    dossierId,
    businessId,
    documentId,
    version,
    createdAt,
    updatedAt: createdAt,
    ...body
  };
}

export function buildBusiness({ meta, profile, digital, context, decision, grades, record, commerce }) {
  return doc({
    ...meta,
    documentId: 'business',
    schemaId: 'agencyos:dossier/business',
    body: {
      name: profile.name,
      category: profile.category,
      subCategory: profile.subCategory,
      description: profile.description,
      businessType: profile.businessType,
      branchCount: profile.branchCount,
      attributes: buildAttributes(record, commerce),
      location: { area: profile.area, city: profile.city, address: profile.address, coordinates: profile.coordinates },
      workingHours: profile.hours,
      phones: [], emails: [], whatsapp: null,
      reservationMethods: profile.reservationMethods,
      orderingMethods: profile.orderingMethods,
      digitalStatus: digital.websiteStatus,
      scores: {
        business: grades.businessScore,
        opportunity: grades.opportunity,
        presence: grades.presence,
        healthGrade: grades.healthGrade,
        digitalGrade: grades.digitalGrade
      },
      verdict: decision ? decision.verdict : null,
      strategy: null,
      priority: decision && decision.priority ? { opportunity: decision.priority.opportunity.tier, execution: decision.priority.execution.tier } : null
    }
  });
}

const PRESERVED_ATTRIBUTE_KEYS = ['doctors', 'insurance', 'specialties', 'facilities', 'emergencyContact', 'tags', 'prices', 'dishes', 'onlineOrdering'];

function buildAttributes(record, commerce) {
  const attrs = {};
  for (const key of PRESERVED_ATTRIBUTE_KEYS) {
    const value = record && record[key];
    if (value == null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'string' && !String(value).trim()) continue;
    attrs[key] = value;
  }
  const menuRef = (commerce && commerce.menuRef) || [];
  if (menuRef.length) attrs.menuRef = menuRef;
  if (!Object.keys(attrs).length) return null;
  attrs.source = 'preserved';
  return attrs;
}

export function buildBrand({ meta, enr }) {
  return doc({ ...meta, documentId: 'brand', schemaId: 'agencyos:dossier/brand', body: { ...enr.brand } });
}

export function buildContact({ meta, raw }) {
  return doc({
    ...meta,
    documentId: 'contact',
    schemaId: 'agencyos:dossier/contact',
    body: {
      phones: raw.contact.phones,
      emails: raw.contact.emails,
      whatsapp: raw.contact.whatsapp,
      primaryEmail: raw.contact.primaryEmail,
      contactComplete: raw.contact.contactComplete,
      hasWhatsapp: raw.contact.hasWhatsapp
    }
  });
}

export function buildLocation({ meta, profile }) {
  return doc({
    ...meta,
    documentId: 'location',
    schemaId: 'agencyos:dossier/location',
    body: {
      area: profile.area,
      city: profile.city,
      address: profile.address,
      coordinates: profile.coordinates,
      mapsUrl: profile.coordinates ? `https://maps.google.com/?q=${profile.coordinates.lat},${profile.coordinates.lng}` : null,
      branchCount: profile.branchCount
    }
  });
}

export function buildHours({ meta, profile }) {
  return doc({
    ...meta,
    documentId: 'hours',
    schemaId: 'agencyos:dossier/hours',
    body: {
      hours: profile.hours,
      source: profile.hours ? 'extracted' : 'not-available',
      note: profile.hours ? null : 'Working hours not published; verify during first contact'
    }
  });
}

export function buildSocial({ meta, digital }) {
  return doc({
    ...meta,
    documentId: 'social',
    schemaId: 'agencyos:dossier/social',
    body: {
      platforms: digital.social,
      platformCount: digital.social.length,
      googleBusiness: digital.googleBusiness,
      activity: digital.social.length ? 'present' : 'none'
    }
  });
}

export function buildWebsite({ meta, digital, enr, decision }) {
  return doc({
    ...meta,
    documentId: 'website',
    schemaId: 'agencyos:dossier/website',
    body: {
      url: digital.website,
      status: digital.websiteStatus,
      probe: digital.probe,
      booking: digital.booking,
      onlineOrdering: digital.onlineOrdering,
      menus: digital.menus,
      estimatedPages: decision && decision.estimates ? decision.estimates.pages : 6,
      estimatedBuildCost: decision && decision.estimates ? decision.estimates.devCost : null,
      recommendation: enr.recommendations.websiteRecommendations
    }
  });
}

export function buildSeo({ meta, digital, enr }) {
  const html = digital.html || null;
  return doc({
    ...meta,
    documentId: 'seo',
    schemaId: 'agencyos:dossier/seo',
    body: {
      title: html ? html.title : null,
      metaDescription: html ? html.metaDescription : null,
      h1: html ? html.h1 : null,
      viewport: html ? html.viewport : null,
      lang: html ? html.lang : null,
      seoScore: enr.grades.presence,
      keywords: keywordSuggestions(enr),
      recommendations: enr.recommendations.seoRecommendations
    }
  });
}

export function buildReviews({ meta, digital, enr }) {
  return doc({
    ...meta,
    documentId: 'reviews',
    schemaId: 'agencyos:dossier/reviews',
    body: {
      count: digital.reviews,
      rating: digital.rating,
      platforms: digital.reviewPlatforms,
      reviewQuality: digital.reviews > 50 ? 'strong' : digital.reviews > 10 ? 'developing' : 'weak',
      recommendations: enr.recommendations.conversionRecommendations.filter((r) => r.id === 'c-reviews')
    }
  });
}

export function buildPhotos({ meta, digital }) {
  return doc({
    ...meta,
    documentId: 'photos',
    schemaId: 'agencyos:dossier/photos',
    body: {
      count: digital.photos,
      source: 'discovery-extraction',
      adequacy: digital.photos >= 10 ? 'sufficient' : digital.photos >= 3 ? 'minimum' : 'insufficient',
      recommendation: digital.photos < 10 ? 'commission a professional photo set (10+ images)' : null
    }
  });
}

export function buildServices({ meta, commerce, categoryInfo }) {
  const services = commerce.services && commerce.services.length ? commerce.services.map((s) => ({ name: typeof s === 'string' ? s : s.name, source: 'extracted' })) : categoryInfo.services.map((s) => ({ name: s, source: 'estimated' }));
  return doc({ ...meta, documentId: 'services', schemaId: 'agencyos:dossier/services', body: { services } });
}

export function buildProducts({ meta, commerce, categoryInfo }) {
  const products = commerce.products && commerce.products.length ? commerce.products.map((p) => ({ name: typeof p === 'string' ? p : p.name, source: 'extracted' })) : categoryInfo.products.map((p) => ({ name: p, source: 'estimated' }));
  return doc({ ...meta, documentId: 'products', schemaId: 'agencyos:dossier/products', body: { products } });
}

export function buildPricing({ meta, commerce, enr, categoryInfo, priceLevelInfo }) {
  const level = commerce.priceLevel || priceLevelInfo;
  const currency = commerce.currency || 'EGP';
  const ranges = { 1: 'budget', 2: 'mid-market', 3: 'premium' };
  return doc({
    ...meta,
    documentId: 'pricing',
    schemaId: 'agencyos:dossier/pricing',
    body: {
      priceLevel: level,
      range: ranges[level] || 'mid-market',
      currency,
      source: commerce.priceLevel ? 'extracted' : 'estimated-by-category',
      positioning: 'priced for the local mid-market with premium upgrade headroom'
    }
  });
}

export function buildCompetitors({ meta, enr }) {
  return doc({ ...meta, documentId: 'competitors', schemaId: 'agencyos:dossier/competitors', body: { ...enr.competitors } });
}

export function buildStrengths({ meta, enr }) {
  return doc({ ...meta, documentId: 'strengths', schemaId: 'agencyos:dossier/strengths', body: { strengths: enr.strengths } });
}

export function buildWeaknesses({ meta, enr }) {
  return doc({ ...meta, documentId: 'weaknesses', schemaId: 'agencyos:dossier/weaknesses', body: { weaknesses: enr.weaknesses } });
}

export function buildOpportunities({ meta, enr }) {
  return doc({ ...meta, documentId: 'opportunities', schemaId: 'agencyos:dossier/opportunities', body: { opportunities: enr.opportunities } });
}

export function buildRisks({ meta, enr }) {
  return doc({ ...meta, documentId: 'risks', schemaId: 'agencyos:dossier/risks', body: { risks: enr.risks } });
}

export function buildRecommendations({ meta, enr }) {
  return doc({ ...meta, documentId: 'recommendations', schemaId: 'agencyos:dossier/recommendations', body: { ...enr.recommendations } });
}

export function buildSummary({ meta, profile, enr, decision, grades }) {
  return doc({
    ...meta,
    documentId: 'summary',
    schemaId: 'agencyos:dossier/summary',
    body: {
      businessId: meta.businessId,
      name: profile.name,
      category: profile.category,
      area: profile.area,
      verdict: decision ? decision.verdict : null,
      confidence: decision ? decision.confidence : null,
      risk: decision ? decision.risk.level : null,
      scores: { business: grades.businessScore, opportunity: grades.opportunity, presence: grades.presence, digitalPresence: grades.digitalPresence },
      grades: { health: grades.healthGrade, digital: grades.digitalGrade },
      estimates: decision && decision.estimates ? {
        websiteValue: decision.estimates.websiteValue,
        devCost: decision.estimates.devCost,
        salesValue: decision.estimates.salesValue,
        roi: decision.estimates.roi,
        closingProbability: decision.estimates.closingProbability
      } : null,
      counts: {
        strengths: enr.strengths.length,
        weaknesses: enr.weaknesses.length,
        opportunities: enr.opportunities.length,
        risks: enr.risks.length,
        recommendations: enr.recommendations.topProblems.length + enr.recommendations.quickWins.length + enr.recommendations.websiteRecommendations.length + enr.recommendations.seoRecommendations.length + enr.recommendations.brandRecommendations.length + enr.recommendations.conversionRecommendations.length
      },
      nextStep: nextStepOf(decision, grades)
    }
  });
}

function keywordSuggestions(enr) {
  const category = enr.brand ? 'local business' : 'local business';
  return [category, 'near me', 'best in area'].filter(Boolean);
}

function nextStepOf(decision, grades) {
  if (!decision) return 'build dossier';
  if (decision.verdict === 'APPROVE') return 'begin website production pipeline';
  if (decision.verdict === 'ESCALATE') return 'human review before outreach';
  if (decision.verdict === 'PARK') return 'wait for more signals';
  return 'rejected — no execution';
}

export function buildReadme({ meta, profile, enr, grades, decision, raw }) {
  const lines = [
    `# ${profile.name} — Business Dossier`,
    '',
    `> Version ${meta.version} of the single source of truth for this business.`,
    `> Dossier ID: ${meta.dossierId}`,
    '',
    '## Profile',
    `- Category: ${profile.category}${profile.subCategory ? ' / ' + profile.subCategory : ''}`,
    `- Area: ${profile.area || 'n/a'}`,
    `- Branches: ${profile.branchCount}`,
    `- Contact: ${raw.contact.phones.join(', ') || 'n/a'} | ${raw.contact.emails.join(', ') || 'n/a'}${raw.contact.whatsapp ? ' | WhatsApp ' + raw.contact.whatsapp : ''}`,
    '',
    '## Grades',
    `- Business health: **${grades.healthGrade}** (${grades.businessScore}/100)`,
    `- Digital presence: **${grades.digitalGrade}** (${grades.digitalPresence}/100)`,
    `- Opportunity: ${grades.opportunity}/100`,
    '',
    '## Decision',
    `- Verdict: **${decision ? decision.verdict : 'n/a'}** | Risk: ${decision ? decision.risk.level : 'n/a'} | Confidence: ${decision ? decision.confidence : 'n/a'}`,
    `- Next step: ${decision ? nextStepOf(decision, grades) : 'n/a'}`,
    '',
    '## Summary',
    `- Strengths: ${enr.strengths.length} | Weaknesses: ${enr.weaknesses.length} | Opportunities: ${enr.opportunities.length} | Risks: ${enr.risks.length}`,
    `- Top problems: ${enr.recommendations.topProblems.map((p) => p.title).join('; ') || 'none'}`,
    `- Quick wins: ${enr.recommendations.quickWins.map((q) => q.title).join('; ') || 'none'}`,
    '',
    '## Documents',
    'business.json · brand.json · contact.json · location.json · hours.json · social.json · website.json · seo.json · reviews.json · photos.json · services.json · products.json · pricing.json · competitors.json · strengths.json · weaknesses.json · opportunities.json · risks.json · recommendations.json · summary.json',
    '',
    '## Reports',
    'executive-report.md · business-health-report.md · digital-presence-report.md · opportunity-report.md · website-recommendation-report.md',
    ''
  ];
  return lines.join('\n');
}
