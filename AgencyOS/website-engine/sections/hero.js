import { el, text, icon } from '../renderer/tree.js';
import { Section, Container, Button, Image, SectionHeader, Grid } from '../components/index.js';

export default function buildHero(ctx) {
  const hero = ctx.configs['hero.json'];
  const brand = ctx.configs['brand.json'] || {};
  if (!hero) return null;
  const mode = ctx.theme.defaultMode;
  const img = (hero.image && hero.image[mode]) || hero.image?.dark || null;
  const variant = ctx.layout.heroVariant || 'fullbleed';
  const children = [];
  children.push(
    el('div', { className: 'hero__bg', ariaHidden: 'true' }, img ? [Image({ src: img, alt: '', ariaHidden: true, className: 'img--cover' })] : [])
  );
  const inner = [];
  inner.push(el('div', { className: 'hero__inner' }, [
    Container({}, [
      el('div', { className: 'hero__grid' }, [
        el('div', {}, [
          hero.eyebrow ? el('span', { className: 'hero__eyebrow' }, [icon('sparkles'), text(hero.eyebrow)]) : null,
          el('h1', { className: 'hero__title' }, [text(hero.title || brand.name || 'Welcome')]),
          hero.subtitle ? el('p', { className: 'hero__subtitle' }, [text(hero.subtitle)]) : null,
          hero.description ? el('p', { className: 'hero__desc' }, [text(hero.description)]) : null,
          el('div', { className: 'hero__cta' }, [
            hero.ctaPrimary ? Button({ label: hero.ctaPrimary.label || 'Explore', href: hero.ctaPrimary.href || '#services', variant: 'primary', iconName: hero.ctaPrimary.icon }) : null,
            hero.ctaSecondary ? Button({ label: hero.ctaSecondary.label || 'Contact', href: hero.ctaSecondary.href || '#contact', variant: 'secondary', iconName: hero.ctaSecondary.icon }) : null
          ]),
          Array.isArray(hero.info) && hero.info.length
            ? el('div', { className: 'hero__info' }, hero.info.map((i) => el('div', { className: 'hero__info-item' }, [icon(i.icon || 'sparkles'), el('div', {}, [el('strong', {}, [text(i.title)]), el('span', {}, [text(i.subtitle)])])])))
            : null
        ]),
        el('div', { className: 'hero__visual' }, [Image({ src: img, alt: hero.image?.alt || `${hero.title || ''} Ambiance`, className: 'img--cover' })])
      ])
    ])
  ]));
  children.push(el('div', { className: 'hero__inner' }, inner));
  const props = { className: `hero hero--${variant}` };
  if (ctx.theme.defaultMode) props['data-hero-mode'] = ctx.theme.defaultMode;
  return Section({ id: 'home', name: 'hero', ariaLabel: 'Introduction' }, children);
}
