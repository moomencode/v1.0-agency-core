import { ctxError, CTX_CODES } from './errors.js';

function num(v, fallback = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function bool(v) {
  return v === true || v === 1 || String(v).toLowerCase() === 'true';
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function list(record) {
  return record && record.weaknesses && Array.isArray(record.weaknesses) ? record.weaknesses : [];
}

export class ContextEngine {
  constructor({ validator = null, schema = null } = {}) {
    this.validator = validator || null;
    this.schema = schema || null;
  }

  build(record, extras = {}) {
    if (!record || typeof record !== 'object') throw ctxError(CTX_CODES.INVALID_RECORD, 'context requires a record object');
    const scores = record.scores || {};
    const businessScore = num(scores.business && scores.business.value, num(record.businessScore, 0));
    const opportunityScore = num(scores.opportunity && scores.opportunity.value, num(record.opportunityScore, 0));
    const breakdown = (scores.business && scores.business.breakdown) || {};
    const presence = num(breakdown.presence, extras.presence ?? 0);

    const reviews = num(record.reviews, 0);
    const rating = num(record.rating, 0);
    const hasWebsite = !!(record.website || extras.website);
    const probe = record.probe || null;
    const websiteStatus = !hasWebsite ? 'none'
      : probe && probe.ok === false ? 'broken'
      : probe && num(probe.timeMs, 0) > 2500 ? 'slow'
      : 'ok';
    const weaknesses = list(record).map((w) => (typeof w === 'string' ? w : w.id)).filter(Boolean);
    const socialLinks = [record.instagram, record.facebook, extras.instagram, extras.facebook].filter(Boolean).length;
    const email = record.email || extras.email || null;
    const whatsapp = record.whatsapp || extras.whatsapp || null;
    const phone = record.phone || extras.phone || null;
    const address = record.address || extras.address || null;
    const photos = Array.isArray(record.photos) ? record.photos : extras.photos || [];
    const menus = Array.isArray(record.menus) ? record.menus : extras.menus || [];
    const booking = record.booking || extras.booking || null;
    const hasOrder = !!extras.order || !!record.order;

    const seoPresent = !weaknesses.includes('missing-seo');
    const socialActivity = clamp01(socialLinks * 0.3 + (email ? 0.25 : 0) + (reviews >= 50 ? 0.15 : 0) + (rating > 0 ? 0.1 : 0));
    const brandQuality = clamp01(socialLinks * 0.25 + (photos.length >= 3 ? 0.3 : 0) + (rating >= 4 ? 0.25 : 0) + (menus.length ? 0.1 : 0) + (booking || hasOrder ? 0.1 : 0));
    const contactComplete = !!(phone && (email || whatsapp || address));
    const missingContact = !(phone || email || whatsapp || address);

    const ctx = {
      version: 1,
      businessId: record.id || extras.businessId || `ctx-${String(record.name || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: record.name || extras.name || null,
      category: record.category || extras.category || 'other',
      area: record.area || extras.area || null,
      scores: {
        business: Math.round(businessScore),
        opportunity: Math.round(opportunityScore),
        presence: Math.round(presence),
        brandQuality: Number(brandQuality.toFixed(3)),
        reviews,
        rating
      },
      presence: {
        websiteStatus,
        hasWebsite,
        seoPresent,
        brandQuality: Number(brandQuality.toFixed(3)),
        socialActivity: Number(socialActivity.toFixed(3)),
        contactComplete,
        missingContact,
        hasWhatsapp: !!whatsapp,
        hasBooking: !!booking,
        photos: photos.length,
        menus: menus.length
      },
      flags: {
        closed: bool(extras.closed ?? record.closed),
        duplicate: bool(extras.duplicate ?? record.duplicate),
        premiumWebsite: bool(extras.premiumWebsite ?? record.premiumWebsite),
        missingContact
      },
      weaknesses,
      weaknessMajor: weaknesses.filter((w) => {
        const def = (record.weaknesses && record.weaknesses.find((x) => x.id === w)) || {};
        return (def.severity || 'minor') === 'major';
      }).length,
      weaknessMinor: weaknesses.length - weaknesses.filter((w) => {
        const def = (record.weaknesses && record.weaknesses.find((x) => x.id === w)) || {};
        return (def.severity || 'minor') === 'major';
      }).length,
      sources: Array.isArray(record.sources) ? record.sources : extras.sources || [],
      sourceCount: Array.isArray(record.sources) ? new Set(record.sources).size : (extras.sources || []).length,
      estimates: null,
      risk: null,
      priority: null,
      confidence: null,
      createdAt: extras.createdAt || null,
      tags: extras.tags || []
    };
    ctx.weaknessCount = ctx.weaknesses.length;
    return ctx;
  }

  validate(ctx) {
    if (!this.validator || !this.schema) return { valid: true, errors: [] };
    const check = this.validator.validate(ctx, this.schema, { schemaPath: 'brain:context' });
    return { valid: check.valid, errors: check.errors || [] };
  }

  assertValid(ctx) {
    const check = this.validate(ctx);
    if (!check.valid) {
      throw ctxError(CTX_CODES.INVALID_CONTEXT, 'context failed schema validation', { errors: (check.errors || []).slice(0, 10) });
    }
    return ctx;
  }

  merge(...ctxs) {
    return Object.assign({}, ...ctxs.filter(Boolean));
  }
}

export function createContextEngine(opts) {
  return new ContextEngine(opts);
}

export function buildContext(record, opts = {}) {
  return new ContextEngine(opts).build(record);
}
