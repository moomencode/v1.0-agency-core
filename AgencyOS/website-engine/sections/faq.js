import { el, text, icon } from '../renderer/tree.js';
import { Section, Container, SectionHeader } from '../components/index.js';

export default function buildFaq(ctx) {
  const cfg = ctx.configs['faq.json'];
  if (!cfg || !Array.isArray(cfg.items) || !cfg.items.length) return null;
  const items = cfg.items.slice(0, 8).map((f) =>
    el('details', { className: 'faq__item', name: 'faq', id: `faq-${f.id ?? f.question}` }, [
      el('summary', { className: 'faq__q' }, [text(f.question), icon('chevron-down')]),
      el('div', { className: 'faq__a' }, [text(f.answer || '')])
    ])
  );
  return Section({ id: 'faq', name: 'faq', ariaLabel: 'Frequently asked questions' }, [
    Container({}, [
      SectionHeader({ eyebrow: cfg.heading?.eyebrow || 'FAQ', title: cfg.heading?.title || 'Frequently asked questions' }),
      el('div', { className: 'faq__list' }, items)
    ])
  ]);
}
