import { isNode } from './tree.js';
import { escapeHtml, escapeAttr } from './escape.js';
import { iconSvg } from '../components/icons.js';

const VOID_TAGS = new Set(['img', 'input', 'br', 'hr', 'meta', 'link']);

const ATTR_ALIAS = {
  className: 'class',
  ariaLabel: 'aria-label',
  ariaHidden: 'aria-hidden',
  ariaExpanded: 'aria-expanded',
  dataSection: 'data-section',
  dataBookingForm: 'data-booking-form',
  dataWhatsapp: 'data-whatsapp',
  dataThemeToggle: 'data-theme-toggle',
  dataNavToggle: 'data-nav-toggle',
  htmlFor: 'for',
  inputmode: 'inputmode'
};

const DROP_ATTRS = new Set(['style']);

export function serializeTreeHtml(node, depth = 0) {
  if (typeof node === 'string' || typeof node === 'number') return escapeHtml(String(node));
  if (!isNode(node)) return '';
  const pad = '  '.repeat(depth);
  if (node.type === 'text') return escapeHtml(node.text);
  if (node.type === 'icon') {
    const svg = iconSvg(node.name, node.props || {});
    return svg ? pad + svg : '';
  }
  if (node.type === 'stars') {
    const count = Math.max(0, Math.min(5, Number(node.count) || 0));
    return pad + Array.from({ length: count }, () => iconSvg('star')).join('');
  }
  if (node.type === 'element') {
    const attrs = [];
    for (const [k, v] of Object.entries(node.props || {})) {
      if (DROP_ATTRS.has(k) || v === null || v === undefined || v === false) continue;
      if (k === 'novalidate') {
        attrs.push(' novalidate');
        continue;
      }
      const name = ATTR_ALIAS[k] || k;
      attrs.push(` ${name}="${escapeAttr(v)}"`);
    }
    const children = node.children || [];
    if (VOID_TAGS.has(node.tag)) {
      return `${pad}<${node.tag}${attrs.join('')} />`;
    }
    if (!children.length) {
      return `${pad}<${node.tag}${attrs.join('')}></${node.tag}>`;
    }
    const inner = children.map((c) => serializeTreeHtml(c, depth + 1)).filter((s) => s !== '').join('\n');
    const selfText = children.length === 1 && children[0].type === 'text';
    if (selfText) {
      return `${pad}<${node.tag}${attrs.join('')}>${escapeHtml(children[0].text)}</${node.tag}>`;
    }
    return `${pad}<${node.tag}${attrs.join('')}>\n${inner}\n${pad}</${node.tag}>`;
  }
  return '';
}

export function serializeBodyHtml(nodes) {
  return nodes.map((n) => serializeTreeHtml(n)).filter((s) => s !== '').join('\n');
}
