import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE = {
  type: 'object',
  required: ['schemaId', 'dossierId', 'businessId', 'documentId', 'version', 'createdAt'],
  properties: {
    schemaId: { type: 'string' },
    dossierId: { type: 'string' },
    businessId: { type: 'string' },
    documentId: { type: 'string' },
    version: { type: 'integer', minimum: 1 },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' }
  },
  additionalProperties: true
};

function extend(required, extra) {
  return {
    ...BASE,
    $id: null,
    required: [...BASE.required, ...required],
    properties: { ...BASE.properties, ...extra }
  };
}

const SCHEMAS = {
  brand: extend(['personality', 'targetAudience', 'brandVoice', 'visualStyle', 'colorPalette', 'typography', 'customerExperience'], {
    personality: { type: 'string' }, targetAudience: { type: 'string' }, brandVoice: { type: 'string' },
    visualStyle: { type: 'string' }, colorPalette: { type: 'array' }, typography: { type: 'string' },
    customerExperience: { type: 'string' }, uniqueSellingPoints: { type: 'array' }, brandQuality: { type: 'number' }
  }),
  contact: extend(['phones', 'emails'], {
    phones: { type: 'array', items: { type: 'string' } }, emails: { type: 'array', items: { type: 'string' } },
    whatsapp: { type: ['string', 'null'] }, primaryEmail: { type: ['string', 'null'] },
    contactComplete: { type: 'boolean' }, hasWhatsapp: { type: 'boolean' }
  }),
  location: extend([], {
    area: { type: ['string', 'null'] }, city: { type: ['string', 'null'] }, address: { type: ['string', 'null'] },
    coordinates: { type: ['object', 'null'] }, mapsUrl: { type: ['string', 'null'] }, branchCount: { type: 'integer' }
  }),
  hours: extend([], {
    hours: { type: ['array', 'null'] }, source: { type: 'string' }, note: { type: ['string', 'null'] }
  }),
  social: extend(['platforms'], {
    platforms: { type: 'array' }, platformCount: { type: 'integer' },
    googleBusiness: { type: 'object' }, activity: { type: 'string' }
  }),
  website: extend(['status'], {
    url: { type: ['string', 'null'] }, status: { type: 'string' }, probe: { type: ['object', 'null'] },
    booking: { type: ['string', 'null'] }, onlineOrdering: { type: 'boolean' }, menus: { type: 'integer' },
    estimatedPages: { type: 'integer' }, estimatedBuildCost: { type: ['number', 'null'] }, recommendation: { type: 'array' }
  }),
  seo: extend(['seoScore'], {
    title: { type: ['string', 'null'] }, metaDescription: { type: ['string', 'null'] }, h1: { type: ['string', 'null'] },
    viewport: { type: ['string', 'null'] }, lang: { type: ['string', 'null'] }, seoScore: { type: 'number' },
    keywords: { type: 'array' }, recommendations: { type: 'array' }
  }),
  reviews: extend(['count'], {
    count: { type: 'integer' }, rating: { type: ['number', 'null'] }, platforms: { type: 'array' },
    reviewQuality: { type: 'string' }, recommendations: { type: 'array' }
  }),
  photos: extend(['count'], {
    count: { type: 'integer' }, source: { type: 'string' }, adequacy: { type: 'string' },
    recommendation: { type: ['string', 'null'] }
  }),
  services: extend(['services'], { services: { type: 'array' } }),
  products: extend(['products'], { products: { type: 'array' } }),
  pricing: extend(['priceLevel', 'currency'], {
    priceLevel: { type: 'integer', minimum: 1, maximum: 3 }, range: { type: 'string' },
    currency: { type: 'string' }, source: { type: 'string' }, positioning: { type: 'string' }
  }),
  competitors: extend(['topCompetitors', 'digitalComparison', 'positioning'], {
    topCompetitors: { type: 'array' }, digitalComparison: { type: 'object' }, positioning: { type: 'string' }, marketGap: { type: 'string' }
  }),
  strengths: extend(['strengths'], { strengths: { type: 'array' } }),
  weaknesses: extend(['weaknesses'], { weaknesses: { type: 'array' } }),
  opportunities: extend(['opportunities'], { opportunities: { type: 'array' } }),
  risks: extend(['risks'], { risks: { type: 'array' } }),
  recommendations: extend(['topProblems', 'quickWins'], {
    topProblems: { type: 'array' }, quickWins: { type: 'array' }, websiteRecommendations: { type: 'array' },
    seoRecommendations: { type: 'array' }, brandRecommendations: { type: 'array' }, conversionRecommendations: { type: 'array' }
  }),
  summary: extend(['name', 'scores', 'grades'], {
    name: { type: 'string' }, category: { type: 'string' }, area: { type: ['string', 'null'] },
    verdict: { type: ['string', 'null'] }, confidence: { type: ['number', 'null'] }, risk: { type: ['string', 'null'] },
    scores: { type: 'object' }, grades: { type: 'object' }, estimates: { type: ['object', 'null'] },
    counts: { type: 'object' }, nextStep: { type: 'string' }
  })
};

const BUSINESS_SCHEMA = JSON.parse(readFileSync(join(__dirname, 'business.schema.json'), 'utf8'));

export function getSchema(documentId) {
  if (documentId === 'business') return BUSINESS_SCHEMA;
  return SCHEMAS[documentId] || null;
}

export function hasSchema(documentId) {
  return documentId === 'business' || !!SCHEMAS[documentId];
}

export function listSchemaIds() {
  return Object.keys(SCHEMAS).concat(['business']).sort();
}

export function validateDocuments(documents, validator) {
  const errors = [];
  for (const [documentId, value] of Object.entries(documents)) {
    if (documentId === 'readme') continue;
    const schema = getSchema(documentId);
    if (!schema) { errors.push({ documentId, error: 'no schema registered' }); continue; }
    const res = validator.validate(value, schema, { schemaPath: `dossier:${documentId}` });
    if (!res.valid) errors.push({ documentId, errors: res.errors });
  }
  return { valid: errors.length === 0, errors };
}
