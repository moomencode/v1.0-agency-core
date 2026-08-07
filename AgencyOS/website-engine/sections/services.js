import { el, text, icon } from '../renderer/tree.js';
import { Section, Container, SectionHeader, Grid, Card, IconChip, Button } from '../components/index.js';

export default function buildServices(ctx) {
  const cfg = ctx.configs['services.json'];
  if (!cfg || !Array.isArray(cfg.items) || !cfg.items.length) return null;
  const items = cfg.items.slice(0, 6).map((s) =>
    Card({ className: 'card--icon' }, [
      IconChip(s.icon || 'sparkles'),
      el('h3', {}, [text(s.title || s.id)]),
      el('p', {}, [text(s.text || '')]),
      Button({ label: 'Learn more', href: s.link || '#contact', variant: 'secondary', iconName: 'arrow-right' })
    ])
  );
  return Section({ id: 'services', name: 'services', ariaLabel: 'Services' }, [
    Container({}, [
      SectionHeader({ eyebrow: cfg.heading?.eyebrow || 'Our Services', title: cfg.heading?.title || 'What we offer' }),
      Grid({ cols: 3, children: items })
    ])
  ]);
}
