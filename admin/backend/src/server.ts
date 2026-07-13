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

  // WebSocket
  opHub.attach(server);

  // 校验 EADAF 连通性（取一次 token）
  try {
    await eadafClient.getToken();
    // eslint-disable-next-line no-console
    console.log('[BFF] EADAF 应用 token 获取成功 ✓');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[BFF] ⚠️ EADAF token 获取失败，数据接口将降级（不影响 BFF/前端启动）');
    // eslint-disable-next-line no-console
    console.warn((e as Error).message);
    // eslint-disable-next-line no-console
    console.warn('[BFF] EADAF 就绪后请求会自动重试，无需重启 BFF');
  }

  server.listen(config.bff.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[BFF] FMMS BFF 运行于 http://localhost:${config.bff.port}`);
    // eslint-disable-next-line no-console
    console.log(`[BFF] EADAF: ${config.eadaf.apiBaseUrl} | 应用: ${config.eadaf.appCode}`);
    // eslint-disable-next-line no-console
    console.log(`[BFF] CORS 允许来源: ${config.bff.corsOrigin}`);
  });
}

bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[BFF] 启动失败:', e);
  process.exit(1);
});
