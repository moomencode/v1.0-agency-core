export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(value) {
  return escapeHtml(value);
}

export function escapeJsxText(value) {
  return String(value).replace(/`/g, '\\`').replace(/\\/g, '\\\\').replace(/\$\{/g, '\\${');
}

export function escapeJsxAttr(value) {
  return String(value).replace(/"/g, '&quot;').replace(/&/g, '&amp;').replace(/</g, '&lt;');
}
