import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      { find: '@fmms/shared', replacement: path.resolve(__dirname, '../../packages/shared/src/index.ts') },
    ],
  },
  server: {
    port: 5181,
    proxy: {
      // BFF 代理：/api 全部转发到 admin/backend
      '/api': { target: 'http://localhost:5180', changeOrigin: true },
      // /auth 下只有 API 走 BFF；/auth/callback 和 /auth/login 是前端页面路由，不走代理
      '/auth/check': { target: 'http://localhost:5180', changeOrigin: true },
      '/auth/me': { target: 'http://localhost:5180', changeOrigin: true },
      '/auth/logout': { target: 'http://localhost:5180', changeOrigin: true },
      '/auth/sso-config': { target: 'http://localhost:5180', changeOrigin: true },
    },
  },
});
