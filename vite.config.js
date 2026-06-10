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
    proxy: {
      '/fn-sandbox': {
        target:       'https://api-sandbox.fndev.net',
        changeOrigin: true,
        rewrite:      (p) => p.replace(/^\/fn-sandbox/, ''),
        secure:       true,
      },
    },
  },
})
