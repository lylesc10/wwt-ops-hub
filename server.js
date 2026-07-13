/**
 * Express host — serves the built SPA from dist/ and file-routes api/**
 * handlers exactly like Vercel does:
 *
 *   api/docgen/generate.js               → /api/docgen/generate
 *   api/docgen/documents/[id].js         → /api/docgen/documents/:id     (req.query.id)
 *   api/docgen/documents/[id]/download.js→ /api/docgen/documents/:id/download
 *
 * Usage: npm run build && node server.js   (PORT env, default 8787)
 * Dev:   node server.js in one terminal + `npm run dev` (Vite proxies /api here).
 */

import express from 'express'
import { readdirSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { log, logError } from './api/_lib/log.js'

// Load .env when present (values already in the environment win)
try { process.loadEnvFile() } catch { /* no .env — fine */ }

// Azure Application Insights — only starts when a connection string is
// configured, so local dev and CI stay instrumentation-free by default.
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  const appInsights = (await import('applicationinsights')).default
  appInsights.setup().setSendLiveMetrics(true).start()
  log.info('[server] Application Insights started')
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API_DIR = path.join(__dirname, 'api')
const DIST_DIR = path.join(__dirname, 'dist')
const PORT = Number(process.env.PORT) || 8787

const app = express()
app.use(express.json({ limit: '25mb' }))

// ── File-based API routing ────────────────────────────────────────────────────

function collectHandlers(dir, urlPrefix = '/api') {
  const routes = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue // _lib etc. are not routable
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      routes.push(...collectHandlers(full, `${urlPrefix}/${entry.name}`))
      continue
    }
    if (!entry.name.endsWith('.js')) continue
    const base = entry.name.slice(0, -3)
    const segment = base === 'index' ? '' : `/${base}`
    routes.push({ url: `${urlPrefix}${segment}`, file: full })
  }
  return routes
}

// Vercel [param] segments → Express :param, remembering the names
function toExpressPath(url) {
  const params = []
  const expressPath = url.replace(/\[(\w+)\]/g, (_, name) => {
    params.push(name)
    return `:${name}`
  })
  return { expressPath, params }
}

const routes = collectHandlers(API_DIR)
// Static segments before dynamic ones so /documents/index beats /documents/[id]
routes.sort((a, b) => (a.url.includes('[') ? 1 : 0) - (b.url.includes('[') ? 1 : 0))

for (const route of routes) {
  const { expressPath } = toExpressPath(route.url)
  app.all(expressPath, async (req, res) => {
    try {
      const mod = await import(pathToFileURL(route.file).href)
      // Vercel-style: route params + query string merged into req.query.
      // Express 5 defines req.query as a getter, so shadow it on the instance.
      const merged = { ...req.query, ...req.params }
      Object.defineProperty(req, 'query', { value: merged, writable: true, configurable: true })
      return mod.default(req, res)
    } catch (e) {
      logError(`[server] ${expressPath} failed:`, e)
      res.status(500).json({ message: 'Internal server error' })
    }
  })
}
log.info({ routeCount: routes.length }, '[server] API routes registered')

// ── Static SPA ────────────────────────────────────────────────────────────────

if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')))
} else {
  app.get('/', (_req, res) => res.send('API host running. Build the SPA with `npm run build`, or use `npm run dev` for the frontend.'))
}

app.listen(PORT, () => log.info(`Ops Hub server listening on http://localhost:${PORT}`))
