import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // /api/* is served by the Express host (node server.js) in local dev
    proxy: {
      '/api': `http://localhost:${process.env.API_PORT ?? 8787}`,
    },
  },
})
