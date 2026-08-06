export function normalizePhone(input) {
  if (!input) return null;
  let p = String(input).replace(/[^\d+]/g, '');
  if (!p) return null;
  if (p.startsWith('+')) {
    return /^\+\d{9,14}$/.test(p) ? p : null;
  }
  if (p.length === 11 && p.startsWith('0')) return '+20' + p.slice(1);
  if (p.length === 10 && p.startsWith('0')) return '+20' + p.slice(1);
  return '+' + p;
}

export function normalizeEmail(input) {
  if (!input) return null;
  const e = String(input).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export function normalizeUrl(input) {
  if (!input) return null;
  let u = String(input).trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  u = u.replace(/\/+$/, '');
  return u;
}

export function normalizeSocialUrl(platform, input) {
  if (!input) return null;
  const u = normalizeUrl(input);
  const handles = { facebook: 'facebook.com', instagram: 'instagram.com', tiktok: 'tiktok.com', linkedin: 'linkedin.com' };
  const host = handles[platform];
  if (host && u.indexOf(host) === -1) return `https://${host}/${String(input).replace(/^@/, '')}`;
  return u;
}

export function normalizeCoordinates(coords) {
  if (!coords) return null;
  const lat = Number(coords.lat);
  const lng = Number(coords.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

export function normalizeName(input) {
  if (!input) return 'Unknown Business';
  return String(input).trim().replace(/\s+/g, ' ');
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function normalizeHours(hours) {
  if (!hours) return null;
  if (Array.isArray(hours)) {
    const out = [];
    for (const h of hours) {
      const day = String(h.day || '').toLowerCase();
      if (h.open && h.close && (day || h.days)) {
        out.push({ day: day || null, days: h.days || null, open: h.open, close: h.close });
      }
    }
    return out.length ? out : null;
  }
  if (typeof hours === 'object') {
    const out = [];
    for (const day of DAYS) {
      if (hours[day]) {
        const r = hours[day];
        if (typeof r === 'string' && r.includes('-')) {
          const [open, close] = r.split('-').map((s) => s.trim());
          out.push({ day, open, close });
        } else if (r && r.open && r.close) {
          out.push({ day, open: r.open, close: r.close });
        }
      }
    }
    return out.length ? out : null;
  }
  return null;
}
