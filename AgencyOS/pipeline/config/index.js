import { generateThemeTokens, themeJsonFromTokens } from '../theme.js';
import { generateLocalization } from '../localization.js';
import { clamp, ensureArray, seededRng, slugify } from '../utils.js';

const REVIEW_NAMES = ['Ahmed Hassan', 'Mona Adel', 'Youssef Nabil', 'Laila Kamel', 'Omar Farouk', 'Sara Mostafa', 'Karim El Sayed', 'Nourhan Ali', 'Tarek Mahmoud', 'Hana Youssef', 'Mostafa Ibrahim', 'Dina Samir', 'Sherif Adel', 'Mariam Fathy', 'Hassan Amr'];
const REVIEW_ROLES = ['Regular Guest', 'First Time Visitor', 'Long-time Client', 'Neighborhood Regular', 'Frequent Visitor'];
const REVIEW_TEXTS = [
  'Best experience in the area — highly recommended.',
  'Great quality and even better service. Will come back.',
  'A hidden gem. The team really cares about their craft.',
  'Top notch from start to finish. Booking was effortless.',
  'Consistently excellent. This is my favorite spot now.',
  'Friendly staff, fair prices and a wonderful atmosphere.'
];

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
  const rand = seededRng(`config:${n.id}`);
  const phone = fmtPhone(n.phone || null);
  const contactPhone = phone?.pretty || null;
  const waPhone = fmtPhone(n.whatsapp || n.phone || null);
  const waDigits = waPhone ? waPhone.raw : null;
  const whatsappUrl = waDigits ? `https://wa.me/${waDigits}` : null;
  const area = n.area || '';
  const shortName = (n.name.split(/\s+/)[0] || n.name).toUpperCase();
  const tagline = n.brand.tagline || n.displayName;
  const slogan = n.brand.slogan || `${n.displayName} in ${area}`.trim();
  const enabled = sections.enabledIds;

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

  const heroInfo = n.profile.heroInfo.map((info) => {
    const title = info.title.replace('{address}', n.address || area || 'Our Location').replace('{area}', area || n.name);
    const subtitle = info.subtitle
      .replace('{area}', area || n.name)
      .replace('{rating}', String(n.ratingRounded))
      .replace('{reviews}', n.reviewCount !== null ? `${n.reviewCount}+` : '50+');
    return { icon: info.icon, title, subtitle };
  });

  out['hero.json'] = {
    eyebrow: n.profile.eyebrow || 'Welcome to',
    title: shortName,
    subtitle: tagline.toUpperCase(),
    slogan,
    description: `${n.brand.tagline || tagline}${n.hasBooking ? ' Book your spot online.' : ' Reach us today.'}`,
    image: { dark: '/hero/dark-hero.jpg', light: '/hero/light-hero.jpg', alt: `${n.name} Ambiance` },
    ctaPrimary: enabled.includes('menu')
      ? { label: 'View Menu', href: '#menu', icon: 'utensils-crossed' }
      : { label: 'Explore', href: '#services', icon: 'sparkles' },
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

  const serviceItems = n.services.length ? n.services.map((s, i) => ({ id: s.id || `svc-${i + 1}`, icon: s.icon || 'sparkles', title: s.name || `Service ${i + 1}`, text: s.description || '', link: '#contact' })) : n.profile.services;
  out['services.json'] = { heading: { eyebrow: 'Our Services', title: 'What we offer' }, items: serviceItems.slice(0, 6) };

  const galleryCount = manifest.groups.gallery.length;
  out['gallery.json'] = {
    heading: { eyebrow: 'Our Gallery', title: 'A glimpse of our place' },
    images: manifest.groups.gallery.map((g) => ({ src: g.placeholder, alt: g.description })),
    moreAria: 'More photos',
    count: galleryCount
  };

  const reviewCount = n.reviewCount !== null ? Math.min(3, Math.max(1, Math.round(n.reviewCount / 20))) : 3;
  const reviewNames = rand.shuffle(REVIEW_NAMES);
  const reviewsItems = Array.from({ length: reviewCount }, (_, i) => ({
    id: i + 1,
    name: reviewNames[i % reviewNames.length],
    role: REVIEW_ROLES[rand.int(REVIEW_ROLES.length)],
    rating: n.rating !== null ? Math.round(clamp(n.rating, 4, 5)) : 5,
    text: REVIEW_TEXTS[rand.int(REVIEW_TEXTS.length)]
  }));
  out['reviews.json'] = { heading: { eyebrow: 'Testimonials', title: 'What our clients say' }, items: reviewsItems };

  const statsItems = [];
  if (n.rating !== null) statsItems.push({ id: 'rating', value: n.ratingRounded, suffix: '/5', label: 'Average Rating', decimals: 1 });
  if (n.reviewCount !== null) statsItems.push({ id: 'reviews', value: n.reviewCount, suffix: '+', label: 'Reviews' });
  for (const s of n.profile.stats) statsItems.push(s);
  out['stats.json'] = { heading: { eyebrow: 'By The Numbers', title: 'Our stats' }, items: statsItems.slice(0, 4) };

  const offers = n.opportunities.length ? n.opportunities.slice(0, 3).map((o, i) => ({ id: i + 1, title: o.title, description: o.title, time: 'Ongoing', badge: i === 0 ? 'FEATURED' : i === 1 ? 'BEST VALUE' : 'NEW' })) : n.profile.offers;
  out['offers.json'] = {
    heading: { eyebrow: 'Special Offers', title: "Don't miss our offers" },
    items: offers.map((o, i) => ({ id: i + 1, title: o.title, description: o.description, time: o.time || 'Ongoing', badge: o.badge || 'OFFER', image: `/placeholders/food-${(i % 3) + 1}.jpg` })),
    more: { label: 'View All Offers', href: '#offers' }
  };

  const features = n.strengths.length ? n.strengths.slice(0, 3).map((s, i) => ({ id: s.id || `ft-${i + 1}`, icon: 'sparkles', title: s.title || s.id, text: s.evidence || '' })) : n.profile.features;
  out['features.json'] = { heading: { eyebrow: 'Why Choose Us', title: `The ${n.name} experience` }, items: features.slice(0, 3) };

  const faqItems = n.profile.faq.map((f, i) => ({ id: i + 1, question: f.q, answer: f.a }));
  out['faq.json'] = { heading: { eyebrow: 'FAQ', title: 'Frequently asked questions' }, items: faqItems.slice(0, 6) };

  out['footer.json'] = {
    brandDescription: `${n.name} — ${tagline}${area ? `, serving ${area}` : ''}.`,
    quickLinksTitle: 'Quick Links',
    contactTitle: 'Contact Us',
    hoursTitle: 'Opening Hours',
    rights: 'All rights reserved.'
  };

  const hoursList = n.hours.length
    ? n.hours.map((h) => ({ days: h.days || 'Daily', time: `${h.from || '10:00 AM'} - ${h.to || '10:00 PM'}` }))
    : [{ days: 'Monday - Sunday', time: '10:00 AM - 10:00 PM' }];

  out['contact.json'] = {
    phone: contactPhone || null,
    phoneRaw: phone?.raw ? `+${phone.raw}` : null,
    whatsapp: contactPhone || null,
    email: n.email || null,
    address: n.address ? `${n.address}${area ? `, ${area}` : ''}` : null,
    addressShort: n.address ? `${n.address}, ${area}` : null,
    area: area || null,
    mapsUrl: n.mapsUrl || (area ? `https://maps.google.com/?q=${encodeURIComponent(area)}` : null),
    mapsEmbed: null,
    hours: hoursList,
    hoursShort: n.hoursShort || `${hoursList[0].days}: ${hoursList[0].time}`
  };

  const seoDesc = `${n.name} — ${tagline}${area ? ` in ${area}` : ''}. ${n.hasBooking ? 'Book online.' : ''}`;
  const seoKeywords = [n.category, n.name, ...ensureArray(n.brand.keywords), area].filter(Boolean);
  const canonical = n.websiteUrl || `https://${slugify(n.name)}.example.com`;
  out['seo.json'] = {
    title: `${n.name} | ${tagline}${area ? ` in ${area}` : ''}`.slice(0, 60),
    description: seoDesc.slice(0, 160),
    keywords: seoKeywords.slice(0, 10),
    author: n.name,
    robots: 'index, follow',
    canonical,
    openGraph: { type: 'website', locale: 'en_US', siteName: n.name, title: `${n.name} | ${tagline}`, description: seoDesc, image: '/gallery/' + (manifest.groups.gallery[0]?.path.split('/').pop() || 'gallery-1.jpg') },
    twitter: { card: 'summary_large_image', title: `${n.name} | ${tagline}`, description: seoDesc, image: '/hero/dark-hero.jpg' },
    schemaType: n.schemaType
  };

  out['social.json'] = {
    facebook: n.socialLinks.find((s) => s.platform === 'facebook')?.url || '',
    instagram: n.socialLinks.find((s) => s.platform === 'instagram')?.url || '',
    whatsapp: whatsappUrl || '',
    twitter: '',
    youtube: '',
    tiktok: '',
    linkedin: ''
  };

  out['booking.json'] = {
    enabled: n.hasBooking,
    heading: { eyebrow: 'Book Your Spot', title: 'Book your slot now' },
    fields: { guestsPlaceholder: 'Number of Guests', phonePlaceholder: 'Phone Number (11 digits)' },
    phoneError: 'Please enter a valid 11-digit phone number',
    success: 'Thanks! Your request has been received. We will confirm via WhatsApp.',
    submit: { label: n.hasBooking ? 'Find a Table' : 'Send Request', icon: 'search' },
    note: 'You will receive a confirmation via WhatsApp.',
    method: 'whatsapp',
    maxGuests: 20
  };

  out['menu.json'] = (() => {
    const cats = n.products.length ? uniqueCategories(n.products, n.profile.menu) : n.profile.menu;
    const dishes = {};
    for (const c of cats) {
      const items = n.products.filter((p) => !c || (p.category || '').toLowerCase().includes(c.id.toLowerCase()) || !p.category);
      dishes[c.id] = items.slice(0, 4).map((p, i) => ({
        id: i + 1,
        name: p.name || `${c.label} ${i + 1}`,
        description: p.description || '',
        price: p.price || 60 + (i * 15),
        image: `/placeholders/food-${(i % 3) + 1}.jpg`,
        badges: [],
        available: true
      }));
    }
    return {
      heading: { eyebrow: 'Our Menu', title: 'What are you craving?' },
      categories: cats.map((c, i) => ({ id: c.id, label: c.label, count: (dishes[c.id] || []).length || 4, image: `/placeholders/food-${(i % 3) + 1}.jpg` })),
      dishes,
      itemsSuffix: 'Items',
      addAria: 'View item details',
      more: { label: 'View Full Menu', href: '#menu' }
    };
  })();

  out['i18n.json'] = generateLocalization(n, sections);

  return out;
}

function uniqueCategories(products, profileMenu) {
  const seen = new Set();
  const cats = [];
  for (const p of products) {
    const c = p.category ? slugify(p.category) : null;
    if (c && !seen.has(c)) {
      seen.add(c);
      cats.push({ id: c, label: p.category });
    }
  }
  for (const m of profileMenu) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      cats.push(m);
    }
  }
  return cats.slice(0, 6);
}
