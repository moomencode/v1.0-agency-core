import { readFileSync } from 'node:fs';

export function render(template, data) {
  let out = template;
  const eachRe = /\{\{#each ([a-zA-Z0-9.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  const sections = [];
  let m;
  while ((m = eachRe.exec(template)) !== null) {
    sections.push({ start: m.index, end: m.index + m[0].length, path: m[1], body: m[2] });
  }
  for (const s of sections.reverse()) {
    const list = getPath(data, s.path) || [];
    out = out.slice(0, s.start) + list.map((item) => render(s.body, { ...data, _item: item })).join('') + out.slice(s.end);
  }
  return out.replace(/\{\{([a-zA-Z0-9._]+)\}\}/g, (_, path) => {
    const v = getPath(data, path);
    if (v === null || v === undefined) return '';
    return String(v);
  });
}

function getPath(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function renderFile(templatePath, data) {
  const template = readFileSync(templatePath, 'utf8');
  return render(template, data);
}
