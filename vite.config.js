import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync, readdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Resolve a URL path to an api/ handler file, handling [param].js dynamic segments.
 * Returns { file, params } or null if nothing matches.
 *
 * e.g. /data/projects        → api/data/[entity].js  { entity: 'projects' }
 *      /data/projects/uuid   → api/data/[entity].js  { entity: 'projects' }  (entity.js handles the rest via req.path)
 *      /fn/provider/123      → api/fn/provider/[id].js  { id: '123' }
 */
function resolveApiHandler(urlPath) {
  // urlPath is like /data/projects or /fn/provider/123 (already stripped of /api prefix)
  const segments = urlPath.split('/').filter(Boolean)

  for (let depth = segments.length; depth >= 1; depth--) {
    const dirSegments = segments.slice(0, depth - 1)
    const fileSegment = segments[depth - 1]
    const dir = path.resolve(__dirname, 'api', ...dirSegments)

    // Try exact file first
    const exact = path.join(dir, `${fileSegment}.js`)
    if (existsSync(exact)) return { file: exact, params: {} }

    // Try [param].js in the same directory
    if (existsSync(dir)) {
      const dynFile = readdirSync(dir).find(f => /^\[.+\]\.js$/.test(f))
      if (dynFile) {
        const paramName = dynFile.slice(1, dynFile.indexOf(']'))
        return {
          file: path.join(dir, dynFile),
          params: { [paramName]: fileSegment },
        }
      }
    }
  }

  // Try index.js in the path as a directory
  const indexFile = path.resolve(__dirname, 'api', ...segments, 'index.js')
  if (existsSync(indexFile)) return { file: indexFile, params: {} }

  return null
}

function apiDevPlugin(env) {
  return {
    name: 'api-dev',
    configureServer(server) {
      // Bridge server-side env vars that aren't VITE_* prefixed
      const set = (k, ...sources) => { if (!process.env[k]) process.env[k] = sources.find(Boolean) ?? '' }
      set('ANTHROPIC_API_KEY', env.ANTHROPIC_API_KEY)
      set('DATABASE_URL',      env.DATABASE_URL)
      set('JWT_SECRET',        env.JWT_SECRET)
      set('JWT_REFRESH_SECRET',env.JWT_REFRESH_SECRET)

      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next()

        // Collect body
        const chunks = []
        await new Promise((resolve, reject) => {
          req.on('data', c => chunks.push(c))
          req.on('end', resolve)
          req.on('error', reject)
        })
        const rawBody = Buffer.concat(chunks).toString('utf-8')
        try { req.body = rawBody ? JSON.parse(rawBody) : {} } catch { req.body = {} }

        // Resolve to api/*.js handler — supports [param].js dynamic segments
        const urlPathNoQuery = req.url.split('?')[0].replace(/^\/api/, '')
        const resolved = resolveApiHandler(urlPathNoQuery)

        if (!resolved) return next()

        const { file, params } = resolved
        // Inject dynamic params into req.query and req.params (Vercel-style)
        if (!req.params) req.params = {}
        Object.assign(req.params, params)
        Object.assign(req.query ?? {}, params)

        // Vercel-compatible res shim
        let statusCode = 200
        const headers = {}
        const mockRes = {
          status(code) { statusCode = code; return mockRes },
          setHeader(k, v) { headers[k] = v },
          json(data) {
            res.writeHead(statusCode, { 'Content-Type': 'application/json', ...headers })
            res.end(JSON.stringify(data))
          },
          send(data) {
            res.writeHead(statusCode, { ...headers })
            res.end(data)
          },
        }

        try {
          const mod = await import(`${file}?t=${Date.now()}`)
          await (mod.default ?? mod)(req, mockRes)
        } catch (e) {
          console.error('[api-dev]', path.relative(__dirname, file), e.message)
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ message: e.message }))
          }
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), apiDevPlugin(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/fn-sandbox': {
          target:       'https://api-sandbox.fndev.net',
          changeOrigin: true,
          rewrite:      (p) => p.replace(/^\/fn-sandbox/, ''),
          secure:       true,
        },
      },
    },
  }
})
