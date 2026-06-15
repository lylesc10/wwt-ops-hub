/**
 * Production server for container deployments (Azure Container Apps, etc.)
 *
 * Replaces the Vercel runtime: it serves the built Vite SPA from dist/ and
 * routes /api/* to the existing serverless handlers in api/*.js, calling each
 * module's default export with (req, res) — the same contract Vercel uses and
 * that the Vite dev plugin in vite.config.js emulates.
 *
 * Locally:  npm run build && node server.js   (http://localhost:8080)
 */
import express from 'express'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { readdirSync, statSync, existsSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 8080
const API_DIR = path.join(__dirname, 'api')
const DIST_DIR = path.join(__dirname, 'dist')

const app = express()
// Container Apps ingress terminates TLS and sets X-Forwarded-* — trust it so the
// rate limiter in api/_lib/middleware.js sees the real client IP.
app.set('trust proxy', true)
app.disable('x-powered-by')

// Body parsing. Twilio's inbound webhook posts urlencoded; everything else JSON.
// Generous limit because some /api/sync/* routes accept uploaded spreadsheets.
app.use(express.json({ limit: '25mb' }))
app.use(express.urlencoded({ extended: true, limit: '25mb' }))

/**
 * Walk api/ and turn each file into a route path, mirroring Vercel's
 * filesystem routing:
 *   api/fn/work-orders.js        -> /api/fn/work-orders
 *   api/credentials/index.js     -> /api/credentials
 *   api/fn/provider/[id].js      -> /api/fn/provider/:id   (param -> req.query.id)
 * Files under api/_lib are shared code, not routes.
 */
function collectRoutes(dir, base = '') {
  const routes = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '_lib') continue
      routes.push(...collectRoutes(full, `${base}/${entry}`))
      continue
    }
    if (!entry.endsWith('.js')) continue
    const name = entry.slice(0, -3) // drop .js
    const segment = name === 'index' ? '' : `/${name}`
    // Vercel [param] dynamic segment -> Express :param
    const routePath = `/api${base}${segment}`.replace(/\[([^\]]+)\]/g, ':$1')
    routes.push({ routePath, file: full })
  }
  return routes
}

async function registerRoutes() {
  const routes = collectRoutes(API_DIR)
  // Register static segments before dynamic (:param) ones so a literal path
  // can't be swallowed by a sibling param route.
  routes.sort((a, b) => (a.routePath.includes(':') ? 1 : 0) - (b.routePath.includes(':') ? 1 : 0))

  for (const { routePath, file } of routes) {
    let handler
    try {
      const mod = await import(pathToFileURL(file).href)
      handler = mod.default ?? mod
    } catch (err) {
      // A handler that builds a client (e.g. Supabase/Twilio) at import time
      // can throw when its credentials are absent. Skip it rather than crashing
      // the whole server — the other routes stay up.
      console.warn(`[server] failed to load ${path.relative(__dirname, file)} — skipped: ${err.message}`)
      continue
    }
    if (typeof handler !== 'function') {
      console.warn(`[server] ${file} has no default export handler — skipped`)
      continue
    }
    // Catch every method; the handlers branch on req.method themselves.
    app.all(routePath, (req, res) => {
      // Vercel merges dynamic path params into req.query; do the same.
      Object.assign(req.query, req.params)
      Promise.resolve(handler(req, res)).catch((err) => {
        console.error(`[server] ${routePath}`, err)
        if (!res.headersSent) res.status(500).json({ message: err.message })
      })
    })
    console.log(`[server] route  ${routePath.padEnd(34)} -> ${path.relative(__dirname, file)}`)
  }
}

await registerRoutes()

// Static SPA + client-side routing fallback.
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  app.get(/.*/, (req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')))
} else {
  console.warn('[server] dist/ not found — run `npm run build` first')
}

app.listen(PORT, () => console.log(`[server] listening on :${PORT}`))
