import { shortHash, slugify } from '../runtime/utils.js';

export function normalizePhone(raw) {
  if (raw == null) return null;
  let digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length <= 11) digits = `20${digits.slice(1)}`;
  return digits;
}

export function normalizeUrl(raw) {
  if (raw == null) return null;
  let url = String(raw).trim();
  if (!url) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

export function normalizeSocial(raw) {
  if (raw == null) return null;
  let url = String(raw).trim();
  if (!url) return null;
  if (url.startsWith('@')) url = url.slice(1);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

function normalizeEmail(raw) {
  if (raw == null) return null;
  const email = String(raw).trim().toLowerCase();
  return email || null;
}

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function normalizeCandidate(candidate) {
  const out = { ...candidate };
  out.name = String(candidate.name || '').trim();
  out.category = candidate.category || 'other';
  out.area = String(candidate.area || 'Unknown').trim() || 'Unknown';
  out.country = candidate.country || 'EG';
  out.phone = normalizePhone(candidate.phone);
  out.whatsapp = normalizePhone(candidate.whatsapp);
  out.website = normalizeUrl(candidate.website);
  out.instagram = normalizeSocial(candidate.instagram);
  out.facebook = normalizeSocial(candidate.facebook);
  out.email = normalizeEmail(candidate.email);
  out.rating = Number.isFinite(Number(candidate.rating)) ? Math.max(0, Math.min(5, Number(candidate.rating))) : null;
  out.reviews = Number.isFinite(Number(candidate.reviews)) ? Math.max(0, Number(candidate.reviews)) : null;
  out.openingHours = toArray(candidate.openingHours);
  out.photos = toArray(candidate.photos);
  out.menus = toArray(candidate.menus);
  out.booking = normalizeUrl(candidate.booking);
  out.sources = Array.isArray(candidate.sources) && candidate.sources.length ? [...new Set(candidate.sources)] : ['unknown'];
  out.simulatedProbe = candidate.simulatedProbe || null;
  return out;
}

export function dedupeKey(candidate) {
  const phone = normalizePhone(candidate.phone);
  if (phone) return `p:${phone}`;
  return `n:${slugify(candidate.name)}|${candidate.category}`;
}

export function mergeCandidates(candidates) {
  const groups = new Map();
  for (const raw of candidates) {
    const c = normalizeCandidate(raw);
    const key = dedupeKey(c);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const merged = [];
  for (const group of groups.values()) {
    const base = { ...group[0] };
    base.sources = [];
    for (const c of group) {
      base.sources.push(...(c.sources || []));
      for (const field of ['name', 'category', 'area', 'country', 'address', 'phone', 'whatsapp', 'website', 'instagram', 'facebook', 'email', 'booking', 'rating', 'reviews', 'openingHours', 'photos', 'menus', 'probe']) {
        if (isEmpty(base[field]) && !isEmpty(c[field])) base[field] = c[field];
      }
      if (!base.simulatedProbe && c.simulatedProbe) base.simulatedProbe = c.simulatedProbe;
    }
    base.sources = [...new Set(base.sources)];
    merged.push(base);
  }
  return merged;
}

function isEmpty(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === '';
}

export function buildRecord(candidate, { probe = null } = {}) {
  const c = normalizeCandidate(candidate);
  const id = `dis-${shortHash(`${c.name}|${c.phone || ''}|${c.area}|${c.category}`, 10)}`;
  return {
    id,
    name: c.name,
    category: c.category,
    area: c.area,
    country: c.country,
    address: c.address || null,
    phone: c.phone,
    whatsapp: c.whatsapp,
    rating: c.rating,
    reviews: c.reviews,
    website: c.website,
    instagram: c.instagram,
    facebook: c.facebook,
    email: c.email,
    openingHours: c.openingHours,
    photos: c.photos,
    menus: c.menus,
    booking: c.booking,
    sources: c.sources,
    probe,
    weaknesses: [],
    scores: null,
    collectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
