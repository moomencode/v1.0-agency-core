import { el, text, icon } from '../renderer/tree.js';
import { Section, Container, SectionHeader, Button, Link } from '../components/index.js';

export default function buildLocation(ctx) {
  const cfg = ctx.configs['contact.json'];
  if (!cfg || !cfg.mapsUrl) return null;
  const children = [];
  children.push(SectionHeader({ eyebrow: 'Visit us', title: 'Our location' }));
  children.push(el('div', { className: 'contact__grid' }, [
    el('div', {}, [
      cfg.address ? el('div', { className: 'contact__row' }, [icon('map-pin'), el('div', {}, [el('strong', {}, [text('Address')]), el('span', {}, [text(cfg.address)])])]) : null,
      cfg.area ? el('div', { className: 'contact__row' }, [icon('map-pin'), el('div', {}, [el('strong', {}, [text('Area')]), el('span', {}, [text(cfg.area)])])]) : null,
      Array.isArray(cfg.hours) && cfg.hours.length ? el('div', { className: 'contact__row' }, [icon('clock'), el('div', {}, [el('strong', {}, [text('Opening Hours')]), el('ul', { className: 'contact__hours' }, cfg.hours.slice(0, 5).map((h) => el('li', {}, [el('span', {}, [text(h.days)]), el('span', {}, [text(h.time)])])))])]) : null,
      Button({ label: 'Get Directions', href: cfg.mapsUrl, external: true, variant: 'secondary', iconName: 'map-pin' })
    ]),
    Link({ href: cfg.mapsUrl, external: true, ariaLabel: 'Open map in new tab' }, [
      el('img', { src: '/backgrounds/map-dark.png', alt: `Map to ${cfg.address || cfg.area || 'our location'}`, className: 'map-frame', width: '600', height: '320' })
    ])
  ]));
  return Section({ id: 'location', name: 'location', variant: 'alt', ariaLabel: 'Location' }, [Container({}, children)]);
}
