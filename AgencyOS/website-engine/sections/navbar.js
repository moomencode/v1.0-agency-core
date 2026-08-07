import { el, text, icon } from '../renderer/tree.js';
import { Container, Link } from '../components/index.js';

export default function buildNavbar(ctx) {
  const nav = ctx.configs['navigation.json'];
  const brand = ctx.configs['brand.json'] || {};
  if (!nav || !Array.isArray(nav.items) || !nav.items.length) return null;
  const items = nav.items.slice(0, 7).map((i) =>
    el('li', {}, [Link({ href: i.href || '#home', className: 'nav__link', ariaLabel: i.label }, [text(i.label)])])
  );
  const cta = nav.cta || null;
  const brandInner = [];
  brandInner.push(text(brand.shortName || brand.name || 'Home'));
  const mode = ctx.theme.defaultMode;
  const logo = brand.logo ? (mode === 'dark' ? brand.logo.dark : brand.logo.light) : null;
  const header = el('header', { className: 'nav', role: 'banner' }, [
    Container({}, [
      el('nav', { className: 'nav__inner', ariaLabel: 'Main navigation' }, [
        Link({ href: '#home', className: 'nav__brand' }, logo ? [el('img', { src: logo, alt: brand.logo?.alt || `${brand.name} logo`, height: '36' }), text(brand.shortName || brand.name || '')] : brandInner),
        el('button', { className: 'nav__toggle', type: 'button', 'data-nav-toggle': '', ariaLabel: 'Open menu', ariaExpanded: 'false' }, [icon('menu')]),
        el('div', { className: 'nav__right', style: 'display:flex;align-items:center;gap:var(--space-md)' }, [
          el('ul', { className: 'nav__links', id: 'site-menu' }, items),
          el('div', { className: 'nav__icon-row' }, [
            el('button', { className: 'theme-toggle', type: 'button', 'data-theme-toggle': '', ariaLabel: 'Toggle dark/light mode' }, [icon('moon')]),
            cta ? el('span', { className: 'nav__cta' }, [Link({ href: cta.href || '#contact', className: 'btn btn--primary', ariaLabel: cta.label }, [text(cta.label || 'Get Started')])]) : null
          ])
        ])
      ])
    ])
  ]);
  return header;
}
