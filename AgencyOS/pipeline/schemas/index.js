const SCHEMA_DEFS = {
  'brand.json': {
    title: 'Brand',
    required: ['name', 'shortName', 'tagline', 'slogan', 'description'],
    properties: {
      name: { type: 'string' },
      shortName: { type: 'string' },
      tagline: { type: 'string' },
      slogan: { type: 'string' },
      description: { type: 'string' },
      logo: { type: 'object', properties: { dark: { type: 'string' }, light: { type: 'string' }, favicon: { type: 'string' }, alt: { type: 'string' }, rounded: { type: 'boolean' } } },
      heroEyebrow: { type: 'string' }
    }
  },
  'theme.json': {
    title: 'Theme',
    required: ['name', 'defaultMode', 'storageKey', 'colors', 'typography'],
    properties: {
      name: { type: 'string' },
      defaultMode: { enum: ['dark', 'light'] },
      storageKey: { type: 'string' },
      colors: { type: 'object', required: ['dark', 'light'] },
      typography: { type: 'object', required: ['display', 'body', 'fontsUrl'] },
      spacing: { type: 'object' },
      radius: { type: 'object' },
      shadows: { type: 'object' },
      buttons: { type: 'object' },
      cards: { type: 'object' },
      animations: { type: 'object' },
      icons: { type: 'object' },
      gradients: { type: 'object' }
    }
  },
  'business.json': {
    title: 'Business',
    required: ['name', 'type', 'locale', 'currency', 'sections'],
    properties: {
      name: { type: 'string' },
      type: { type: 'string' },
      locale: { type: 'string' },
      languages: { type: 'array', items: { type: 'string' } },
      currency: { type: 'object', required: ['code', 'symbol'] },
      phoneDigits: { type: 'integer' },
      sections: { type: 'array', items: { type: 'string' } }
    }
  },
  'hero.json': {
    title: 'Hero',
    required: ['eyebrow', 'title', 'subtitle', 'description', 'image'],
    properties: {
      eyebrow: { type: 'string' },
      title: { type: 'string' },
      subtitle: { type: 'string' },
      slogan: { type: 'string' },
      description: { type: 'string' },
      image: { type: 'object', required: ['dark', 'light', 'alt'] },
      ctaPrimary: { type: 'object' },
      ctaSecondary: { type: 'object' },
      info: { type: 'array', items: { type: 'object', required: ['icon', 'title', 'subtitle'] } }
    }
  },
  'navigation.json': {
    title: 'Navigation',
    required: ['items'],
    properties: {
      items: { type: 'array', minItems: 1, items: { type: 'object', required: ['label', 'href'] } },
      cta: { type: 'object' }
    }
  },
  'services.json': {
    title: 'Services',
    required: ['heading', 'items'],
    properties: {
      heading: { type: 'object', required: ['eyebrow', 'title'] },
      items: { type: 'array', items: { type: 'object', required: ['id', 'title'] } }
    }
  },
  'gallery.json': {
    title: 'Gallery',
    required: ['heading', 'images'],
    properties: {
      heading: { type: 'object' },
      images: { type: 'array', items: { type: 'object', required: ['src', 'alt'] } },
      moreAria: { type: 'string' },
      count: { type: 'integer' }
    }
  },
  'reviews.json': {
    title: 'Reviews',
    required: ['heading', 'items'],
    properties: {
      heading: { type: 'object' },
      items: { type: 'array', items: { type: 'object', required: ['id', 'name', 'rating', 'text'] } }
    }
  },
  'stats.json': {
    title: 'Stats',
    required: ['heading', 'items'],
    properties: {
      heading: { type: 'object' },
      items: { type: 'array', items: { type: 'object', required: ['id', 'value', 'label'] } }
    }
  },
  'faq.json': {
    title: 'FAQ',
    required: ['heading', 'items'],
    properties: {
      heading: { type: 'object' },
      items: { type: 'array', items: { type: 'object', required: ['id', 'question', 'answer'] } }
    }
  },
  'footer.json': {
    title: 'Footer',
    required: ['brandDescription', 'quickLinksTitle', 'contactTitle', 'hoursTitle', 'rights'],
    properties: {
      brandDescription: { type: 'string' },
      quickLinksTitle: { type: 'string' },
      contactTitle: { type: 'string' },
      hoursTitle: { type: 'string' },
      rights: { type: 'string' }
    }
  },
  'contact.json': {
    title: 'Contact',
    required: ['hours'],
    properties: {
      phone: { type: ['string', 'null'] },
      phoneRaw: { type: ['string', 'null'] },
      whatsapp: { type: ['string', 'null'] },
      email: { type: ['string', 'null'] },
      address: { type: ['string', 'null'] },
      addressShort: { type: ['string', 'null'] },
      area: { type: ['string', 'null'] },
      mapsUrl: { type: ['string', 'null'] },
      mapsEmbed: { type: ['string', 'null'] },
      hours: { type: 'array', items: { type: 'object', required: ['days', 'time'] } },
      hoursShort: { type: ['string', 'null'] }
    }
  },
  'seo.json': {
    title: 'SEO',
    required: ['title', 'description', 'keywords', 'robots', 'canonical', 'openGraph', 'twitter', 'schemaType'],
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      keywords: { type: 'array', items: { type: 'string' } },
      author: { type: 'string' },
      robots: { type: 'string' },
      canonical: { type: 'string' },
      openGraph: { type: 'object' },
      twitter: { type: 'object' },
      schemaType: { type: 'string' }
    }
  },
  'social.json': {
    title: 'Social',
    required: ['facebook', 'instagram', 'whatsapp'],
    properties: {
      facebook: { type: 'string' },
      instagram: { type: 'string' },
      whatsapp: { type: 'string' },
      twitter: { type: 'string' },
      youtube: { type: 'string' },
      tiktok: { type: 'string' },
      linkedin: { type: 'string' }
    }
  },
  'booking.json': {
    title: 'Booking',
    required: ['heading', 'fields', 'submit', 'method'],
    properties: {
      enabled: { type: 'boolean' },
      heading: { type: 'object' },
      fields: { type: 'object' },
      phoneError: { type: 'string' },
      success: { type: 'string' },
      submit: { type: 'object' },
      note: { type: 'string' },
      method: { type: 'string' },
      maxGuests: { type: 'integer' }
    }
  },
  'offers.json': {
    title: 'Offers',
    required: ['heading', 'items'],
    properties: {
      heading: { type: 'object' },
      items: { type: 'array', items: { type: 'object', required: ['id', 'title', 'description'] } },
      more: { type: 'object' }
    }
  },
  'features.json': {
    title: 'Features',
    required: ['heading', 'items'],
    properties: {
      heading: { type: 'object' },
      items: { type: 'array', items: { type: 'object', required: ['id', 'title'] } }
    }
  },
  'menu.json': {
    title: 'Menu',
    required: ['heading', 'categories', 'dishes'],
    properties: {
      heading: { type: 'object' },
      categories: { type: 'array', items: { type: 'object', required: ['id', 'label'] } },
      dishes: { type: 'object' },
      itemsSuffix: { type: 'string' },
      addAria: { type: 'string' },
      more: { type: 'object' }
    }
  },
  'i18n.json': {
    title: 'Localization',
    required: ['locale', 'languages', 'labels'],
    properties: {
      businessId: { type: 'string' },
      locale: { type: 'string' },
      languages: { type: 'array', items: { type: 'string' } },
      labels: { type: 'object', required: ['nav', 'common'] }
    }
  }
};

export const CONFIG_IDS = Object.keys(SCHEMA_DEFS);
export const CONFIG_ID_PREFIX = 'agencyos:pipeline/config';

export function getConfigSchema(fileId) {
  const def = SCHEMA_DEFS[fileId];
  if (!def) return null;
  return {
    $id: `${CONFIG_ID_PREFIX}/${fileId.replace('.json', '')}`,
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    additionalProperties: true,
    ...def
  };
}

export function listConfigSchemas() {
  return Object.keys(SCHEMA_DEFS).map(getConfigSchema);
}

export function validateConfigAgainstSchema(config, fileId, validateFn) {
  const schema = getConfigSchema(fileId);
  if (!schema) return { valid: false, errors: [`no schema for ${fileId}`] };
  if (typeof validateFn !== 'function') {
    return { valid: true, errors: [], warnings: ['validator not wired — structural check only'], checked: false };
  }
  const res = validateFn(config, schema, { schemaPath: schema.$id });
  return { valid: res.valid !== false, errors: (res.errors || []).map((e) => e.message || String(e)), checked: true };
}
