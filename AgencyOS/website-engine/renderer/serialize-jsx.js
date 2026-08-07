import { isNode } from './tree.js';
import { escapeJsxText } from './escape.js';
import { iconPaths } from '../components/icons.js';

const VOID_TAGS = new Set(['img', 'input', 'br', 'hr', 'meta', 'link']);

const ATTR_ALIAS = {
  className: 'className',
  ariaLabel: 'aria-label',
  ariaHidden: 'aria-hidden',
  ariaExpanded: 'aria-expanded',
  dataSection: 'data-section',
  dataBookingForm: 'data-booking-form',
  dataWhatsapp: 'data-whatsapp',
  dataThemeToggle: 'data-theme-toggle',
  dataNavToggle: 'data-nav-toggle',
  htmlFor: 'htmlFor',
  inputmode: 'inputMode'
};

const DROP_ATTRS = new Set(['style', 'novalidate']);

function attrsJsx(props) {
  const out = [];
  for (const [k, v] of Object.entries(props || {})) {
    if (DROP_ATTRS.has(k) || v === null || v === undefined || v === false) continue;
    const name = ATTR_ALIAS[k] || k;
    const value = escapeJsxText(v);
    out.push(`${name}={${JSON.stringify(value)}}`);
  }
  return out.length ? ` ${out.join(' ')}` : '';
}

function iconJsx(name, props = {}) {
  const d = iconPaths(name);
  if (!d) return '';
  const size = props.size ? ` style={{ width: ${JSON.stringify(props.size)}, height: ${JSON.stringify(props.size)} }}` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"${size} aria-hidden="true">${d}</svg>`;
}

function starsJsx(count) {
  const n = Math.max(0, Math.min(5, Number(count) || 0));
  return Array.from({ length: n }, () => iconJsx('star')).join('');
}

export function serializeTreeJsx(node, depth = 0) {
  if (typeof node === 'string' || typeof node === 'number') return `{${JSON.stringify(String(node))}}`;
  if (!isNode(node)) return '';
  const pad = '  '.repeat(depth);
  if (node.type === 'text') return `{${JSON.stringify(String(node.text))}}`;
  if (node.type === 'icon') return pad + iconJsx(node.name, node.props || {});
  if (node.type === 'stars') return pad + starsJsx(node.count);
  if (node.type === 'element') {
    const children = node.children || [];
    if (VOID_TAGS.has(node.tag)) {
      return `${pad}<${node.tag}${attrsJsx(node.props)} />`;
    }
    if (!children.length) {
      return `${pad}<${node.tag}${attrsJsx(node.props)} />`;
    }
    const inner = children.map((c) => serializeTreeJsx(c, depth + 1)).filter((s) => s !== '').join('\n');
    return `${pad}<${node.tag}${attrsJsx(node.props)}>\n${inner}\n${pad}</${node.tag}>`;
  }
  return '';
}

export function serializeBodyJsx(nodes) {
  return nodes.map((n) => serializeTreeJsx(n)).filter((s) => s !== '').join('\n');
}
