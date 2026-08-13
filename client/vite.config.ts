import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // react(): enables JSX + Fast Refresh for .tsx files.
  // tailwindcss(): Tailwind v4's Vite plugin — scans source files and
  // generates utility CSS directly, no separate postcss.config needed.
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Lets code import as `@/components/ui/button` instead of relative
      // paths like `../../../components/ui/button` — matches the alias
      // configured in tsconfig.json and components.json (shadcn/ui).
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // During `npm run dev`, forward any request to /api/* on to the Express
    // backend running on port 3000, so the frontend can call relative paths
    // like `/api/v1/auth/login` without hardcoding the backend's origin
    // (and without hitting CORS issues in the browser).
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Socket.IO's handshake is a plain HTTP request that upgrades to a
      // WebSocket — needs its own proxy entry (with ws: true) distinct from
      // the REST '/api' one above, so the client can connect to the
      // same-origin default path (no hardcoded backend URL) in both dev
      // (via this proxy) and production (served from the same origin).
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
