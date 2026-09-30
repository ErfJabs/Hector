import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Go server serves the built app from frontend/dist; the dev server
// proxies /api to it so `npm run dev` talks to a running backend.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
