export function bundleOf(overrides = {}) {
  const b = {
    'brand.json': {
      name: 'Cairo Roastery', shortName: 'ROASTERY', tagline: 'Specialty coffee, roasted daily', slogan: 'The neighborhood coffee ritual',
      description: 'Cairo Roastery — Specialty coffee, roasted daily in Cairo.', logo: { dark: '/logo/logo.png', light: '/logo/logo-light.png', favicon: '/logo/favicon.png', alt: 'Cairo Roastery Logo', rounded: true }, heroEyebrow: 'Welcome to'
    },
    'theme.json': {
      name: 'dis-cairo-001', defaultMode: 'dark', storageKey: 'site-theme',
      colors: { dark: { base: '24 19 33', 'base-deep': '16 12 22', surface: '38 31 49', 'surface-2': '52 43 65', 'surface-3': '66 55 80', primary: '209 156 93', 'primary-light': '231 187 131', 'primary-dark': '155 110 57', ink: '245 241 233', 'ink-muted': '198 191 179' }, light: { base: '243 238 229', 'base-deep': '235 228 216', surface: '255 255 255', 'surface-2': '238 233 224', 'surface-3': '230 222 210', primary: '166 116 54', 'primary-light': '209 156 93', 'primary-dark': '122 82 34', ink: '34 27 18', 'ink-muted': '110 99 86' } },
      typography: { display: "'Cormorant Garamond', serif", body: "'Nunito Sans', sans-serif", fontsUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Nunito+Sans:wght@300;400;600;700&display=swap' },
      spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2.5rem', '2xl': '4rem' },
      radius: { sm: '0.5rem', md: '0.75rem', lg: '1rem', xl: '1.25rem', full: '9999px' },
      shadows: { primary: '0 4px 24px -4px rgb(var(--c-primary) / 0.35)', 'primary-lg': '0 8px 40px -8px rgb(var(--c-primary) / 0.3)', elevated: '0 12px 48px -12px rgba(0, 0, 0, 0.5)' },
      buttons: { primary: { radius: '0.75rem', paddingX: '1.5rem', paddingY: '0.7rem', fontWeight: '600' }, secondary: { radius: '0.75rem', paddingX: '1.5rem', paddingY: '0.7rem', fontWeight: '600' } },
      cards: { radius: '1rem', padding: '1.5rem', borderOpacity: '0.08' },
      animations: { ease: 'cubic-bezier(0.25, 0.1, 0.25, 1)', spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)', durationFast: '150ms', durationBase: '300ms', durationSlow: '600ms' },
      icons: { strokeWidth: '1.8', sizeSm: '16px', sizeMd: '24px', sizeLg: '36px' },
      gradients: { hero: 'linear-gradient(180deg, rgb(var(--c-base) / 0.92) 0%, rgb(var(--c-base) / 0.55) 45%, rgb(var(--c-base) / 0.92) 100%)', primaryFade: 'linear-gradient(135deg, rgb(var(--c-primary) / 0.25), rgb(var(--c-primary) / 0.05))' }
    },
    'business.json': { name: 'Cairo Roastery', type: 'cafe', locale: 'en', languages: ['en', 'ar'], currency: { code: 'EGP', symbol: 'EGP', position: 'after', decimals: 0 }, phoneDigits: 11, sections: ['navbar', 'hero', 'menu', 'stats', 'offers', 'reservation', 'testimonials', 'gallery', 'location', 'footer'] },
    'hero.json': {
      eyebrow: 'Welcome to', title: 'CAIRO ROASTERY', subtitle: 'SPECIALTY COFFEE, ROASTED DAILY', slogan: 'The neighborhood coffee ritual',
      description: 'Specialty coffee, roasted daily. Book your spot online.', image: { dark: '/hero/dark-hero.jpg', light: '/hero/light-hero.jpg', alt: 'Cairo Roastery Ambiance' },
      ctaPrimary: { label: 'View Menu', href: '#menu', icon: 'utensils-crossed' }, ctaSecondary: { label: 'Book Now', href: '#reservation', icon: 'calendar-check' },
      info: [
        { icon: 'map-pin', title: '12 Tahrir St', subtitle: 'Cairo' },
        { icon: 'clock', title: 'Open Daily', subtitle: '7:00 AM - 12:00 AM' },
        { icon: 'star', title: '4.2 Rating', subtitle: '(230+ Reviews)' },
        { icon: 'wifi', title: 'Free Wi-Fi', subtitle: 'Remote-work friendly' }
      ]
    },
    'navigation.json': {
      items: [
        { label: 'Home', href: '#home' }, { label: 'Menu', href: '#menu' }, { label: 'Stats', href: '#stats' }, { label: 'Offers', href: '#offers' },
        { label: 'Book', href: '#reservation' }, { label: 'Reviews', href: '#testimonials' }, { label: 'Contact', href: '#contact' }
      ],
      cta: { label: 'Order Now', href: '#menu', icon: 'shopping-bag' }
    },
    'services.json': { heading: { eyebrow: 'Our Services', title: 'What we offer' }, items: [ { id: 'dine-in', icon: 'utensils-crossed', title: 'Dine In', text: 'A warm atmosphere for family and friends.', link: '#reservation' }, { id: 'takeaway', icon: 'shopping-bag', title: 'Takeaway', text: 'Order ahead and pick up fresh.', link: '#menu' }, { id: 'events', icon: 'party-popper', title: 'Events & Catering', text: 'Birthdays, gatherings and corporate catering.', link: '#contact' } ] },
    'gallery.json': { heading: { eyebrow: 'Our Gallery', title: 'A glimpse of our place' }, images: [ { src: '/gallery/abc123.jpg', alt: 'Gallery photo 1' }, { src: '/gallery/def456.jpg', alt: 'Gallery photo 2' }, { src: '/gallery/ghi789.jpg', alt: 'Gallery photo 3' }, { src: '/gallery/jkl012.jpg', alt: 'Gallery photo 4' } ], moreAria: 'More photos', count: 4 },
    'reviews.json': { heading: { eyebrow: 'Testimonials', title: 'What our clients say' }, items: [ { id: 1, name: 'Ahmed Hassan', role: 'Regular Guest', rating: 4, text: 'Best experience in the area — highly recommended.' }, { id: 2, name: 'Mona Adel', role: 'First Time Visitor', rating: 5, text: 'Great quality and even better service. Will come back.' }, { id: 3, name: 'Youssef Nabil', role: 'Long-time Client', rating: 5, text: 'A hidden gem. The team really cares about their craft.' } ] },
    'stats.json': { heading: { eyebrow: 'By The Numbers', title: 'Our stats' }, items: [ { id: 'rating', value: 4.2, suffix: '/5', label: 'Average Rating', decimals: 1 }, { id: 'reviews', value: 230, suffix: '+', label: 'Reviews' }, { id: 'origins', value: 14, suffix: '+', label: 'Coffee Origins' }, { id: 'cups', value: 40000, suffix: '+', label: 'Cups Served' } ] },
    'faq.json': { heading: { eyebrow: 'FAQ', title: 'Frequently asked questions' }, items: [ { id: 1, question: 'Do you offer delivery?', answer: 'Yes — fast delivery across the area through our website.' }, { id: 2, question: 'Can I reserve a table online?', answer: 'Absolutely. Use the reservation form and we will confirm via WhatsApp.' }, { id: 3, question: 'Do you handle events and gatherings?', answer: 'Yes, contact us and our team will plan the perfect event for you.' } ] },
    'footer.json': { brandDescription: 'Cairo Roastery — Specialty coffee, roasted daily, serving Cairo.', quickLinksTitle: 'Quick Links', contactTitle: 'Contact Us', hoursTitle: 'Opening Hours', rights: 'All rights reserved.' },
    'contact.json': { phone: '+20 2 2735 7788', phoneRaw: '+2027357788', whatsapp: '+20 2 2735 7788', email: 'hi@roastery.com', address: '12 Tahrir St, Cairo', addressShort: '12 Tahrir St, Cairo', area: 'Cairo', mapsUrl: 'https://maps.google.com/?q=Cairo%20Roastery', mapsEmbed: null, hours: [ { days: 'Monday - Sunday', time: '7:00 AM - 12:00 AM' } ], hoursShort: 'Monday - Sunday: 7:00 AM - 12:00 AM' },
    'seo.json': {
      title: 'Cairo Roastery | Specialty coffee, roasted daily in Cairo',
      description: 'Cairo Roastery — Specialty coffee, roasted daily in Cairo. Book online.', keywords: ['cafe', 'Cairo Roastery', 'Cairo'], author: 'Cairo Roastery', robots: 'index, follow',
      canonical: 'https://roastery.example',
      openGraph: { type: 'website', locale: 'en_US', siteName: 'Cairo Roastery', title: 'Cairo Roastery | Specialty coffee, roasted daily', description: 'Cairo Roastery — Specialty coffee, roasted daily in Cairo. Book online.', image: '/gallery/abc123.jpg' },
      twitter: { card: 'summary_large_image', title: 'Cairo Roastery | Specialty coffee, roasted daily', description: 'Cairo Roastery — Specialty coffee, roasted daily in Cairo. Book online.', image: '/hero/dark-hero.jpg' },
      schemaType: 'CafeOrCoffeeShop'
    },
    'social.json': { facebook: 'https://facebook.com/roastery', instagram: 'https://instagram.com/roastery', whatsapp: 'https://wa.me/2027357788', twitter: '', youtube: '', tiktok: '', linkedin: '' },
    'booking.json': { enabled: true, heading: { eyebrow: 'Book Your Spot', title: 'Book your slot now' }, fields: { guestsPlaceholder: 'Number of Guests', phonePlaceholder: 'Phone Number (11 digits)' }, phoneError: 'Please enter a valid 11-digit phone number', success: 'Thanks! Your request has been received. We will confirm via WhatsApp.', submit: { label: 'Find a Table', icon: 'search' }, note: 'You will receive a confirmation via WhatsApp.', method: 'whatsapp', maxGuests: 20 },
    'offers.json': { heading: { eyebrow: 'Special Offers', title: "Don't miss our offers" }, items: [ { id: 1, title: 'Morning Boost Combo', description: 'Any specialty coffee + fresh bakery of your choice', time: 'Daily from 8:00 AM - 12:00 PM', badge: 'SAVE 20%', image: '/placeholders/food-1.jpg' }, { id: 2, title: 'Golden Hour Deal', description: '30% off all pour-over brews after 5:00 PM', time: 'Daily from 5:00 PM', badge: 'SAVE 30%', image: '/placeholders/food-2.jpg' } ], more: { label: 'View All Offers', href: '#offers' } },
    'features.json': { heading: { eyebrow: 'Why Choose Us', title: 'The Cairo Roastery experience' }, items: [ { id: 'fresh', icon: 'sparkles', title: 'Fresh Ingredients', text: 'Every cup and plate starts with carefully selected, market-fresh ingredients.' }, { id: 'craft', icon: 'coffee', title: 'Master Roasting', text: 'Single-origin beans roasted and brewed to order by passionate baristas.' }, { id: 'ambiance', icon: 'heart', title: 'Cozy Ambiance', text: 'A warm corner designed for reading, working and long conversations.' } ] },
    'menu.json': {
      heading: { eyebrow: 'Our Menu', title: 'What are you craving?' },
      categories: [ { id: 'espresso', label: 'Espresso', count: 2, image: '/placeholders/food-1.jpg' }, { id: 'brew', label: 'Brewed Coffee', count: 2, image: '/placeholders/food-2.jpg' } ],
      dishes: {
        espresso: [ { id: 1, name: 'Signature Espresso', description: 'Single-origin double shot', price: 60, image: '/placeholders/food-1.jpg', badges: [], available: true }, { id: 2, name: 'Cortado', description: 'Espresso with silky milk', price: 70, image: '/placeholders/food-2.jpg', badges: [], available: true } ],
        brew: [ { id: 3, name: 'V60 Pour Over', description: 'Hand-brewed, floral and bright', price: 90, image: '/placeholders/food-3.jpg', badges: [], available: true }, { id: 4, name: 'Cold Brew', description: '18-hour slow steep', price: 80, image: '/placeholders/food-1.jpg', badges: [], available: true } ]
      },
      itemsSuffix: 'Items', addAria: 'View item details', more: { label: 'View Full Menu', href: '#menu' }
    },
    'i18n.json': { businessId: 'dis-cairo-001', locale: 'en', languages: ['en', 'ar'], labels: { nav: { ariaOpen: 'Open menu', ariaClose: 'Close menu', home: 'Home' }, theme: { aria: 'Toggle dark/light mode' }, common: {}, sections: {} } }
  };
  return { ...b, ...overrides };
}

export const MANIFEST = {
  businessId: 'dis-cairo-001', generated: true, downloaded: false, count: 16,
  groups: {
    logos: [ { path: '/logo/logo.png', role: 'dark', description: 'Logo on dark backgrounds', source: 'client' }, { path: '/logo/logo-light.png', role: 'light', description: 'Logo on light backgrounds', source: 'client' }, { path: '/logo/favicon.png', role: 'favicon', description: 'Site favicon', source: 'client' } ],
    hero: [ { path: '/hero/dark-hero.jpg', role: 'dark', description: 'Hero image for dark mode', source: 'unsplash' }, { path: '/hero/light-hero.jpg', role: 'light', description: 'Hero image for light mode', source: 'unsplash' } ],
    gallery: [ { path: '/gallery/abc123.jpg', index: 1, description: 'Gallery photo 1', source: 'unsplash', placeholder: '/placeholders/gallery-1.jpg' }, { path: '/gallery/def456.jpg', index: 2, description: 'Gallery photo 2', source: 'unsplash', placeholder: '/placeholders/gallery-2.jpg' }, { path: '/gallery/ghi789.jpg', index: 3, description: 'Gallery photo 3', source: 'unsplash', placeholder: '/placeholders/gallery-3.jpg' }, { path: '/gallery/jkl012.jpg', index: 4, description: 'Gallery photo 4', source: 'unsplash', placeholder: '/placeholders/gallery-4.jpg' } ],
    food: [], videos: [], icons: [ { path: '/icons/favicon.svg', role: 'favicon', source: 'generated' } ], backgrounds: [ { path: '/backgrounds/map-dark.png', role: 'map-dark', source: 'generated' } ],
    placeholders: [ { path: '/placeholders/food-1.jpg', role: 'food', source: 'generated' }, { path: '/placeholders/food-2.jpg', role: 'food', source: 'generated' }, { path: '/placeholders/food-3.jpg', role: 'food', source: 'generated' }, { path: '/placeholders/gallery-1.jpg', role: 'gallery', source: 'generated' } ]
  },
  references: ['/logo/logo.png', '/logo/logo-light.png', '/logo/favicon.png', '/hero/dark-hero.jpg', '/hero/light-hero.jpg', '/gallery/abc123.jpg', '/gallery/def456.jpg', '/gallery/ghi789.jpg', '/gallery/jkl012.jpg', '/icons/favicon.svg', '/backgrounds/map-dark.png', '/placeholders/food-1.jpg', '/placeholders/food-2.jpg', '/placeholders/food-3.jpg', '/placeholders/gallery-1.jpg', '/placeholders/gallery-2.jpg', '/placeholders/gallery-3.jpg', '/placeholders/gallery-4.jpg']
};
