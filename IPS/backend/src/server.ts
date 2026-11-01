/**
 * BFF 服务入口
 */
import { createServer } from 'http';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { opHub } from './ws/opHub.js';
import { eadafClient } from './eadaf/EADAFClient.js';

async function bootstrap(): Promise<void> {
  const app = createApp();
  const server = createServer(app);

  // WebSocket Hub
  opHub.attach(server);

  // 校验 EADAF 连通性（取一次 token，失败非致命）
  try {
    await eadafClient.getToken();
    console.log('[BFF] EADAF 应用 token 获取成功 ✓');
  } catch (e) {
    console.warn('[BFF] ⚠️ EADAF token 获取失败，数据接口将降级（不影响 BFF/前端启动）');
    console.warn((e as Error).message);
    console.warn('[BFF] EADAF 就绪后请求会自动重试，无需重启 BFF');
  }

  server.listen(config.bff.port, () => {
    console.log(`[BFF] IPS BFF 运行于 http://localhost:${config.bff.port}`);
    console.log(`[BFF] EADAF: ${config.eadaf.apiBaseUrl} | 应用: ${config.eadaf.appCode}`);
    console.log(`[BFF] CORS 允许来源: ${config.bff.corsOrigin}`);
    console.log(`[BFF] WebSocket 路径: ${config.bff.wsPath}`);
  });
}

bootstrap().catch((e) => {
  console.error('[BFF] 启动失败:', e);
  process.exit(1);
});
