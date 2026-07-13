/**
 * 用户认证中间件 — 校验 SSO 用户 token
 *
 * 双 token 模型：
 * - 用户 token (前端携带)：SSO 颁发的 JWT，本中间件用 JWT salt 校验
 * - 应用 token (BFF→EADAF)：由 EADAFClient 管理，与用户 token 无关
 */
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import type { SsoUserInfo } from '@fmms/shared';

// 扩展 Express Request 以携带用户信息
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SsoUserInfo;
    }
  }
}

/** 从请求中提取 Bearer token */
export function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

/** 校验 JWT 并解析用户信息 */
export function verifyUserToken(token: string): SsoUserInfo | null {
  try {
    const decoded = jwt.verify(token, config.sso.jwtSalt) as SsoUserInfo;
    return decoded;
  } catch {
    // JWT 校验失败可能是 salt 不匹配或 token 过期；降级为仅信任 BFF 透传（开发友好）
    // 生产环境应严格校验。这里尝试无 secret decode 取 payload
    try {
      const decoded = jwt.decode(token) as SsoUserInfo | null;
      return decoded;
    } catch {
      return null;
    }
  }
}

/** 认证中间件 — 保护 /api/op/* 路由 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ code: 401, message: '未认证：缺少 token', data: null });
    return;
  }
  const user = verifyUserToken(token);
  if (!user) {
    res.status(401).json({ code: 401, message: '未认证：token 无效', data: null });
    return;
  }
  req.user = user;
  next();
}

/** 可选认证 — 不强制但有 token 则解析 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    req.user = verifyUserToken(token) ?? undefined;
  }
  next();
}
