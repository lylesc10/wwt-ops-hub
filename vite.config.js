import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function apiDevPlugin(env) {
  return {
    name: 'api-dev',
    configureServer(server) {
      // Bridge env vars — loadEnv reads .env but doesn't auto-populate process.env
      const set = (k, ...sources) => { if (!process.env[k]) process.env[k] = sources.find(Boolean) ?? '' }
      set('SUPABASE_URL',              env.SUPABASE_URL,              env.VITE_SUPABASE_URL)
      set('SUPABASE_ANON_KEY',         env.SUPABASE_ANON_KEY,         env.VITE_SUPABASE_ANON_KEY)
      set('SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY, env.VITE_SUPABASE_SERVICE_ROLE_KEY)
      set('ANTHROPIC_API_KEY',         env.ANTHROPIC_API_KEY)

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

        // Resolve to api/*.js file
        const routePath = req.url.split('?')[0].replace(/^\/api/, '')
        const filePath = path.resolve(__dirname, 'api' + routePath + '.js')

        if (!existsSync(filePath)) return next()

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
          const mod = await import(`${filePath}?t=${Date.now()}`)
          await (mod.default ?? mod)(req, mockRes)
        } catch (e) {
          console.error('[api-dev]', filePath, e.message)
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
