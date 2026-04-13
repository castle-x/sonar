import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
  },
  server: {
    port: 5173,
    proxy: {
      // 代理 API 请求到后端服务
      '/apis': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // 代理 WebSocket 请求
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
})
