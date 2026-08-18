export const PROFILES = {
  cafe: {
    displayName: 'Café',
    schemaType: 'CafeOrCoffeeShop',
    palette: { primary: '209 156 93', base: '24 19 33', ink: '245 241 233' },
    fonts: { display: "'Cormorant Garamond', serif", body: "'Nunito Sans', sans-serif" },
    heroInfo: [
      { icon: 'map-pin', title: '{address}', subtitle: '{area}' },
      { icon: 'clock', title: 'Open Hours', subtitle: '{hours}' },
      { icon: 'star', title: '{rating} Rating', subtitle: '({reviews} Reviews)' },

    ],
    sections: ['navbar', 'hero', 'menu', 'stats', 'offers', 'reservation', 'testimonials', 'gallery', 'location', 'footer'],
    cta: { label: 'Order Now', href: '#menu', icon: 'shopping-bag' },
    eyebrow: 'Welcome to'
  },

  restaurant: {
    displayName: 'Restaurant',
    schemaType: 'Restaurant',
    palette: { primary: '214 122 64', base: '26 18 15', ink: '250 245 240' },
    fonts: { display: "'Playfair Display', serif", body: "'Inter', sans-serif" },
    heroInfo: [
      { icon: 'map-pin', title: '{address}', subtitle: '{area}' },
      { icon: 'clock', title: 'Open Hours', subtitle: '{hours}' },
      { icon: 'star', title: '{rating} Rating', subtitle: '({reviews} Reviews)' },

    ],
    sections: ['navbar', 'hero', 'menu', 'stats', 'offers', 'reservation', 'testimonials', 'gallery', 'location', 'footer'],
    cta: { label: 'Order Now', href: '#menu', icon: 'shopping-bag' },
    eyebrow: 'Welcome to'
  },

  gym: {
    displayName: 'Gym & Fitness Club',
    schemaType: 'ExerciseGym',
    palette: { primary: '255 92 92', base: '15 17 21', ink: '248 250 252' },
    fonts: { display: "'Oswald', sans-serif", body: "'Inter', sans-serif" },
    heroInfo: [
      { icon: 'map-pin', title: '{address}', subtitle: '{area}' },
      { icon: 'clock', title: 'Open Hours', subtitle: '{hours}' },
      { icon: 'star', title: '{rating} Rating', subtitle: '({reviews} Reviews)' },

    ],
    sections: ['navbar', 'hero', 'stats', 'features', 'offers', 'reservation', 'testimonials', 'gallery', 'contact', 'location', 'footer'],
    cta: { label: 'Join Now', href: '#reservation', icon: 'id-card' },
    eyebrow: 'Welcome to'
  },

  tailor: {
    displayName: 'Tailor & Alterations',
    schemaType: 'LocalBusiness',
    palette: { primary: '120 160 200', base: '18 21 26', ink: '245 248 252' },
    fonts: { display: "'Merriweather', serif", body: "'Source Sans 3', sans-serif" },
    heroInfo: [
      { icon: 'map-pin', title: '{address}', subtitle: '{area}' },
      { icon: 'clock', title: 'Open Hours', subtitle: '{hours}' },
      { icon: 'star', title: '{rating} Rating', subtitle: '({reviews} Reviews)' },

    ],
    sections: ['navbar', 'hero', 'stats', 'features', 'testimonials', 'gallery', 'contact', 'location', 'footer'],
    cta: { label: 'Get a Quote', href: '#contact', icon: 'scissors' },
    eyebrow: 'Welcome to'
  },

  bakery: {
    displayName: 'Bakery',
    schemaType: 'Bakery',
    palette: { primary: '212 152 74', base: '28 20 14', ink: '250 244 236' },
    fonts: { display: "'Fraunces', serif", body: "'Nunito Sans', sans-serif" },
    heroInfo: [
      { icon: 'map-pin', title: '{address}', subtitle: '{area}' },
      { icon: 'clock', title: 'Open Hours', subtitle: '{hours}' },
      { icon: 'star', title: '{rating} Rating', subtitle: '({reviews} Reviews)' },

    ],
    sections: ['navbar', 'hero', 'menu', 'stats', 'offers', 'testimonials', 'gallery', 'contact', 'location', 'footer'],
    cta: { label: 'Order Now', href: '#menu', icon: 'shopping-bag' },
    eyebrow: 'Welcome to'
  },

  barber: {
    displayName: 'Barbershop',
    schemaType: 'Barbershop',
    palette: { primary: '230 180 92', base: '20 18 16', ink: '248 244 238' },
    fonts: { display: "'Bebas Neue', sans-serif", body: "'Inter', sans-serif" },
    heroInfo: [
      { icon: 'map-pin', title: '{address}', subtitle: '{area}' },
      { icon: 'clock', title: 'Open Hours', subtitle: '{hours}' },
      { icon: 'star', title: '{rating} Rating', subtitle: '({reviews} Reviews)' },

    ],
    sections: ['navbar', 'hero', 'services', 'stats', 'offers', 'testimonials', 'gallery', 'reservation', 'location', 'footer'],
    cta: { label: 'Book Now', href: '#reservation', icon: 'calendar-check' },
    eyebrow: 'Welcome to'
  },

  salon: {
    displayName: 'Beauty Salon',
    schemaType: 'BeautySalon',
    palette: { primary: '220 140 170', base: '26 18 24', ink: '250 246 248' },
    fonts: { display: "'Playfair Display', serif", body: "'Nunito Sans', sans-serif" },
    heroInfo: [
      { icon: 'map-pin', title: '{address}', subtitle: '{area}' },
      { icon: 'clock', title: 'Open Hours', subtitle: '{hours}' },
      { icon: 'star', title: '{rating} Rating', subtitle: '({reviews} Reviews)' },

    ],
    sections: ['navbar', 'hero', 'services', 'stats', 'offers', 'testimonials', 'gallery', 'reservation', 'location', 'footer'],
    cta: { label: 'Book Now', href: '#reservation', icon: 'calendar-check' },
    eyebrow: 'Welcome to'
  },

  clinic: {
    displayName: 'Medical Clinic',
    schemaType: 'MedicalClinic',
    palette: { primary: '96 165 250', base: '16 20 26', ink: '246 250 254' },
    fonts: { display: "'Lora', serif", body: "'Inter', sans-serif" },
    heroInfo: [
      { icon: 'map-pin', title: '{address}', subtitle: '{area}' },
      { icon: 'clock', title: 'Open Hours', subtitle: '{hours}' },
      { icon: 'star', title: '{rating} Rating', subtitle: '({reviews} Reviews)' },

    ],
    sections: ['navbar', 'hero', 'services', 'stats', 'testimonials', 'gallery', 'reservation', 'location', 'footer'],
    cta: { label: 'Book a Visit', href: '#reservation', icon: 'calendar-check' },
    eyebrow: 'Welcome to'
  },

  shop: {
    displayName: 'Shop',
    schemaType: 'Store',
    palette: { primary: '99 192 160', base: '17 22 21', ink: '246 251 249' },
    fonts: { display: "'Outfit', sans-serif", body: "'Inter', sans-serif" },
    heroInfo: [
      { icon: 'map-pin', title: '{address}', subtitle: '{area}' },
      { icon: 'clock', title: 'Open Hours', subtitle: '{hours}' },
      { icon: 'star', title: '{rating} Rating', subtitle: '({reviews} Reviews)' },

    ],
    sections: ['navbar', 'hero', 'features', 'stats', 'offers', 'testimonials', 'gallery', 'menu', 'contact', 'location', 'footer'],
    cta: { label: 'Shop Now', href: '#menu', icon: 'shopping-bag' },
    eyebrow: 'Welcome to'
  },

  pharmacy: {
    displayName: 'Pharmacy',
    schemaType: 'Pharmacy',
    palette: { primary: '80 200 150', base: '14 24 21', ink: '247 252 250' },
    fonts: { display: "'Lora', serif", body: "'Inter', sans-serif" },
    heroInfo: [
      { icon: 'map-pin', title: '{address}', subtitle: '{area}' },
      { icon: 'clock', title: 'Open Hours', subtitle: '{hours}' },
      { icon: 'star', title: '{rating} Rating', subtitle: '({reviews} Reviews)' },

    ],
    sections: ['navbar', 'hero', 'features', 'stats', 'testimonials', 'gallery', 'contact', 'location', 'footer'],
    cta: { label: 'Order Now', href: '#contact', icon: 'truck' },
    eyebrow: 'Welcome to'
  },

  other: {
    displayName: 'Local Business',
    schemaType: 'LocalBusiness',
    palette: { primary: '120 140 200', base: '18 20 26', ink: '246 248 252' },
    fonts: { display: "'Sora', sans-serif", body: "'Inter', sans-serif" },
    heroInfo: [
      { icon: 'map-pin', title: '{address}', subtitle: '{area}' },
      { icon: 'clock', title: 'Open Hours', subtitle: '{hours}' },
      { icon: 'star', title: '{rating} Rating', subtitle: '({reviews} Reviews)' },

    ],
    sections: ['navbar', 'hero', 'features', 'stats', 'testimonials', 'gallery', 'reservation', 'contact', 'location', 'footer'],
    cta: { label: 'Book Now', href: '#reservation', icon: 'calendar-check' },
    eyebrow: 'Welcome to'
  }
};

export function profileFor(category) {
  return PROFILES[category] || PROFILES.other;
}

export function categoryList() {
  return Object.keys(PROFILES);
}
