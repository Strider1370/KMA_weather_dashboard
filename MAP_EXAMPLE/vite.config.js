import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5173',
        changeOrigin: true,
      },
      '/data': {
        target: 'http://127.0.0.1:5173',
        changeOrigin: true,
      },
      '/gisang-i': {
        target: 'http://127.0.0.1:5173',
        changeOrigin: true,
      },
      '/temp_icon.png': {
        target: 'http://127.0.0.1:5173',
        changeOrigin: true,
      },
      '/vworld-wfs': {
        target: 'https://api.vworld.kr',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/vworld-wfs/, '/req/wfs'),
      },
    },
  },
})
