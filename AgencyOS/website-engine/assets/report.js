export function assetReport(site) {
  const a = site.assets;
  const lines = [
    '# Asset Report',
    '',
    `Business: ${site.name} (${site.businessId})`,
    `Layout: ${site.layout.label}`,
    '',
    `References: ${a.count}  |  In-manifest: ${a.refs.filter((r) => r.status === 'in-manifest').length}  |  Placeholders: ${a.refs.filter((r) => r.status === 'placeholder').length}  |  Missing: ${a.missing.length}  |  External: ${a.refs.filter((r) => r.status === 'external').length}`,
    '',
    '| ref | status | group | source |',
    '|---|---|---|---|',
    ...a.refs.map((r) => `| ${r.ref} | ${r.status} | ${r.group || ''} | ${r.source || ''} |`),
    ''
  ];
  if (a.missing.length) {
    lines.push('## Missing assets', '');
    lines.push('The following references are not declared in the assets manifest and no placeholder rule matches:', '');
    lines.push(a.missing.map((m) => `- \`${m}\``).join('\n'));
    lines.push('');
  }
  lines.push('## Placeholder policy');
  lines.push('');
  lines.push('Any image reference with no file on disk is served from a deterministic generated SVG placeholder');
  lines.push('(`/placeholders/*.svg`) so the site always renders complete. Real photography is a drop-in upgrade:');
  lines.push('download the manifest entries into the site `public/` folder and rebuild — output stays identical');
  lines.push('except for the image bytes.');
  lines.push('');
  return lines.join('\n');
}
