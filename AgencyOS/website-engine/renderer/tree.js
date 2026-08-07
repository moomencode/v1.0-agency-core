export function el(tag, props = {}, children = []) {
  const node = { type: 'element', tag, props: { ...props } };
  if (children && children.length) node.children = children;
  return node;
}

export function text(t) {
  return { type: 'text', text: String(t) };
}

export function icon(name, props = {}) {
  return { type: 'icon', name, props: { ...props } };
}

export function stars(count, props = {}) {
  return { type: 'stars', count, props: { ...props } };
}

export function isNode(v) {
  return v && typeof v === 'object';
}

export function flatChildren(node) {
  const out = [];
  (function walk(n) {
    if (!isNode(n)) return;
    if (n.type === 'element') for (const c of n.children || []) walk(c);
    else out.push(n);
  })(node);
  return out;
}

export function collectNodes(page, predicate) {
  const out = [];
  (function walk(node) {
    if (!isNode(node)) return;
    if (predicate(node)) out.push(node);
    if (node.type === 'element') for (const c of node.children || []) walk(c);
  })({ type: 'element', children: page.sections });
  return out;
}

export function collectText(node) {
  let out = '';
  (function walk(n) {
    if (!isNode(n)) return;
    if (n.type === 'text') out += n.text;
    if (n.type === 'element') for (const c of n.children || []) walk(c);
  })(node);
  return out.trim();
}

export function nodeIds(nodes) {
  const ids = new Set();
  for (const n of nodes) {
    if (n.props && n.props.id) ids.add(n.props.id);
  }
  return ids;
}

export function anchorIds(sections) {
  const ids = new Set();
  for (const s of sections) {
    if (s.props && s.props.id) ids.add(`#${s.props.id}`);
  }
  return ids;
}
