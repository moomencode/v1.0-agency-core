export const LAYOUT_IDS = ['restaurant', 'cafe', 'medical', 'realestate', 'corporate', 'portfolio', 'default'];

export const LAYOUTS = {
  restaurant: {
    id: 'restaurant',
    label: 'Restaurant',
    heroVariant: 'fullbleed',
    sectionAltEvery: 2,
    gridCols: 3,
    density: 'spacious',
    includesPages: ['menu', 'contact'],
    extraBeforeFooter: ['cta']
  },
  cafe: {
    id: 'cafe',
    label: 'Café',
    heroVariant: 'split',
    sectionAltEvery: 2,
    gridCols: 3,
    density: 'cozy',
    includesPages: ['menu', 'contact'],
    extraBeforeFooter: ['cta']
  },
  medical: {
    id: 'medical',
    label: 'Medical',
    heroVariant: 'centered',
    sectionAltEvery: 1,
    gridCols: 3,
    density: 'clean',
    includesPages: ['contact'],
    extraBeforeFooter: []
  },
  realestate: {
    id: 'realestate',
    label: 'Real Estate',
    heroVariant: 'fullbleed',
    sectionAltEvery: 2,
    gridCols: 3,
    density: 'wide',
    includesPages: ['contact'],
    extraBeforeFooter: ['cta']
  },
  corporate: {
    id: 'corporate',
    label: 'Corporate',
    heroVariant: 'centered',
    sectionAltEvery: 1,
    gridCols: 4,
    density: 'dense',
    includesPages: ['contact'],
    extraBeforeFooter: ['cta']
  },
  portfolio: {
    id: 'portfolio',
    label: 'Portfolio',
    heroVariant: 'split',
    sectionAltEvery: 2,
    gridCols: 4,
    density: 'gallery',
    includesPages: ['contact'],
    extraBeforeFooter: ['cta']
  },
  default: {
    id: 'default',
    label: 'Default',
    heroVariant: 'fullbleed',
    sectionAltEvery: 2,
    gridCols: 3,
    density: 'standard',
    includesPages: ['contact'],
    extraBeforeFooter: ['cta']
  }
};

const CATEGORY_LAYOUT = {
  cafe: 'cafe',
  restaurant: 'restaurant',
  bakery: 'restaurant',
  clinic: 'medical',
  pharmacy: 'medical',
  shop: 'corporate',
  gym: 'corporate',
  salon: 'portfolio',
  barber: 'portfolio',
  tailor: 'portfolio',
  realestate: 'realestate',
  other: 'default'
};

export function layoutFor(category, override = null) {
  const id = override || CATEGORY_LAYOUT[category] || 'default';
  return LAYOUTS[id] || LAYOUTS.default;
}

export function layoutIdFor(category, override = null) {
  const id = override || CATEGORY_LAYOUT[category] || 'default';
  return LAYOUTS[id] ? id : 'default';
}
