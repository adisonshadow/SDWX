/**
 * 用户认证：读 BFF 会话 Cookie，不接受浏览器里的 Bearer。
 *
 * - 会话临近过期时用 refresh_token 续期（同一会话并发请求只续一次）；
 * - 续期失败且 access token 已过期 → 会话作废，返回 401 + `session_expired`；
 * - 业务数据仍由 EADAFClient 用应用令牌访问 EADAF。
 */
import type { NextFunction, Request, Response } from 'express';
import type { SsoUserInfo } from '@fmms/shared';
import { exchangeToken } from '../auth/oauth.js';
import {
  SESSION_COOKIE,
  deleteSession,
  getSession,
  readCookie,
  updateSession,
  type Session,
} from '../auth/session.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SsoUserInfo;
    }
  }
}

/** 提前 60 秒续期，避免刚好卡在过期点上 */
const REFRESH_LEAD_MS = 60_000;

/** 同一会话的续期请求去重 */
const refreshing = new Map<string, Promise<Session | null>>();

async function refresh(sessionId: string, session: Session): Promise<Session | null> {
  if (!session.refreshToken) {
    return Date.now() > session.expiresAt ? null : session;
  }
  const tokens = await exchangeToken({
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
  });
  return updateSession(sessionId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? session.refreshToken,
    expiresAt: Date.now() + (tokens.expires_in || 900) * 1000,
  });
}

async function ensureFresh(sessionId: string, session: Session): Promise<Session | null> {
  if (Date.now() < session.expiresAt - REFRESH_LEAD_MS) return session;

  let pending = refreshing.get(sessionId);
  if (!pending) {
    pending = refresh(sessionId, session)
      .catch((e: Error) => {
        // eslint-disable-next-line no-console
        console.warn(`[auth] 会话续期失败: ${e.message}`);
        return Date.now() > session.expiresAt ? null : session;
      })
      .finally(() => refreshing.delete(sessionId));
    refreshing.set(sessionId, pending);
  }
  return pending;
}

/** 取当前会话（会按需续期）；无效返回 null */
export async function resolveSession(req: Request): Promise<{ id: string; session: Session } | null> {
  const id = readCookie(req, SESSION_COOKIE);
  const session = getSession(id);
  if (!id || !session) return null;
  const fresh = await ensureFresh(id, session);
  if (!fresh) {
    deleteSession(id);
    return null;
  }
  return { id, session: fresh };
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const resolved = await resolveSession(req);
    if (!resolved) {
      res.status(401).json({ code: 401, message: '未认证或会话已过期', data: null, error_code: 'SESSION_EXPIRED' });
      return;
    }
    req.user = resolved.session.user;
    next();
  } catch (e) {
    next(e);
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const resolved = await resolveSession(req);
    req.user = resolved?.session.user;
    next();
  } catch {
    req.user = undefined;
    next();
  }
}
