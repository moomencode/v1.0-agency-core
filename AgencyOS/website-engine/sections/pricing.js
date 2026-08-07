import { el, text, icon } from '../renderer/tree.js';
import { Section, Container, SectionHeader, Card, Button } from '../components/index.js';
import { formatPrice } from './products.js';

export default function buildPricing(ctx) {
  const cfg = ctx.configs['pricing.json'];
  if (!cfg || !Array.isArray(cfg.plans) || !cfg.plans.length) return null;
  const cards = cfg.plans.slice(0, 4).map((p) =>
    Card({ className: 'price__card' }, [
      el('h3', {}, [text(p.name || 'Plan')]),
      el('div', { className: 'price__amount' }, [text(formatPrice(p.price, ctx.configs['business.json']))]),
      el('p', {}, [text(p.description || '')]),
      el('ul', { className: 'price__features' }, (p.features || []).map((f) => el('li', {}, [icon('check'), text(f)])),
      ),
      p.cta ? el('p', { style: 'margin-top:var(--space-md)' }, [Button({ label: p.cta.label || 'Choose plan', href: p.cta.href || '#contact', variant: p.highlight ? 'primary' : 'secondary' })]) : null
    ])
  );
  return Section({ id: 'pricing', name: 'pricing', variant: 'alt', ariaLabel: 'Pricing' }, [
    Container({}, [
      SectionHeader({ eyebrow: cfg.heading?.eyebrow || 'Pricing', title: cfg.heading?.title || 'Plans & pricing' }),
      el('div', { className: 'price__grid' }, cards)
    ])
  ]);
}
