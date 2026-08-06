import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render } from '../renderer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function load(name) {
  return readFileSync(join(__dirname, '..', 'templates', `${name}.md`), 'utf8');
}

function viewModel(dossier) {
  const d = dossier.documents;
  const byPriority = (list) => ({ p1: (list || []).filter((x) => x.priority === 'P1').map((x) => x.title).join('; ') || 'none', p2: (list || []).filter((x) => x.priority === 'P2').map((x) => x.title).join('; ') || 'none', p3: (list || []).filter((x) => x.priority === 'P3').map((x) => x.title).join('; ') || 'none' });
  return {
    dossier: { version: dossier.version },
    business: {
      name: d.business.name,
      categoryLabel: d.business.category,
      area: d.business.location.area || 'n/a',
      verdict: d.business.verdict,
      risk: d.summary.risk,
      confidence: d.summary.confidence,
      priorityTier: d.business.priority ? d.business.priority.opportunity : 'n/a'
    },
    scores: { business: d.summary.scores.business, opportunity: d.summary.scores.opportunity, presence: d.summary.scores.presence, digital: d.summary.scores.digitalPresence },
    grades: { health: d.summary.grades.health, digital: d.summary.grades.digital },
    estimates: d.summary.estimates,
    headline: dossier.trace ? dossier.trace.headline : `Business ${dossier.businessId} assessed`,
    summary: { nextStep: d.summary.nextStep },
    strengths: d.strengths.strengths,
    weaknesses: d.weaknesses.weaknesses,
    risks: d.risks.risks,
    recommendations: allRecs(d),
    websiteRecs: d.recommendations.websiteRecommendations,
    seoRecs: d.recommendations.seoRecommendations,
    conversionRecs: d.recommendations.conversionRecommendations,
    opportunities: d.opportunities.opportunities,
    competitors: {
      positioning: d.competitors.positioning,
      marketGap: d.competitors.marketGap,
      ownScore: d.competitors.digitalComparison.ownScore,
      peerAverage: d.competitors.digitalComparison.peerAverage,
      rank: d.competitors.digitalComparison.rank,
      of: d.competitors.digitalComparison.of,
      list: d.competitors.topCompetitors.map((c) => ({ name: c.name, digitalScore: c.digitalScore, weaknesses: c.estimatedWeaknesses.join(', ') || 'none' }))
    },
    website: {
      url: d.website.url || 'none',
      status: d.website.status,
      probe: d.website.probe ? (d.website.probe.ok ? `ok (${d.website.probe.timeMs}ms)` : 'down') : 'not probed',
      booking: d.website.booking || 'none',
      pages: d.website.estimatedPages
    },
    seo: {
      seoScore: d.seo.seoScore,
      title: d.seo.title || 'n/a',
      metaDescription: d.seo.metaDescription || 'n/a',
      h1: d.seo.h1 || 'n/a',
      keywords: (d.seo.keywords || []).join(', ') || 'n/a'
    },
    social: {
      platforms: (d.social.platforms || []).map((p) => p.platform).join(', ') || 'none',
      googleBusiness: d.social.googleBusiness && d.social.googleBusiness.present ? 'listed' : 'not listed'
    },
    reviews: { count: d.reviews.count, rating: d.reviews.rating, reviewQuality: d.reviews.reviewQuality },
    photos: { count: d.photos.count, adequacy: d.photos.adequacy },
    recommendationsPriorities: byPriority(allRecs(d))
  };
}

function allRecs(d) {
  return [...(d.recommendations.topProblems || []), ...(d.recommendations.quickWins || []), ...(d.recommendations.websiteRecommendations || []), ...(d.recommendations.seoRecommendations || []), ...(d.recommendations.brandRecommendations || []), ...(d.recommendations.conversionRecommendations || [])];
}

export const REPORT_BUILDERS = {
  'executive-report': (dossier) => render(load('executive'), viewModel(dossier)),
  'business-health-report': (dossier) => render(load('business-health'), viewModel(dossier)),
  'digital-presence-report': (dossier) => render(load('digital-presence'), viewModel(dossier)),
  'opportunity-report': (dossier) => render(load('opportunity'), viewModel(dossier)),
  'website-recommendation-report': (dossier) => render(load('website-recommendation'), viewModel(dossier))
};

export function buildReports(dossier) {
  const out = {};
  for (const [id, fn] of Object.entries(REPORT_BUILDERS)) {
    out[id] = fn(dossier);
  }
  return out;
}
