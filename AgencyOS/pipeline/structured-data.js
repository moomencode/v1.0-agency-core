import { clamp } from './utils.js';

export function generateStructuredData(n) {
  const name = n.name;
  const area = n.area || '';
  const address = n.address ? { '@type': 'PostalAddress', streetAddress: n.address, addressLocality: area } : null;
  const geo = n.coordinates
    ? { '@type': 'GeoCoordinates', latitude: n.coordinates.lat, longitude: n.coordinates.lng }
    : null;
  const phone = n.phoneE164 ? { telephone: `+${n.phoneE164.replace(/\D/g, '')}` } : null;
  const rating =
    n.rating !== null
      ? {
          '@type': 'AggregateRating',
          ratingValue: clamp(n.rating, 1, 5),
          bestRating: 5,
          ratingCount: n.reviewCount || 0
        }
      : null;
  const sameAs = n.socialLinks.map((s) => s.url);

  const graph = [
    {
      '@context': 'https://schema.org',
      '@type': n.schemaType,
      name,
      description: n.brand.tagline || `${name} — ${n.displayName} in ${area}`,
      url: n.websiteUrl,
      image: '/hero/dark-hero.jpg',
      address,
      geo,
      ...phone,
      openingHours: n.hoursShort || null,
      ...(rating ? { aggregateRating: rating } : {}),
      sameAs
    }
  ];

  if (n.hasMenus && n.products.length) {
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'Menu',
      name: `${name} Menu`,
      hasMenuSection: [
        {
          '@type': 'MenuSection',
          name: 'Signature',
          hasMenuItem: n.products.slice(0, 6).map((p) => ({
            '@type': 'MenuItem',
            name: p.name || 'Item',
            description: p.description || null
          }))
        }
      ]
    });
  }

  if (n.rating !== null) {
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'Review',
      itemReviewed: { '@type': n.schemaType, name },
      reviewRating: { '@type': 'Rating', ratingValue: clamp(n.rating, 1, 5), bestRating: 5 },
      author: { '@type': 'Organization', name }
    });
  }

  return { businessId: n.id, schemaType: n.schemaType, '@graph': graph };
}
