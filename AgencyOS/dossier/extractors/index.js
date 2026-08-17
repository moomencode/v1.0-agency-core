import { normalizePhone, normalizeEmail, normalizeUrl, normalizeCoordinates, normalizeName, normalizeHours, normalizeSocialUrl } from '../normalizers/index.js';

export const CONTACT_EXTRACTOR = {
  id: 'contact',
  extract(record) {
    const phones = [];
    if (record.phone) phones.push(normalizePhone(record.phone));
    if (record.phone2) phones.push(normalizePhone(record.phone2));
    for (const p of record.phones || []) phones.push(normalizePhone(p));

    const emails = [];
    if (record.email) emails.push(normalizeEmail(record.email));
    for (const e of record.emails || []) emails.push(normalizeEmail(e));

    return {
      phones: [...new Set(phones.filter(Boolean))],
      emails: [...new Set(emails.filter(Boolean))],
      whatsapp: record.whatsapp ? normalizePhone(record.whatsapp) : null,
      primaryEmail: emails[0] || null,
      contactComplete: !!(record.phone || record.email || record.whatsapp),
      hasWhatsapp: !!record.whatsapp
    };
  }
};

export const PROFILE_EXTRACTOR = {
  id: 'profile',
  extract(record) {
    return {
      name: normalizeName(record.name),
      category: (record.category || 'other').toLowerCase(),
      subCategory: record.subCategory || null,
      description: record.description || null,
      businessType: record.businessType || null,
      branchCount: Number.isFinite(record.branchCount) ? record.branchCount : 1,
      area: record.area || null,
      address: record.address || null,
      city: record.city || record.area || null,
      coordinates: normalizeCoordinates(record.coordinates || (record.lat != null && record.lng != null ? { lat: record.lat, lng: record.lng } : null)),
      hours: normalizeHours(record.openingHours || record.hours || null),
      reservationMethods: Array.isArray(record.reservationMethods) && record.reservationMethods.length ? record.reservationMethods : (record.booking ? ['website-booking'] : []),
      orderingMethods: Array.isArray(record.orderingMethods) ? record.orderingMethods : (record.menus && record.menus.length ? ['online-menu'] : [])
    };
  }
};

export const DIGITAL_EXTRACTOR = {
  id: 'digital',
  extract(record) {
    const probe = record.probe || null;
    const websiteStatus = !record.website ? 'none' : probe && probe.ok === false ? 'broken' : probe && probe.timeMs > 2500 ? 'slow' : 'ok';
    const social = [];
    const add = (platform, url) => {
      if (url) social.push({ platform, url: normalizeSocialUrl(platform, url), present: true });
    };
    add('facebook', record.facebook);
    add('instagram', record.instagram);
    add('tiktok', record.tiktok);
    add('linkedin', record.linkedin);
    if (record.socials && Array.isArray(record.socials)) {
      for (const s of record.socials) {
        if (s && s.platform && !social.some((x) => x.platform === s.platform)) {
          social.push({ platform: s.platform, url: normalizeSocialUrl(s.platform, s.url || s.handle), present: true });
        }
      }
    }
    return {
      website: record.website ? normalizeUrl(record.website) : null,
      websiteStatus,
      probe: probe ? { ok: probe.ok, status: probe.status || null, timeMs: probe.timeMs || null } : null,
      html: record.htmlAnalysis || null,
      seo: record.seo || null,
      googleBusiness: record.googleBusiness || { present: !!record.googleBusinessId },
      reviewPlatforms: Array.isArray(record.reviewPlatforms) ? record.reviewPlatforms : [],
      social,
      rating: Number.isFinite(record.rating) ? record.rating : null,
      reviews: Number.isFinite(record.reviews) ? record.reviews : 0,
      photos: Array.isArray(record.photos) ? record.photos.length : 0,
      menus: Array.isArray(record.menus) ? record.menus.length : 0,
      booking: record.booking || null,
      onlineOrdering: !!record.onlineOrdering
    };
  }
};

export const COMMERCE_EXTRACTOR = {
  id: 'commerce',
  extract(record) {
    return {
      services: Array.isArray(record.services) ? record.services : null,
      products: Array.isArray(record.products) ? record.products : null,
      priceLevel: Number.isFinite(record.priceLevel) ? record.priceLevel : null,
      currency: record.currency || 'EGP',
      menuRef: (record.menus || []).map((m) => (typeof m === 'string' ? m : m.url || m.name || null)).filter(Boolean)
    };
  }
};

export const EXTRACTORS = {
  contact: CONTACT_EXTRACTOR,
  profile: PROFILE_EXTRACTOR,
  digital: DIGITAL_EXTRACTOR,
  commerce: COMMERCE_EXTRACTOR
};

export function runExtractors(record) {
  const out = {};
  for (const [id, ext] of Object.entries(EXTRACTORS)) {
    out[id] = ext.extract(record);
  }
  return out;
}
