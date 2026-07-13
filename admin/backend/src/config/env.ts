/**
 * BFF 配置 — 从环境变量读取
 *
 * 加载顺序：
 * 1. NODE_ENV=production → .env.production
 * 2. 其他（开发） → .env.development
 * 3. .env （如有，最低优先级兜底）
 *
 * 文件相对于本包根目录（admin/backend），由 dotenv 显式 path 加载。
 */
import dotenv from 'dotenv';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgRoot = path.resolve(__dirname, '..', '..');

const nodeEnv = process.env.NODE_ENV ?? 'development';
const envFile = nodeEnv === 'production' ? '.env.production' : '.env.development';

// 先加载环境特定文件，再加载 .env 兜底（后加载不覆盖已设值）
dotenv.config({ path: path.join(pkgRoot, envFile) });
dotenv.config({ path: path.join(pkgRoot, '.env'), override: false });

function required(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`缺少必需环境变量: ${key}`);
  }
  return v;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function optionalInt(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : fallback;
}

export const config = {
  nodeEnv,
  eadaf: {
    apiBaseUrl: required('EADAF_API_BASE_URL', 'http://localhost:9527').replace(/\/$/, ''),
    frontendUrl: required('EADAF_FRONTEND_URL', 'http://localhost:9527').replace(/\/$/, ''),
    appCode: optional('FMMS_APP_CODE', 'FMMS'),
    applicationId: required(
      'FMMS_APPLICATION_ID',
      '10000000-0001-4000-8000-000000000006',
    ),
    appSecret: required('FMMS_APP_SECRET'),
  },
  sso: {
    jwtSalt: required('SSO_JWT_SALT'),
    redirectMode: optional('SSO_REDIRECT_MODE', 'POST_REDIRECT') as 'POST_REDIRECT' | 'HEADER_REDIRECT',
    callbackUrl: optional('SSO_CALLBACK_URL', 'http://localhost:5180/auth/callback'),
  },
  bff: {
    port: optionalInt('BFF_PORT', 5180),
    corsOrigin: optional('BFF_CORS_ORIGIN', 'http://localhost:5181'),
    frontendUrl: optional('FRONTEND_URL', 'http://localhost:5181').replace(/\/$/, ''),
  },
} as const;

export type AppConfig = typeof config;
