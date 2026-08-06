// src/utils/placeholder.js
// -----------------------------------------------------------------
// Generates a placeholder image as an inline SVG data URI, entirely
// on the client with zero network requests. This replaces external
// services like placehold.co, which can be blocked or slow on some
// networks (firewalls, ISPs, ad-blockers), causing images to silently
// fail to load.
//
// Usage:
//   placeholderImage(300, 300, 'Pasta')
//   placeholderImage(300, 300, 'Alfredo', '0b1c15', 'f4efe6')
// -----------------------------------------------------------------

export function placeholderImage(width, height, text, bg = '122a20', fg = 'd4af37') {
  const fontSize = Math.max(14, Math.floor(width / 10))

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#${bg}"/>
      <text
        x="50%"
        y="50%"
        dominant-baseline="middle"
        text-anchor="middle"
        font-family="sans-serif"
        font-size="${fontSize}"
        fill="#${fg}"
      >${text}</text>
    </svg>
  `.trim()

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
