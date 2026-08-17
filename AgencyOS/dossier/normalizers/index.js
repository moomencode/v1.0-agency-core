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
const DAY_TOKEN = /^(sun|mon|tue|wed|thu|fri|sat)[^a-z]*$/i;
const DAY_RANGE = /^(sun|mon|tue|wed|thu|fri|sat)[^a-z]*-[^a-z]*(sun|mon|tue|wed|thu|fri|sat)$/i;

const DAY_PRETTY = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday'
};

function parseDayToken(token) {
  if (!token) return null;
  const t = String(token).trim();
  if (/^daily$/i.test(t) || /every\s*day/i.test(t) || /^all\s*days$/i.test(t)) return 'Daily';
  const single = t.match(DAY_TOKEN);
  if (single) return DAY_PRETTY[single[1].toLowerCase()];
  const range = t.match(DAY_RANGE);
  if (range) return `${DAY_PRETTY[range[1].toLowerCase()]} - ${DAY_PRETTY[range[2].toLowerCase()]}`;
  return null;
}

function parseHoursRange(text) {
  const trimmed = String(text).trim();
  if (!trimmed) return null;
  if (/^24\/?7$/i.test(trimmed.replace(/\s+/g, ''))) {
    return { open: '00:00', close: '23:59' };
  }
  const m = trimmed.match(/^(.+?)\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)$/i);
  if (!m) return null;
  const days = parseDayToken(m[1]);
  if (!days) return null;
  return { days, open: m[2].trim(), close: m[3].trim() };
}

export function normalizeHours(hours) {
  if (!hours) return null;
  if (Array.isArray(hours)) {
    const out = [];
    for (const h of hours) {
      if (h && typeof h === 'object') {
        const day = String(h.day || '').toLowerCase();
        if (h.open && h.close && (day || h.days)) {
          out.push({ day: day || null, days: h.days || null, open: h.open, close: h.close });
        }
        continue;
      }
      const parsed = parseHoursRange(h);
      if (parsed) out.push({ day: null, days: parsed.days, open: parsed.open, close: parsed.close });
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
