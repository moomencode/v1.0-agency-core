export const CATEGORIES = {
  cafe: {
    label: 'Cafe',
    services: ['Coffee & espresso drinks', 'Specialty brews', 'Pastries & snacks', 'Dine-in seating'],
    products: ['Whole bean coffee', 'Merchandise & mugs', 'Bottled cold brew'],
    brand: {
      personality: 'warm, artisan, community-focused',
      voice: 'friendly and inviting',
      visual: 'cozy modern with natural textures',
      colors: ['#8B5A2B', '#2F2F2F', '#F5EFE6'],
      typography: 'rounded serif headings with humanist sans body',
      customerExperience: 'comfortable seating, music, and fast wifi'
    }
  },
  restaurant: {
    label: 'Restaurant',
    services: ['Dine-in meals', 'Takeaway', 'Event catering'],
    products: ['Signature dishes', 'Set menus', 'Seasonal specials'],
    brand: {
      personality: 'hospitable, bold, memorable',
      voice: 'appetizing and personal',
      visual: 'rich warm palette with editorial food photography',
      colors: ['#C0392B', '#1F1F1F', '#F8F4EC'],
      typography: 'display serif headings with clean sans body',
      customerExperience: 'reservation flow and consistent service'
    }
  },
  gym: {
    label: 'Gym & Fitness',
    services: ['Membership training', 'Personal training', 'Group classes'],
    products: ['Membership plans', 'Training packages', 'Merchandise'],
    brand: {
      personality: 'energetic, disciplined, motivating',
      voice: 'direct and motivating',
      visual: 'high-contrast athletic design',
      colors: ['#1B2A4A', '#E74C3C', '#FFFFFF'],
      typography: 'condensed bold sans with uppercase headlines',
      customerExperience: 'open house tours and easy class booking'
    }
  },
  tailor: {
    label: 'Tailor & Alterations',
    services: ['Custom tailoring', 'Alterations', 'Repairs'],
    products: ['Bespoke suits', 'Made-to-measure shirts'],
    brand: {
      personality: 'precise, heritage, trustworthy',
      voice: 'professional and reassuring',
      visual: 'minimal editorial with craft details',
      colors: ['#3D3D3D', '#B8860B', '#FAFAF7'],
      typography: 'serif headings with classic sans body',
      customerExperience: 'measuring appointments and fit guarantees'
    }
  },
  bakery: {
    label: 'Bakery',
    services: ['Fresh daily baking', 'Custom cakes', 'Wholesale supply'],
    products: ['Artisan bread', 'Cakes & pastries', 'Catering trays'],
    brand: {
      personality: 'fresh, homely, generous',
      voice: 'warm and mouth-watering',
      visual: 'soft cream palette with hand-drawn accents',
      colors: ['#D4A373', '#7F4F24', '#FFF8F0'],
      typography: 'friendly rounded type with script accents',
      customerExperience: 'morning freshness and pre-order service'
    }
  },
  barber: {
    label: 'Barber Shop',
    services: ['Haircuts', 'Beard grooming', 'Hot towel shaves'],
    products: ['Grooming products', 'Gift cards'],
    brand: {
      personality: 'sharp, classic, confident',
      voice: 'charming and direct',
      visual: 'barbershop heritage with bold stripes',
      colors: ['#1A1A1A', '#C9A227', '#F2EFE9'],
      typography: 'bold condensed sans with vintage numerals',
      customerExperience: 'quick booking and consistent cuts'
    }
  },
  salon: {
    label: 'Beauty Salon',
    services: ['Hair styling', 'Skin treatments', 'Nail care'],
    products: ['Retail hair care', 'Treatment packages'],
    brand: {
      personality: 'elegant, modern, attentive',
      voice: 'polished and caring',
      visual: 'soft neutrals with refined accents',
      colors: ['#B76E79', '#2C2C2C', '#FDF6F0'],
      typography: 'light serif headings with airy sans body',
      customerExperience: 'appointment reminders and loyalty perks'
    }
  },
  clinic: {
    label: 'Clinic & Healthcare',
    services: ['Consultations', 'Check-ups', 'Specialist referrals'],
    products: [],
    brand: {
      personality: 'caring, professional, dependable',
      voice: 'clear and reassuring',
      visual: 'clean clinical design with calming colors',
      colors: ['#1D6FA3', '#EAF3F9', '#2C3E50'],
      typography: 'clean sans with generous spacing',
      customerExperience: 'online booking and short wait times'
    }
  },
  shop: {
    label: 'Retail Shop',
    services: ['In-store shopping', 'Home delivery'],
    products: ['Core catalog', 'Seasonal items', 'Gift sets'],
    brand: {
      personality: 'friendly, practical, reliable',
      voice: 'helpful and straightforward',
      visual: 'bright storefront aesthetic',
      colors: ['#2E7D32', '#37474F', '#F9FBE7'],
      typography: 'geometric sans with bold offers',
      customerExperience: 'easy returns and fast checkout'
    }
  },
  pharmacy: {
    label: 'Pharmacy',
    services: ['Prescriptions', 'OTC products', 'Health consultations'],
    products: ['Medicines', 'Health & wellness'],
    brand: {
      personality: 'trusted, calm, precise',
      voice: 'authoritative and caring',
      visual: 'clean green/white health palette',
      colors: ['#0E7C66', '#FFFFFF', '#16302B'],
      typography: 'humanist sans with clear hierarchy',
      customerExperience: 'fast refills and private consultations'
    }
  },
  other: {
    label: 'Local Business',
    services: ['Core services', 'Consultation'],
    products: ['Core products'],
    brand: {
      personality: 'approachable, local, reliable',
      voice: 'friendly and clear',
      visual: 'clean modern with local character',
      colors: ['#335C81', '#1F3A5F', '#F5F7FA'],
      typography: 'balanced sans-serif system',
      customerExperience: 'responsive service and clear communication'
    }
  }
};

export function categoryInfo(category) {
  return CATEGORIES[category] || CATEGORIES.other;
}

export function competitorNames(category, area) {
  const names = {
    cafe: ['Golden Bean Cafe', 'City Roast House', 'Corner Brew'],
    restaurant: ['Heritage Kitchen', 'City Plates', 'The Family Table'],
    gym: ['Powerhouse Gym', 'FitZone Studio', 'Iron Pulse'],
    tailor: ['Master Cut Tailors', 'The Fitting Room', 'Sharp Threads'],
    bakery: ['Fresh Oven Bakery', 'Daily Crumb', 'Golden Loaf'],
    barber: ['Classic Cuts', 'Gentleman Style', 'The Old Chair'],
    salon: ['Glow Beauty Studio', 'Elegance Salon', 'Luxe Looks'],
    clinic: ['City Health Clinic', 'WellCare Center', 'Prime Medical'],
    shop: ['Urban Market', 'Corner Store Plus', 'City Goods'],
    pharmacy: ['CarePoint Pharmacy', 'HealthPlus Drugs', 'Safe Dose'],
    realestate: ['Prime Realty', 'Horizon Properties', 'Nile Homes'],
    corporate: ['Apex Business Group', 'Metro Enterprises', 'City Works'],
    other: ['Local Pro Services', 'Neighborhood Experts', 'City Solutions']
  };
  return names[category] || names.other;
}

export function priceLevelInfo(category) {
  return {
    cafe: 2, restaurant: 2, gym: 2, tailor: 2, bakery: 1,
    barber: 1, salon: 2, clinic: 2, shop: 2, pharmacy: 1
  }[category] || 2;
}
