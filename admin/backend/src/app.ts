/**
 * Express 应用定义
 */
import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { authRouter } from './routes/auth.routes.js';
import { opRouter } from './routes/op.routes.js';

export function createApp(): express.Application {
  const app = express();

  app.use(
    cors({
      origin: config.bff.corsOrigin.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 健康检查
  app.get('/health', (_req, res) => {
    res.json({ code: 200, message: 'ok', data: { service: 'fmms-bff', time: new Date().toISOString() } });
  });

  // 路由
  app.use('/auth', authRouter);
  app.use('/api/op', opRouter);

  // 404
  app.use((_req, res) => {
    res.status(404).json({ code: 404, message: '接口不存在', data: null });
  });

  // 全局错误处理
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // eslint-disable-next-line no-console
    console.error('[BFF] 未捕获错误:', err);
    res.status(500).json({ code: 500, message: err.message ?? '服务器错误', data: null });
  });

  return app;
}
