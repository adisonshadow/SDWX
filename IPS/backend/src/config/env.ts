/**
 * BFF 配置 — 从环境变量读取
 *
 * 加载顺序：
 * 1. NODE_ENV=production → .env.production
 * 2. 其他（开发） → .env.development
 * 3. .env （如有，最低优先级兜底）
 */
import dotenv from 'dotenv';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgRoot = path.resolve(__dirname, '..', '..');

const nodeEnv = process.env.NODE_ENV ?? 'development';
const envFile = nodeEnv === 'production' ? '.env.production' : '.env.development';

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
    apiBaseUrl: required('EADAF_API_BASE_URL', 'http://localhost:29527').replace(/\/$/, ''),
    frontendUrl: required('EADAF_FRONTEND_URL', 'http://localhost:29527').replace(/\/$/, ''),
    appCode: optional('IPS_APP_CODE', 'IPS'),
    applicationId: required(
      'IPS_APPLICATION_ID',
      '10000000-0001-4000-8000-000000000005',
    ),
    appSecret: required('IPS_APP_SECRET'),
    storageBucket: optional('EADAF_STORAGE_BUCKET', 'fmms'),
  },
  sso: {
    jwtSalt: required('SSO_JWT_SALT'),
    redirectMode: optional('SSO_REDIRECT_MODE', 'POST_REDIRECT') as 'POST_REDIRECT' | 'HEADER_REDIRECT',
    callbackUrl: optional('SSO_CALLBACK_URL', 'http://localhost:6081/auth/callback'),
  },
  bff: {
    port: optionalInt('BFF_PORT', 6081),
    corsOrigin: optional('BFF_CORS_ORIGIN', 'http://localhost:6082'),
    frontendUrl: optional('FRONTEND_URL', 'http://localhost:6082').replace(/\/$/, ''),
    wsPath: optional('BFF_WS_PATH', '/ws/ips'),
  },
} as const;

export type AppConfig = typeof config;
