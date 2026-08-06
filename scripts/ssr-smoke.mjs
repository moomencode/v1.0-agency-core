import React from 'react'
import { renderToString } from 'react-dom/server'
import App from '../src/App.jsx'

try {
  const html = renderToString(React.createElement(App))
  const checks = ['id="menu"', 'id="home"', 'id="offers"', 'id="reservation"', 'id="gallery"', 'id="location"', 'id="footer"', 'GARCIA']
  const missing = checks.filter((c) => !html.includes(c))
  if (missing.length) {
    console.error('SSR FAIL: missing ->', missing)
    process.exit(1)
  }
  console.log('SSR OK — all sections rendered. HTML length:', html.length)
} catch (err) {
  console.error('SSR CRASH:', err)
  process.exit(1)
}
