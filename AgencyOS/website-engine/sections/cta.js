import { el, text } from '../renderer/tree.js';
import { Section, Container, Button } from '../components/index.js';

export default function buildCta(ctx) {
  const nav = ctx.configs['navigation.json'];
  const brand = ctx.configs['brand.json'] || {};
  const cta = nav?.cta || null;
  const title = cta?.title || brand.slogan || brand.tagline || `${brand.name || 'Your business'} — get started today`;
  const actions = [];
  if (cta) {
    actions.push(Button({ label: cta.label || 'Get Started', href: cta.href || '#contact', variant: 'primary', iconName: cta.icon || 'arrow-right' }));
  }
  const contact = ctx.configs['contact.json'];
  if (contact?.phone) actions.push(Button({ label: 'Call Us', href: `tel:${contact.phoneRaw || contact.phone}`, variant: 'secondary', iconName: 'phone' }));
  if (!actions.length) return null;
  return Section({ id: 'cta', name: 'cta', ariaLabel: 'Call to action' }, [
    el('div', { className: 'cta' }, [
      Container({}, [
        el('div', { className: 'cta__inner' }, [
          el('h2', { className: 'cta__title' }, [text(title)]),
          el('div', { className: 'cta__actions' }, actions)
        ])
      ])
    ])
  ]);
}
