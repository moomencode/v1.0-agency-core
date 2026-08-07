import { el, text } from '../renderer/tree.js';
import { Section, Container, SectionHeader, Image } from '../components/index.js';

export default function buildGallery(ctx) {
  const cfg = ctx.configs['gallery.json'];
  if (!cfg || !Array.isArray(cfg.images) || !cfg.images.length) return null;
  const items = cfg.images.slice(0, 12).map((g, i) =>
    el('figure', { className: 'gallery__item', id: `gallery-item-${i + 1}` }, [
      Image({ src: g.src, alt: g.alt || `Gallery photo ${i + 1}`, className: 'img--cover' }),
      el('figcaption', {}, [text(g.alt || `Photo ${i + 1}`)])
    ])
  );
  return Section({ id: 'gallery', name: 'gallery', ariaLabel: 'Gallery' }, [
    Container({}, [
      SectionHeader({ eyebrow: cfg.heading?.eyebrow || 'Our Gallery', title: cfg.heading?.title || 'A glimpse of our place' }),
      el('div', { className: 'gallery__grid', role: 'list', ariaLabel: cfg.moreAria || 'Photo gallery' }, items)
    ])
  ]);
}
