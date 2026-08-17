import { generateThemeTokens, themeJsonFromTokens } from '../theme.js';
import { generateLocalization } from '../localization.js';
import { ensureArray, slugify } from '../utils.js';

function fmtPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  const intl = digits.startsWith('20') ? digits : `20${digits}`;
  const raw = intl.replace(/\D/g, '');
  const pretty = `+${raw.replace(/^(20)(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3 $4').replace(/^(20)(\d{2})(\d{3})(\d{3})$/, '$1 $2 $3 $4')}`;
  return { pretty, raw };
}

export function buildConfigs(n, { themeTokens, defaultMode, sections, manifest }) {
  const out = {};
  const phone = fmtPhone(n.phone || null);
  const contactPhone = phone?.pretty || null;
  const waPhone = fmtPhone(n.whatsapp || null);
  const waDigits = waPhone ? waPhone.raw : null;
  const whatsappUrl = waDigits ? `https://wa.me/${waDigits}` : null;
  const area = n.area || '';
  const shortName = (n.name.split(/\s+/)[0] || n.name).toUpperCase();
  const tagline = n.brand.tagline || n.displayName;
  const slogan = n.brand.slogan || `${n.displayName} in ${area}`.trim();
  const enabled = sections.enabledIds;

  const hoursList = n.hours.length
    ? n.hours.map((h) => ({ days: h.days || 'Daily', time: h.open && h.close ? `${h.open} - ${h.close}` : h.from && h.to ? `${h.from} - ${h.to}` : null }))
    : [];
  const derivedShort = hoursList.length && hoursList[0].time ? `${hoursList[0].days}: ${hoursList[0].time}` : null;
  const hoursShort = n.hoursShort || derivedShort;

  out['brand.json'] = {
    name: n.name,
    shortName,
    tagline,
    slogan,
    description: `${n.name} — ${tagline}${area ? ` in ${area}` : ''}.`,
    logo: {
      dark: '/logo/logo.png',
      light: '/logo/logo-light.png',
      favicon: '/logo/favicon.png',
      alt: `${n.name} Logo`,
      rounded: true
    },
    heroEyebrow: n.profile.eyebrow || 'Welcome to'
  };

  out['theme.json'] = themeJsonFromTokens(themeTokens, n, { defaultMode });

  const sectionsList = enabled;
  out['business.json'] = {
    name: n.name,
    type: n.category,
    locale: 'en',
    languages: ['en', 'ar'],
    currency: { code: 'EGP', symbol: 'EGP', position: 'after', decimals: 0 },
    phoneDigits: 11,
    sections: sectionsList
  };

  const heroInfo = n.profile.heroInfo
    .map((info) => {
      const fill = (text) =>
        (text || '')
          .replace(/\{address\}/g, n.address || area || 'Our Location')
          .replace(/\{area\}/g, area || n.name)
          .replace(/\{rating\}/g, n.rating !== null ? String(n.ratingRounded) : '{rating}')
          .replace(/\{reviews\}/g, n.reviewCount !== null ? `${n.reviewCount}+` : '{reviews}')
          .replace(/\{hours\}/g, hoursShort || '{hours}');
      return { icon: info.icon, title: fill(info.title), subtitle: fill(info.subtitle) };
    })
    .filter((info) => !/\{[a-z]+\}/.test(`${info.title} ${info.subtitle}`));

  const ctaTarget = enabled.includes('menu') ? '#menu' : enabled.includes('services') ? '#services' : enabled.includes('features') ? '#features' : '#contact';
  out['hero.json'] = {
    eyebrow: n.profile.eyebrow || 'Welcome to',
    title: shortName,
    subtitle: tagline.toUpperCase(),
    slogan,
    description: `${n.brand.tagline || tagline}${n.hasBooking ? ' Book your spot online.' : ' Reach us today.'}`,
    image: { dark: '/hero/dark-hero.jpg', light: '/hero/light-hero.jpg', alt: `${n.name} Ambiance` },
    ctaPrimary: enabled.includes('menu')
      ? { label: 'View Menu', href: '#menu', icon: 'utensils-crossed' }
      : { label: 'Explore', href: ctaTarget, icon: 'sparkles' },
    ctaSecondary: n.hasBooking
      ? { label: 'Book Now', href: '#reservation', icon: 'calendar-check' }
      : { label: 'Contact Us', href: '#contact', icon: 'phone' },
    info: heroInfo
  };

  const navItems = [];
  for (const sid of enabled) {
    const def = { navbar: { label: 'Home', href: '#home' }, menu: { label: 'Menu', href: '#menu' }, services: { label: 'Services', href: '#services' }, stats: { label: 'Stats', href: '#stats' }, offers: { label: 'Offers', href: '#offers' }, reservation: { label: 'Book', href: '#reservation' }, testimonials: { label: 'Reviews', href: '#testimonials' }, gallery: { label: 'Gallery', href: '#gallery' }, features: { label: 'Why Us', href: '#features' }, faq: { label: 'FAQ', href: '#faq' }, contact: { label: 'Contact', href: '#contact' }, location: { label: 'Location', href: '#location' } }[sid];
    if (def) navItems.push(def);
  }
  if (!navItems.some((i) => i.href === '#contact')) navItems.push({ label: 'Contact', href: '#contact' });

  out['navigation.json'] = { items: navItems.slice(0, 7), cta: { ...n.profile.cta, href: n.hasBooking ? '#reservation' : '#contact' } };

  const serviceItems = n.services.map((s, i) => ({ id: s.id || `svc-${i + 1}`, icon: s.icon || 'sparkles', title: s.name || `Service ${i + 1}`, text: s.description || '', link: '#contact' }));
  out['services.json'] = { heading: { eyebrow: 'Our Services', title: 'What we offer' }, items: serviceItems.slice(0, 6) };

  const galleryCount = manifest.groups.gallery.length;
  out['gallery.json'] = {
    heading: { eyebrow: 'Our Gallery', title: 'A glimpse of our place' },
    images: manifest.groups.gallery.map((g) => ({ src: g.placeholder, alt: g.description })),
    moreAria: 'More photos',
    count: galleryCount
  };

  const reviewsItems = n.reviewTexts.slice(0, 3).map((r, i) => ({
    id: i + 1,
    name: r.author || 'Verified Guest',
    role: r.role || null,
    rating: typeof r.rating === 'number' ? Math.round(r.rating) : null,
    text: r.text
  }));
  out['reviews.json'] = { heading: { eyebrow: 'Testimonials', title: 'What our clients say' }, items: reviewsItems };

  const statsItems = [];
  if (n.rating !== null) statsItems.push({ id: 'rating', value: n.ratingRounded, suffix: '/5', label: 'Average Rating', decimals: 1 });
  if (n.reviewCount !== null) statsItems.push({ id: 'reviews', value: n.reviewCount, suffix: '+', label: 'Reviews' });
  if (n.doctors.length) statsItems.push({ id: 'doctors', value: n.doctors.length, suffix: '', label: 'Specialists' });
  if (n.specialties.length) statsItems.push({ id: 'specialties', value: n.specialties.length, suffix: '', label: 'Specialties' });
  if (n.facilities.length) statsItems.push({ id: 'facilities', value: n.facilities.length, suffix: '', label: 'Facilities' });
  out['stats.json'] = { heading: { eyebrow: 'By The Numbers', title: 'Our stats' }, items: statsItems.slice(0, 4) };

  const offers = n.opportunities.slice(0, 3).map((o, i) => ({ id: i + 1, title: o.title, description: o.description || o.title, time: o.time || null, badge: i === 0 ? 'FEATURED' : i === 1 ? 'BEST VALUE' : 'NEW' }));
  out['offers.json'] = {
    heading: { eyebrow: 'Special Offers', title: "Don't miss our offers" },
    items: offers.map((o, i) => ({ id: i + 1, title: o.title, description: o.description, time: o.time || 'Ongoing', badge: o.badge || 'OFFER', image: `/placeholders/food-${(i % 3) + 1}.jpg` })),
    more: { label: 'View All Offers', href: '#offers' }
  };

  const features = n.strengths.slice(0, 3).map((s, i) => ({ id: s.id || `ft-${i + 1}`, icon: 'sparkles', title: s.title || s.id, text: s.evidence || '' }));
  out['features.json'] = { heading: { eyebrow: 'Why Choose Us', title: `The ${n.name} experience` }, items: features.slice(0, 3) };

  const faqItems = [];
  out['faq.json'] = { heading: { eyebrow: 'FAQ', title: 'Frequently asked questions' }, items: faqItems.slice(0, 6) };

  out['footer.json'] = {
    brandDescription: `${n.name} — ${tagline}${area ? `, serving ${area}` : ''}.`,
    quickLinksTitle: 'Quick Links',
    contactTitle: 'Contact Us',
    hoursTitle: 'Opening Hours',
    rights: 'All rights reserved.'
  };

  const addressFull = n.address ? (area && !n.address.toLowerCase().includes(area.toLowerCase()) ? `${n.address}, ${area}` : n.address) : null;
  const addressShort = addressFull && area && !addressFull.toLowerCase().includes(area.toLowerCase()) ? `${addressFull}, ${area}` : addressFull;

  out['contact.json'] = {
    phone: contactPhone || null,
    phoneRaw: phone?.raw ? `+${phone.raw}` : null,
    whatsapp: waPhone?.pretty || null,
    email: n.email || null,
    address: addressFull,
    addressShort,
    area: area || null,
    mapsUrl: n.mapsUrl || (area ? `https://maps.google.com/?q=${encodeURIComponent(area)}` : null),
    mapsEmbed: null,
    mapImage: '/backgrounds/map-dark.png',
    hours: hoursList,
    hoursShort
  };

  const seoDesc = `${n.name} — ${tagline}${area ? ` in ${area}` : ''}. ${n.hasBooking ? 'Book online.' : ''}`;
  const seoKeywords = [n.category, n.name, ...ensureArray(n.brand.keywords), area].filter(Boolean);
  const canonical = n.websiteUrl || null;
  out['seo.json'] = {
    title: `${n.name} | ${tagline}${area ? ` in ${area}` : ''}`.slice(0, 60),
    description: seoDesc.slice(0, 160),
    keywords: seoKeywords.slice(0, 10),
    author: n.name,
    robots: 'index, follow',
    canonical,
    openGraph: { type: 'website', locale: 'en_US', siteName: n.name, title: `${n.name} | ${tagline}`, description: seoDesc, image: manifest.groups.gallery.length ? `/gallery/${manifest.groups.gallery[0].path.split('/').pop()}` : null },
    twitter: { card: 'summary_large_image', title: `${n.name} | ${tagline}`, description: seoDesc, image: '/hero/dark-hero.jpg' },
    schemaType: n.schemaType
  };

  const socialJson = { facebook: '', instagram: '', whatsapp: '', twitter: '', youtube: '', tiktok: '', linkedin: '' };
  for (const s of n.socialLinks) {
    if (socialJson[s.platform] !== undefined && s.url) socialJson[s.platform] = s.url;
  }
  out['social.json'] = socialJson;

  const isFoodCategory = ['cafe', 'restaurant', 'bakery'].includes(n.category);
  out['booking.json'] = {
    enabled: n.hasBooking,
    heading: { eyebrow: 'Book Your Spot', title: 'Book your slot now' },
    fields: isFoodCategory ? { guestsPlaceholder: 'Number of Guests' } : {},
    phoneError: 'Please enter a valid phone number',
    success: 'Thanks! Your request has been received. We will confirm via WhatsApp.',
    submit: { label: 'Book Now', icon: 'calendar-check' },
    note: 'You will receive a confirmation via WhatsApp.',
    method: 'whatsapp',
    ...(isFoodCategory ? { maxGuests: 20 } : {})
  };

  out['menu.json'] = (() => {
    const cats = n.products.length ? uniqueCategories(n.products) : [];
    const dishes = {};
    for (const c of cats) {
      const items = n.products.filter((p) => p.category && c && p.category.toLowerCase().includes(c.id.toLowerCase()));
      dishes[c.id] = items.slice(0, 4).map((p, i) => ({
        id: i + 1,
        name: p.name,
        description: p.description || '',
        price: typeof p.price === 'number' ? p.price : null,
        image: `/placeholders/food-${(i % 3) + 1}.jpg`,
        badges: [],
        available: true
      }));
    }
    return {
      heading: { eyebrow: 'Our Menu', title: 'What are you craving?' },
      categories: cats.map((c, i) => ({ id: c.id, label: c.label, count: (dishes[c.id] || []).length, image: `/placeholders/food-${(i % 3) + 1}.jpg` })),
      dishes,
      itemsSuffix: 'Items',
      addAria: 'View item details',
      more: { label: 'View Full Menu', href: '#menu' }
    };
  })();

  out['i18n.json'] = generateLocalization(n, sections);

  return out;
}

function uniqueCategories(products) {
  const seen = new Set();
  const cats = [];
  for (const p of products) {
    const c = p.category ? slugify(p.category) : null;
    if (c && !seen.has(c)) {
      seen.add(c);
      cats.push({ id: c, label: p.category });
    }
  }
  return cats.slice(0, 6);
}
