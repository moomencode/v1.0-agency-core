import { hashShort } from './utils.js';

function placeholderRef(businessId, kind, index) {
  return `/placeholders/${kind}-${index}.jpg`;
}

export function generateAssetsManifest(n) {
  const id = n.id;
  const galleryCount = n.photosCount > 0 ? Math.min(n.photosCount, 8) : 0;

  const entries = {
    logos: [
      { path: '/logo/logo.png', role: 'dark', description: 'Logo on dark backgrounds', source: 'client' },
      { path: '/logo/logo-light.png', role: 'light', description: 'Logo on light backgrounds', source: 'client' },
      { path: '/logo/favicon.png', role: 'favicon', description: 'Site favicon', source: 'client' }
    ],
    hero: [
      { path: '/hero/dark-hero.jpg', role: 'dark', description: 'Hero image for dark mode', source: 'unsplash' },
      { path: '/hero/light-hero.jpg', role: 'light', description: 'Hero image for light mode', source: 'unsplash' }
    ],
    gallery: Array.from({ length: galleryCount }, (_, i) => ({
      path: `/gallery/${hashShort(`${id}-g${i}`, 10)}.jpg`,
      index: i + 1,
      description: `Gallery photo ${i + 1}`,
      source: n.photosCount > 0 ? 'business-photos' : 'unsplash',
      placeholder: placeholderRef(id, 'gallery', i + 1)
    })),
    food: n.hasMenus
      ? n.products.map((p, i) => ({
          path: `/food/${hashShort(`${id}-p${i}`, 10)}.jpg`,
          index: i + 1,
          description: p.name || `Product ${i + 1}`,
          source: 'unsplash',
          placeholder: placeholderRef(id, 'food', i + 1)
        }))
      : [],
    videos: [],
    icons: [
      { path: '/icons/favicon.svg', role: 'favicon', source: 'generated' },
      { path: '/icons/apple-touch-icon.png', role: 'apple-touch', source: 'generated' }
    ],
    backgrounds: [
      { path: '/backgrounds/pattern.svg', role: 'pattern', source: 'generated' },
      { path: '/backgrounds/map-dark.png', role: 'map-dark', source: 'generated' }
    ],
    placeholders: [
      { path: '/placeholders/logo.svg', role: 'logo', source: 'generated' },
      { path: '/placeholders/profile.jpg', role: 'avatar', source: 'generated' },
      ...Array.from({ length: galleryCount }, (_, i) => ({
        path: `/placeholders/gallery-${i + 1}.jpg`,
        role: 'gallery',
        source: 'generated'
      })),
      { path: '/placeholders/food-1.jpg', role: 'food', source: 'generated' },
      { path: '/placeholders/food-2.jpg', role: 'food', source: 'generated' },
      { path: '/placeholders/food-3.jpg', role: 'food', source: 'generated' }
    ]
  };

  const allPaths = new Set(Object.values(entries).flat().map((e) => e.path));
  return {
    businessId: n.id,
    generated: true,
    downloaded: false,
    count: allPaths.size,
    groups: entries,
    references: [...allPaths]
  };
}
