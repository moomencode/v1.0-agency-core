import { el, text } from '../renderer/tree.js';
import { Section, Container, SectionHeader, Grid, Card, Image, Badge } from '../components/index.js';

export default function buildProducts(ctx) {
  let items = [];
  let heading = null;
  const products = ctx.configs['products.json'];
  if (products && Array.isArray(products.items) && products.items.length) {
    items = products.items;
    heading = products.heading;
  } else {
    const menu = ctx.configs['menu.json'];
    if (menu && menu.dishes && ctx.configs['business.json']?.type === 'shop') {
      for (const cat of Object.values(menu.dishes)) {
        for (const dish of cat) {
          items.push({ id: dish.id, title: dish.name, description: dish.description, price: dish.price, image: dish.image, badges: dish.badges });
        }
      }
      heading = { eyebrow: 'Our Products', title: 'What we sell' };
    }
  }
  if (!items.length) return null;
  const cards = items.slice(0, 12).map((p) =>
    Card({ className: 'card product__card' }, [
      p.image ? Image({ src: p.image, alt: p.title || 'Product', className: 'img--cover' }) : null,
      el('div', {}, [
        (p.badges || []).slice(0, 2).map((b) => Badge(b)),
        el('h3', {}, [text(p.title || 'Product')]),
        p.description ? el('p', {}, [text(p.description)]) : null,
        typeof p.price === 'number' ? el('strong', {}, [text(formatPrice(p.price, ctx.configs['business.json']))]) : null
      ])
    ])
  );
  return Section({ id: 'products', name: 'products', variant: 'alt', ariaLabel: 'Products' }, [
    Container({}, [SectionHeader({ eyebrow: heading?.eyebrow || 'Products', title: heading?.title || 'Our products' }), Grid({ cols: 3, children: cards })])
  ]);
}

export function formatPrice(value, business = null) {
  const cur = business?.currency;
  if (!cur) return String(value);
  const v = Number(value);
  const textValue = cur.decimals ? v.toFixed(cur.decimals) : String(Math.round(v));
  const sym = cur.symbol || cur.code || '';
  return cur.position === 'after' ? `${textValue} ${sym}`.trim() : `${sym} ${textValue}`.trim();
}
