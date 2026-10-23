import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:5106'

export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.VITE_DOCKER === 'true' ? '0.0.0.0' : undefined,
    allowedHosts: ['rocky-irritant-pointless.ngrok-free.dev'],
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/hubs': {
        target: apiProxyTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
})