import { el, text, icon } from '../renderer/tree.js';
import { Section, Container, SectionHeader, Grid, Card, IconChip } from '../components/index.js';

export default function buildAbout(ctx) {
  const features = ctx.configs['features.json'];
  const brand = ctx.configs['brand.json'] || {};
  if (!features || !Array.isArray(features.items) || !features.items.length) return null;
  const title = features.heading?.title || 'Why choose us';
  const eyebrow = features.heading?.eyebrow || 'About us';
  const items = features.items.slice(0, 6).map((f) =>
    Card({ className: 'card--icon' }, [
      IconChip(f.icon || 'sparkles'),
      el('h3', {}, [text(f.title || f.id)]),
      el('p', {}, [text(f.text || '')])
    ])
  );
  const headChildren = [SectionHeader({ eyebrow, title })];
  if (brand.slogan) headChildren.push(el('p', { className: 'sec__sub' }, [text(brand.slogan)]));
  return Section({ id: 'features', name: 'about', variant: 'alt', ariaLabel: 'About' }, [
    Container({}, [...headChildren, Grid({ cols: 3, children: items })])
  ]);
}
