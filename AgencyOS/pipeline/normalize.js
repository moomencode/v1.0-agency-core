import { profileFor } from './profiles/index.js';
import { clamp, ensureArray } from './utils.js';

const DOC_ALIASES = {
  business: 'business',
  brand: 'brand',
  contact: 'contact',
  location: 'location',
  hours: 'hours',
  social: 'social',
  website: 'website',
  seo: 'seo',
  reviews: 'reviews',
  photos: 'photos',
  services: 'services',
  products: 'products',
  pricing: 'pricing',
  competitors: 'competitors',
  strengths: 'strengths',
  weaknesses: 'weaknesses',
  opportunities: 'opportunities',
  risks: 'risks',
  recommendations: 'recommendations',
  summary: 'summary'
};

function docOf(dossier, id) {
  if (!dossier || typeof dossier !== 'object') return null;
  if (dossier.documents && dossier.documents[id]) return dossier.documents[id];
  if (dossier[id] && dossier[id].content) return dossier[id];
  return null;
}

function contentOf(dossier, id) {
  const doc = docOf(dossier, id);
  if (!doc) return null;
  return doc.content !== undefined ? doc.content : doc;
}

export function normalizeDossier(dossier, { businessId = null } = {}) {
  if (!dossier) {
    return { errors: ['dossier is null'], normalized: null };
  }
  const errors = [];

  const business = contentOf(dossier, 'business') || {};
  const brand = contentOf(dossier, 'brand') || {};
  const contact = contentOf(dossier, 'contact') || {};
  const location = contentOf(dossier, 'location') || {};
  const hours = contentOf(dossier, 'hours') || {};
  const social = contentOf(dossier, 'social') || {};
  const website = contentOf(dossier, 'website') || {};
  const seo = contentOf(dossier, 'seo') || {};
  const reviews = contentOf(dossier, 'reviews') || {};
  const photos = contentOf(dossier, 'photos') || {};
  const services = contentOf(dossier, 'services') || {};
  const products = contentOf(dossier, 'products') || {};
  const pricing = contentOf(dossier, 'pricing') || {};
  const competitors = contentOf(dossier, 'competitors') || {};
  const strengths = contentOf(dossier, 'strengths') || {};
  const weaknesses = contentOf(dossier, 'weaknesses') || {};
  const opportunities = contentOf(dossier, 'opportunities') || {};
  const risks = contentOf(dossier, 'risks') || {};
  const recommendations = contentOf(dossier, 'recommendations') || {};
  const summary = contentOf(dossier, 'summary') || {};

  const id = businessId || business.id || (dossier.businessId) || (dossier.businessId?.valueOf?.()) || 'unknown';
  const name = business.name || brand.name || 'Business';
  const category = business.category || 'other';
  const area = business.area || location.area || null;
  const profile = profileFor(category);

  if (!business.name) errors.push('business.name missing');
  if (!business.category) errors.push('business.category missing');

  const phone = contact.phone || (Array.isArray(contact.phones) && contact.phones[0]) || null;
  const email = contact.email || (Array.isArray(contact.emails) && contact.emails[0]) || null;
  const whatsapp = contact.whatsapp || contact.phone || (Array.isArray(contact.phones) && contact.phones[0]) || null;
  const address = contact.address || location.address || null;
  const rating = typeof reviews.rating === 'number' ? reviews.rating : null;
  const reviewCount = typeof reviews.count === 'number' ? reviews.count : null;
  const oppIds = ensureArray(opportunities.opportunities).map((o) => o.id || '');
  const recIds = ensureArray(recommendations.websiteRecommendations).map((r) => r.id || '');
  const missingBooking = oppIds.includes('booking-flow') || recIds.includes('w-booking');
  const presenceBooking = dossier.context?.presence?.hasBooking === true || dossier.presence?.hasBooking === true;
  const hasBooking = presenceBooking || !missingBooking;

  const weaknessIds = ensureArray(weaknesses.weaknesses).map((w) => w.id || w);
  const hasMenus = Boolean(Array.isArray(products?.products) && products.products.length > 0) || weaknessIds.includes('no-online-menu') === false;
  const hasGallery = Number(photos.count ?? photos.length ?? 0) > 0;
  const hasReviews = reviewCount !== null && reviewCount > 0;
  const hasServices = Boolean(Array.isArray(services.services) && services.services.length > 0);
  const hasSocial = Boolean(social.instagram || social.facebook);

  const socialLinks = [
    { platform: 'instagram', url: social.instagram || null },
    { platform: 'facebook', url: social.facebook || null },
    { platform: 'whatsapp', url: whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, '')}` : null },
    { platform: 'twitter', url: null },
    { platform: 'youtube', url: null },
    { platform: 'tiktok', url: null },
    { platform: 'linkedin', url: null }
  ].filter((s) => s.url);

  const hasWebsite = website.status === 'ok' || website.status === 'slow';
  const websiteUrl = website.url || (hasWebsite ? business.website : null) || null;

  const businessScore = typeof summary.scores?.business === 'number' ? summary.scores.business
    : typeof dossier.context?.scores?.business?.value === 'number' ? dossier.context.scores.business.value
    : null;

  const opportunityScore = typeof summary.scores?.opportunity === 'number' ? summary.scores.opportunity
    : typeof dossier.context?.scores?.opportunity?.value === 'number' ? dossier.context.scores.opportunity.value
    : null;

  return {
    errors,
    normalized: {
      id,
      name,
      category,
      displayName: profile.displayName,
      area,
      schemaType: profile.schemaType,
      phone,
      phoneE164: contact.phoneE164 || phone,
      email,
      whatsapp,
      address,
      mapsUrl: location.mapsUrl || null,
      coordinates: location.coordinates || null,
      rating,
      reviewCount,
      hours: ensureArray(hours.hours),
      hoursShort: hours.hoursShort || null,
      ratingRounded: rating !== null ? clamp(Math.round(rating * 10) / 10, 1, 5) : 4.8,
      hasBooking,
      hasMenus,
      hasGallery,
      hasReviews,
      hasServices,
      hasSocial,
      hasWebsite,
      websiteUrl,
      websiteStatus: website.status || 'none',
      photosCount: Number(photos.count ?? 0),
      socialLinks,
      brand: {
        tagline: brand.tagline || profile.displayName,
        slogan: brand.slogan || null,
        nameSignals: ensureArray(brand.nameSignals),
        keywords: ensureArray(brand.keywords)
      },
      services: ensureArray(services.services),
      products: ensureArray(products.products),
      pricingLevel: pricing.level || null,
      strengths: ensureArray(strengths.strengths),
      weaknesses: weaknessIds,
      opportunities: ensureArray(opportunities.opportunities),
      risks: ensureArray(risks.risks),
      recommendations: recommendations || {},
      seo: seo || {},
      summary,
      scores: { business: businessScore, opportunity: opportunityScore },
      profile
    }
  };
}

export { DOC_ALIASES };
