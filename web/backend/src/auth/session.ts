/**
 * BFF 会话。浏览器只持有 httpOnly Cookie，access/refresh 令牌留在进程内。
 *
 * 生命周期约定：
 * - `expiresAt` 是 access token 的过期时间，临近过期由中间件用 refresh_token 续期；
 * - 续期失败且 token 已过期 → 会话作废（401，前端回登录页）；
 * - 会话 Map 与待登录 Map 都有 TTL + 定时清理，避免长期运行泄漏。
 *
 * 会话写在 web/backend/data/sessions.json，BFF 重启后仍可续期。
 * 待登录的 PKCE 状态仍只放内存（十分钟内用完）。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response } from 'express';

export const SESSION_COOKIE = 'fmms_session';
export const LOGIN_COOKIE = 'fmms_login';

/** 待登录（PKCE state）保留 10 分钟，与 LOGIN_COOKIE 的 Max-Age 一致 */
const PENDING_LOGIN_TTL_MS = 10 * 60 * 1000;
/** 会话兜底 TTL：超过这个时间无论 token 如何都失效（与 Cookie 7 天一致） */
const SESSION_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
/** 清理任务间隔 */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export interface PendingLogin {
  state: string;
  verifier: string;
  redirectTo: string;
  createdAt: number;
}

export interface Session {
  accessToken: string;
  refreshToken?: string;
  /** access token 过期时间（ms） */
  expiresAt: number;
  /** 会话创建时间（ms），用于兜底 TTL */
  createdAt: number;
  sid: string | null;
  user: {
    user_id?: string;
    username?: string;
    name?: string;
    avatar?: string | null;
  };
}

const pendingLogins = new Map<string, PendingLogin>();
const sessions = new Map<string, Session>();
const sessionFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/sessions.json');

function loadSessions(): void {
  try {
    const raw = JSON.parse(fs.readFileSync(sessionFile, 'utf8')) as { sessions?: Array<[string, Session]> };
    for (const [id, session] of raw.sessions ?? []) {
      if (session?.accessToken) sessions.set(id, session);
    }
  } catch {
    // 第一次启动还没有文件
  }
}

function persistSessions(): void {
  fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
  fs.writeFileSync(sessionFile, JSON.stringify({ sessions: [...sessions.entries()] }));
}

loadSessions();

export function createId(): string {
  return crypto.randomUUID();
}

// ---- 待登录（PKCE） ----

export function rememberLogin(id: string, pending: PendingLogin): void {
  pendingLogins.set(id, pending);
}

export function takeLogin(id: string | undefined): PendingLogin | null {
  if (!id) return null;
  const pending = pendingLogins.get(id) ?? null;
  if (pending) pendingLogins.delete(id);
  if (!pending) return null;
  if (Date.now() - pending.createdAt > PENDING_LOGIN_TTL_MS) return null;
  return pending;
}

// ---- 会话 ----

export function saveSession(session: Omit<Session, 'createdAt'> & { createdAt?: number }): string {
  const id = createId();
  sessions.set(id, { ...session, createdAt: session.createdAt ?? Date.now() });
  persistSessions();
  return id;
}

export function getSession(id: string | undefined): Session | null {
  if (!id) return null;
  const session = sessions.get(id);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_MAX_AGE_MS) {
    sessions.delete(id);
    persistSessions();
    return null;
  }
  return session;
}

/** 续期后原位更新（sessionId 不变，浏览器 Cookie 不用换） */
export function updateSession(id: string, patch: Partial<Session>): Session | null {
  const session = sessions.get(id);
  if (!session) return null;
  const next = { ...session, ...patch };
  sessions.set(id, next);
  persistSessions();
  return next;
}

export function deleteSession(id: string | undefined): void {
  if (id && sessions.delete(id)) persistSessions();
}

/** EADAF 侧登出/踢人时按 sid 清掉该用户的所有 BFF 会话 */
export function deleteSessionsBySid(sid: string): number {
  let removed = 0;
  for (const [id, session] of sessions) {
    if (session.sid === sid) {
      sessions.delete(id);
      removed += 1;
    }
  }
  if (removed > 0) persistSessions();
  return removed;
}

// ---- Cookie ----

export function readCookie(req: Request, name: string): string | undefined {
  return readCookieFromString(req.headers.cookie, name);
}

/** 同一套解析，供 WS 握手（拿到的是 IncomingMessage 的 header 字符串）复用 */
export function readCookieFromString(raw: string | undefined, name: string): string | undefined {
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    if (trimmed.slice(0, index) === name) {
      return decodeURIComponent(trimmed.slice(index + 1));
    }
  }
  return undefined;
}

export interface CookieOptions {
  maxAgeSec: number;
  /** 生产环境（HTTPS）应开启；本地 http 调试时关闭 */
  secure?: boolean;
}

export function setCookie(res: Response, name: string, value: string, options: CookieOptions): void {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${options.maxAgeSec}`,
  ];
  if (options.secure) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  const list = prev == null ? [] : Array.isArray(prev) ? prev.map(String) : [String(prev)];
  res.setHeader('Set-Cookie', [...list, parts.join('; ')]);
}

export function clearCookie(res: Response, name: string, secure = false): void {
  setCookie(res, name, '', { maxAgeSec: 0, secure });
}

// 定时清理：过期会话与残留的待登录记录
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_MAX_AGE_MS) sessions.delete(id);
  }
  for (const [id, pending] of pendingLogins) {
    if (now - pending.createdAt > PENDING_LOGIN_TTL_MS) pendingLogins.delete(id);
  }
}, SWEEP_INTERVAL_MS);
sweeper.unref?.();
