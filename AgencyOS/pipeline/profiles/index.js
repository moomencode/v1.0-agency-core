export const PROFILES = {
  cafe: {
    displayName: 'Café',
    schemaType: 'CafeOrCoffeeShop',
    palette: { primary: '209 156 93', base: '24 19 33', ink: '245 241 233' },
    fonts: { display: "'Cormorant Garamond', serif", body: "'Nunito Sans', sans-serif" },
    services: [
      { id: 'dine-in', icon: 'utensils-crossed', title: 'Dine In', text: 'A warm atmosphere for family and friends.', link: '#reservation' },
      { id: 'takeaway', icon: 'shopping-bag', title: 'Takeaway', text: 'Order ahead and pick up fresh.', link: '#menu' },
      { id: 'events', icon: 'party-popper', title: 'Events & Catering', text: 'Birthdays, gatherings and corporate catering.', link: '#contact' }
    ],
    features: [
      { id: 'fresh', icon: 'sparkles', title: 'Fresh Ingredients', text: 'Every cup and plate starts with carefully selected, market-fresh ingredients.' },
      { id: 'craft', icon: 'coffee', title: 'Master Roasting', text: 'Single-origin beans roasted and brewed to order by passionate baristas.' },
      { id: 'ambiance', icon: 'heart', title: 'Cozy Ambiance', text: 'A warm corner designed for reading, working and long conversations.' }
    ],
    faq: [],
    stats: [],
    offers: [],
    menu: [
      { id: 'espresso', label: 'Espresso' },
      { id: 'brew', label: 'Brewed Coffee' },
      { id: 'pastries', label: 'Pastries' },
      { id: 'cold', label: 'Cold Drinks' }
    ],
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
    services: [
      { id: 'dine-in', icon: 'utensils-crossed', title: 'Dine In', text: 'Full table service with a warm atmosphere.', link: '#reservation' },
      { id: 'takeaway', icon: 'shopping-bag', title: 'Takeaway', text: 'Order ahead and pick up fresh.', link: '#menu' },
      { id: 'catering', icon: 'party-popper', title: 'Catering', text: 'Corporate and private events catered to order.', link: '#contact' }
    ],
    features: [
      { id: 'fresh', icon: 'sparkles', title: 'Fresh Ingredients', text: 'Every dish starts with carefully selected, market-fresh ingredients.' },
      { id: 'chefs', icon: 'chef-hat', title: 'Expert Chefs', text: 'A passionate kitchen team crafting authentic recipes with love.' },
      { id: 'delivery', icon: 'rocket', title: 'Fast Delivery', text: 'Hot, fresh and on time — right to your door.' }
    ],
    faq: [],
    stats: [],
    offers: [],
    menu: [
      { id: 'starters', label: 'Starters' },
      { id: 'mains', label: 'Main Courses' },
      { id: 'grills', label: 'Grills' },
      { id: 'desserts', label: 'Desserts' }
    ],
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
    services: [
      { id: 'memberships', icon: 'id-card', title: 'Memberships', text: 'Flexible monthly and yearly plans with no lock-in.', link: '#reservation' },
      { id: 'training', icon: 'dumbbell', title: 'Personal Training', text: 'Certified coaches build a plan around your goals.', link: '#contact' },
      { id: 'classes', icon: 'users', title: 'Group Classes', text: 'HIIT, spinning and strength classes every day.', link: '#contact' }
    ],
    features: [
      { id: 'equipment', icon: 'dumbbell', title: 'Modern Equipment', text: 'A full floor of the latest strength and cardio machines.' },
      { id: 'coaches', icon: 'medal', title: 'Certified Coaches', text: 'Expert trainers who track your progress with you.' },
      { id: 'hours', icon: 'clock', title: 'Extended Hours', text: 'Open early and late so training fits your schedule.' }
    ],
    faq: [],
    stats: [],
    offers: [],
    menu: [],
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
    services: [
      { id: 'custom', icon: 'scissors', title: 'Custom Tailoring', text: 'Made-to-measure suits and outfits, fitted to you.', link: '#contact' },
      { id: 'alterations', icon: 'ruler', title: 'Alterations', text: 'Precise adjustments on hems, waists and sleeves.', link: '#contact' },
      { id: 'repairs', icon: 'needle', title: 'Repairs', text: 'Zippers, buttons and fabric repairs done right.', link: '#contact' }
    ],
    features: [
      { id: 'precision', icon: 'ruler', title: 'Precision Fit', text: 'Every garment measured and fitted by hand.' },
      { id: 'fabric', icon: 'layers', title: 'Premium Fabrics', text: 'Curated fabrics and linings from trusted mills.' },
      { id: 'speed', icon: 'clock', title: 'Fast Turnaround', text: 'Most alterations ready within 48 hours.' }
    ],
    faq: [],
    stats: [],
    offers: [],
    menu: [],
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
    services: [
      { id: 'fresh', icon: 'croissant', title: 'Fresh Daily', text: 'Baked from scratch every morning.', link: '#menu' },
      { id: 'custom', icon: 'cake', title: 'Custom Cakes', text: 'Birthday and celebration cakes made to order.', link: '#contact' },
      { id: 'delivery', icon: 'shopping-bag', title: 'Delivery', text: 'Fresh bakes delivered to your door.', link: '#menu' }
    ],
    features: [
      { id: 'morning', icon: 'sunrise', title: 'Baked Daily', text: 'Ovens start before sunrise so bread is always fresh.' },
      { id: 'recipes', icon: 'book-heart', title: 'Family Recipes', text: 'Time-honored recipes passed down with love.' },
      { id: 'custom', icon: 'cake', title: 'Custom Cakes', text: 'Cakes designed around your celebration.' }
    ],
    faq: [],
    stats: [],
    offers: [],
    menu: [
      { id: 'breads', label: 'Breads' },
      { id: 'pastries', label: 'Pastries' },
      { id: 'cakes', label: 'Cakes' },
      { id: 'drinks', label: 'Drinks' }
    ],
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
    services: [
      { id: 'haircut', icon: 'scissors', title: 'Classic Haircuts', text: 'Sharp fades and classic cuts, barber-standard.', link: '#reservation' },
      { id: 'beard', icon: 'razor', title: 'Beard Grooming', text: 'Hot-towel shaves and precise beard sculpting.', link: '#reservation' },
      { id: 'combo', icon: 'sparkles', title: 'Full Grooming', text: 'Cut, beard and skin care in one session.', link: '#reservation' }
    ],
    features: [
      { id: 'skill', icon: 'scissors', title: 'Master Barbers', text: 'Years of craft behind every fade and shave.' },
      { id: 'speed', icon: 'clock', title: 'Walk-ins Welcome', text: 'Most cuts take 30 minutes, no appointment needed.' },
      { id: 'care', icon: 'droplet', title: 'Premium Care', text: 'Only quality products touch your hair and skin.' }
    ],
    faq: [],
    stats: [],
    offers: [],
    menu: [],
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
    services: [
      { id: 'hair', icon: 'sparkles', title: 'Hair Styling', text: 'Cuts, color and styling by senior stylists.', link: '#reservation' },
      { id: 'care', icon: 'flower', title: 'Skin & Care', text: 'Facials, treatments and bridal care packages.', link: '#reservation' },
      { id: 'nails', icon: 'hand', title: 'Nail Studio', text: 'Manicure and pedicure with premium polish.', link: '#reservation' }
    ],
    features: [
      { id: 'stylists', icon: 'sparkles', title: 'Senior Stylists', text: 'A team trained in the latest techniques.' },
      { id: 'products', icon: 'flower', title: 'Premium Products', text: 'Trusted brands for hair, skin and nails.' },
      { id: 'booking', icon: 'calendar-check', title: 'Easy Booking', text: 'Book online and get confirmed via WhatsApp.' }
    ],
    faq: [],
    stats: [],
    offers: [],
    menu: [],
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
    services: [
      { id: 'consultations', icon: 'stethoscope', title: 'Consultations', text: 'Careful, unhurried consultations by specialists.', link: '#reservation' },
      { id: 'checkups', icon: 'activity', title: 'Check-ups', text: 'Full check-up packages with clear results.', link: '#reservation' },
      { id: 'followup', icon: 'phone', title: 'Follow-up Care', text: 'Continuous care and easy follow-up visits.', link: '#contact' }
    ],
    features: [
      { id: 'specialists', icon: 'stethoscope', title: 'Specialist Team', text: 'Experienced doctors across multiple specialties.' },
      { id: 'hygiene', icon: 'shield-check', title: 'Clean & Safe', text: 'Clinic-grade hygiene standards in every room.' },
      { id: 'booking', icon: 'calendar-check', title: 'Easy Booking', text: 'Online booking with WhatsApp confirmation.' }
    ],
    faq: [],
    stats: [],
    offers: [],
    menu: [],
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
    services: [
      { id: 'in-store', icon: 'store', title: 'In-Store Shopping', text: 'Browse and buy with friendly expert guidance.', link: '#contact' },
      { id: 'delivery', icon: 'truck', title: 'Delivery', text: 'Order and get it delivered across the area.', link: '#menu' },
      { id: 'support', icon: 'headset', title: 'Customer Support', text: 'Real help on WhatsApp whenever you need it.', link: '#contact' }
    ],
    features: [
      { id: 'selection', icon: 'layers', title: 'Curated Selection', text: 'Hand-picked products at honest prices.' },
      { id: 'quality', icon: 'badge-check', title: 'Quality Assured', text: 'Every product checked before it reaches you.' },
      { id: 'service', icon: 'headset', title: 'Real Support', text: 'Fast answers on WhatsApp and in store.' }
    ],
    faq: [],
    stats: [],
    offers: [],
    menu: [],
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
    services: [
      { id: 'rx', icon: 'pill', title: 'Prescriptions', text: 'Fast, accurate prescription dispensing.', link: '#contact' },
      { id: 'delivery', icon: 'truck', title: 'Home Delivery', text: 'Medicines delivered quickly and safely.', link: '#contact' },
      { id: 'consult', icon: 'stethoscope', title: 'Pharmacist Consult', text: 'Free advice from licensed pharmacists.', link: '#contact' }
    ],
    features: [
      { id: 'stock', icon: 'pill', title: 'Full Stock', text: 'Complete range of medicines and care products.' },
      { id: 'speed', icon: 'truck', title: 'Fast Delivery', text: 'Delivered to your door, 7 days a week.' },
      { id: 'advice', icon: 'stethoscope', title: 'Expert Advice', text: 'Licensed pharmacists on hand at all times.' }
    ],
    faq: [],
    stats: [],
    offers: [],
    menu: [],
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
    services: [
      { id: 'booking', icon: 'calendar-check', title: 'Book Online', text: 'Reserve your slot in seconds.', link: '#reservation' },
      { id: 'contact', icon: 'phone', title: 'Reach Us', text: 'Call or message us anytime on WhatsApp.', link: '#contact' },
      { id: 'visit', icon: 'map-pin', title: 'Visit Us', text: 'Find us in {area} — directions on the map.', link: '#location' }
    ],
    features: [
      { id: 'quality', icon: 'badge-check', title: 'Quality First', text: 'We stand behind every service we provide.' },
      { id: 'support', icon: 'headset', title: 'Real Support', text: 'Fast answers on WhatsApp and in person.' },
      { id: 'local', icon: 'map-pin', title: 'Proudly Local', text: 'Serving {area} with care and craft.' }
    ],
    faq: [],
    stats: [],
    offers: [],
    menu: [],
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
