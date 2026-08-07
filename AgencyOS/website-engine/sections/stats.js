import { el, text } from '../renderer/tree.js';
import { Section, Container, SectionHeader } from '../components/index.js';

export default function buildStats(ctx) {
  const cfg = ctx.configs['stats.json'];
  if (!cfg || !Array.isArray(cfg.items) || !cfg.items.length) return null;
  const items = cfg.items.slice(0, 4).map((s) => {
    const value = typeof s.value === 'number'
      ? (s.decimals ? s.value.toFixed(s.decimals) : String(s.value))
      : String(s.value ?? '');
    return el('div', { className: 'stat', id: `stat-${s.id || value}` }, [
      el('div', { className: 'stat__value' }, [text(`${value}${s.suffix || ''}`)]),
      el('div', { className: 'stat__label' }, [text(s.label || '')])
    ]);
  });
  return Section({ id: 'stats', name: 'stats', variant: 'deep', ariaLabel: 'Statistics' }, [
    Container({}, [
      SectionHeader({ eyebrow: cfg.heading?.eyebrow || 'By The Numbers', title: cfg.heading?.title || 'Our stats' }),
      el('div', { className: 'stats__grid' }, items)
    ])
  ]);
}
