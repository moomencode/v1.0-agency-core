import { el, text, icon } from '../renderer/tree.js';
import { Section, Container, SectionHeader, Image, Button } from '../components/index.js';
import { formatPrice } from './products.js';

export default function buildMenu(ctx) {
  const cfg = ctx.configs['menu.json'];
  if (!cfg || !Array.isArray(cfg.categories)) return null;
  const cats = cfg.categories.slice(0, 6);
  const sections = cats.map((c) => {
    const dishes = (cfg.dishes && cfg.dishes[c.id]) || [];
    if (!dishes.length) return null;
    return el('div', { className: 'menu__group', id: `menu-${c.id}` }, [
      el('h3', {}, [text(c.label)]),
      el('div', {}, dishes.slice(0, 6).map((d) =>
        el('div', { className: 'menu__dish' }, [
          d.image ? Image({ src: d.image, alt: d.name, className: 'menu__dish-img' }) : null,
          el('div', { className: 'menu__dish-main' }, [
            el('span', { className: 'menu__dish-name' }, [text(d.name)]),
            d.description ? el('div', { className: 'menu__dish-desc' }, [text(d.description)]) : null
          ]),
          typeof d.price === 'number' ? el('span', { className: 'menu__dish-price' }, [text(formatPrice(d.price, ctx.configs['business.json']))]) : null
        ])
      ))
    ]);
  }).filter(Boolean);

  const catChips = el('div', { className: 'menu__cat' }, cats.map((c) =>
    el('span', { className: 'menu__cat-chip' }, [icon('sparkles'), text(c.label), text(` (${c.count || 0})`)])
  ));

  return Section({ id: 'menu', name: 'menu', ariaLabel: 'Menu' }, [
    Container({}, [
      SectionHeader({ eyebrow: cfg.heading?.eyebrow || 'Our Menu', title: cfg.heading?.title || 'What are you craving?' }),
      catChips,
      ...sections,
      cfg.more ? el('p', { className: 'sec__sub', style: 'margin-top:var(--space-lg)' }, [Button({ label: cfg.more.label || 'View Full Menu', href: cfg.more.href || '#menu', variant: 'secondary' })]) : null
    ])
  ]);
}
