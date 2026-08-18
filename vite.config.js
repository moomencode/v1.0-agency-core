import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { seoHeadPlugin } from './scripts/seo-head-plugin.mjs'

/**
 * The /assets directory is the site's public media root:
 * logo/, hero/, gallery/, food/, background/, icons/, videos/.
 * Files there are served at the URL path directly (e.g. /logo/logo.png).
 *
 * Because publicDir is no longer the default "public" folder, Vite's dev
 * server does not auto-serve "/" — this tiny plugin rewrites the root
 * request to /index.html (production output is unaffected).
 */
function serveRoot() {
  return {
    name: 'serve-root',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url === '') {
          req.url = '/index.html'
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), serveRoot(), seoHeadPlugin()],
  publicDir: 'assets',
})
