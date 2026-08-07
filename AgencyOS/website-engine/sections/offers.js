import { el, text, icon } from '../renderer/tree.js';
import { Section, Container, SectionHeader, Card, Badge, Button } from '../components/index.js';

export default function buildOffers(ctx) {
  const cfg = ctx.configs['offers.json'];
  if (!cfg || !Array.isArray(cfg.items) || !cfg.items.length) return null;
  const cards = cfg.items.slice(0, 6).map((o) =>
    Card({ className: 'offer' }, [
      o.image ? el('img', { src: o.image, alt: o.title || 'Offer', className: 'offer__img' }) : null,
      el('div', { className: 'offer__body' }, [
        o.badge ? Badge(o.badge) : null,
        el('h3', {}, [text(o.title || 'Offer')]),
        o.description ? el('p', { className: 'offer__desc' }, [text(o.description)]) : null,
        o.time ? el('p', { className: 'offer__time' }, [icon('clock'), text(` ${o.time}`)]) : null
      ])
    ])
  );
  return Section({ id: 'offers', name: 'offers', ariaLabel: 'Offers' }, [
    Container({}, [
      SectionHeader({ eyebrow: cfg.heading?.eyebrow || 'Special Offers', title: cfg.heading?.title || "Don't miss our offers" }),
      el('div', { className: 'offers__grid' }, cards),
      cfg.more ? el('p', { style: 'margin-top:var(--space-lg)' }, [Button({ label: cfg.more.label || 'View All Offers', href: cfg.more.href || '#offers', variant: 'secondary' })]) : null
    ])
  ]);
}
