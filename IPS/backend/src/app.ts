/**
 * Express 应用定义
 */
import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { authRouter } from './routes/auth.routes.js';
import { crudRouter } from './routes/crud.routes.js';
import { craftRouter } from './routes/craft.routes.js';
import { opRouter } from './routes/op.routes.js';
import { sortingGuideRouter } from './advanced-line/sorting-guide.routes.js';
import { callConfigRouter } from './advanced-line/call.routes.js';

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
    res.json({
      code: 200,
      message: 'ok',
      data: { service: 'ips-bff', time: new Date().toISOString() },
    });
  });

  // 鉴权路由（SSO）
  app.use('/auth', authRouter);

  // 业务路由（全部经 authenticate 保护）
  app.use('/api/ips/crud', crudRouter); // 通用 CRUD 代理（全部实体）
  app.use('/api/ips', sortingGuideRouter); // 高级产线业务
  app.use('/api/ips', callConfigRouter);
  app.use('/api/ips', craftRouter); // 工艺管理编排（优先于 op，覆盖聚合 GET）
  app.use('/api/ips', opRouter); // 业务工作流编排

  // 404
  app.use((_req, res) => {
    res.status(404).json({ code: 404, message: '接口不存在', data: null });
  });

  // 全局错误处理
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[BFF] 未捕获错误:', err);
    res.status(500).json({ code: 500, message: err.message ?? '服务器错误', data: null });
  });

  return app;
}
