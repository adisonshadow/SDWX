import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      { find: '@ips/shared', replacement: path.resolve(__dirname, '../packages/shared/src') },
    ],
  },
  server: {
    port: 6082,
    proxy: {
      // 仅代理 BFF 鉴权接口；/auth/login、/auth/callback 是前端 SPA 路由，不可代理
      '/auth/sso-config': { target: 'http://localhost:6081', changeOrigin: true },
      '/auth/check': { target: 'http://localhost:6081', changeOrigin: true },
      '/auth/me': { target: 'http://localhost:6081', changeOrigin: true },
      '/auth/logout': { target: 'http://localhost:6081', changeOrigin: true },
      '/api': { target: 'http://localhost:6081', changeOrigin: true },
      '/ws': { target: 'ws://localhost:6081', ws: true, changeOrigin: true },
    },
  },
});
