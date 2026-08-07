import { el, text, icon, stars } from '../renderer/tree.js';
import { iconSvg } from './icons.js';

export function Container(props = {}, children = []) {
  return el('div', { className: 'container' }, children);
}

export function Section({ id, name, variant = null, ariaLabel = null }, children = []) {
  const cls = ['sec'];
  if (variant) cls.push(`sec--${variant}`);
  const props = { className: cls.join(' '), 'data-section': name };
  if (id) props.id = id;
  if (ariaLabel) props.ariaLabel = ariaLabel;
  return el('section', props, children);
}

export function SectionHeader({ eyebrow = null, title, sub = null }) {
  const children = [];
  if (eyebrow) children.push(el('span', { className: 'sec__eyebrow' }, [icon('sparkles'), text(eyebrow)]));
  children.push(el('h2', { className: 'sec__title' }, [text(title)]));
  if (sub) children.push(el('p', { className: 'sec__sub' }, [text(sub)]));
  return el('div', { className: 'sec__head' }, children);
}

export function Card(props = {}, children = []) {
  return el('div', { className: 'card', ...props }, children);
}

export function Button({ label, href = null, variant = 'primary', iconName = null, ariaLabel = null, external = false, onClick = null }) {
  const children = [];
  if (iconName) children.push(icon(iconName));
  children.push(text(label));
  const props = { className: `btn btn--${variant}` };
  if (ariaLabel) props.ariaLabel = ariaLabel;
  if (onClick) props.onClick = onClick;
  if (href) {
    props.href = href;
    if (external) {
      props.rel = 'noopener noreferrer';
      props.target = '_blank';
    }
    return el('a', props, children);
  }
  return el('button', { ...props, type: 'button' }, children);
}

export function Badge(label) {
  return el('span', { className: 'badge' }, [text(label)]);
}

export function Grid({ cols = 3, children = [] }) {
  return el('div', { className: `grid grid--${cols}` }, children);
}

export function Image({ src, alt, className = '', ariaHidden = false, width = null, height = null }) {
  const props = { src, alt: ariaHidden ? '' : alt };
  if (className) props.className = className;
  if (ariaHidden) props.ariaHidden = 'true';
  if (width) props.width = String(width);
  if (height) props.height = String(height);
  return el('img', props);
}

export function IconChip(name, ariaHidden = true) {
  const chip = el('span', { className: 'icon-chip' }, [icon(name)]);
  if (ariaHidden) chip.props.ariaHidden = 'true';
  return chip;
}

export function StarRow(count, className = 'review__stars') {
  return el('span', { className, role: 'img', ariaLabel: `${count} out of 5 stars` }, [stars(count)]);
}

export function Heading(props = {}, children = []) {
  const { level = 2, className = '' } = props;
  return el(`h${level}`, className ? { className } : {}, children);
}

export function Link(props = {}, children = []) {
  const { href, className = '', ariaLabel = null, external = false } = props;
  const p = {};
  if (className) p.className = className;
  if (ariaLabel) p.ariaLabel = ariaLabel;
  if (external) {
    p.rel = 'noopener noreferrer';
    p.target = '_blank';
  }
  p.href = href;
  return el('a', p, children);
}

export function renderIcon(name) {
  return iconSvg(name);
}

export function svgIconJsx(name) {
  return iconSvg(name);
}
