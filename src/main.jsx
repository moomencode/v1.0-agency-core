import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { applySEO } from './core/seo'
import { applyTheme } from './core/theme'

// Bootstrap engine: inject theme tokens + fonts, then SEO metadata,
// then render the configured business.
applyTheme()
applySEO()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
