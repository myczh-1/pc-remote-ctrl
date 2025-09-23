import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,  
    // allowedHosts: ['db78ed4ea13a.ngrok-free.app'],
    // hmr: {
    //   protocol: 'wss',
    //   host: 'db78ed4ea13a.ngrok-free.app',
    //   clientPort: 443
    // },
    proxy: {
      '/api': {
        target: 'http://localhost:7071', // 你的 grpc-web 网关
        changeOrigin: true,
        ws: true, // 允许 websocket 代理，便于 grpc-web 流式
        rewrite: (p) => p.replace(/^\/api/, ''), // ⬅️ 去掉前缀
      },
    },
  },
})
