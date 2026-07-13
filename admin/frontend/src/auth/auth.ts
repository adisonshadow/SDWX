/**
 * SSO 认证工具 — 改编自 EADAF AIBase_with_example/src/auth/auth.ts
 *
 * token 存 localStorage；checkAuth 调 BFF /auth/check；buildSsoLoginUrl 构造 EADAF 登录跳转。
 */
const TOKEN_KEY = 'fmms_token';
const REFRESH_TOKEN_KEY = 'fmms_refresh_token';
const USER_INFO_KEY = 'fmms_user_info';

export function saveAuth(token: string, refreshToken?: string, userInfo?: unknown) {
  localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  if (userInfo) localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getUserInfo<T = unknown>(): T | null {
  const raw = localStorage.getItem(USER_INFO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const AUTH_RETURN_KEY = 'fmms_auth_return';

export function saveAuthReturnPath(path: string) {
  sessionStorage.setItem(AUTH_RETURN_KEY, path);
}

export function consumeAuthReturnPath(fallback = '/OPWeb'): string {
  const saved = sessionStorage.getItem(AUTH_RETURN_KEY);
  sessionStorage.removeItem(AUTH_RETURN_KEY);
  return saved || fallback;
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_INFO_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

/**
 * 检查登录状态
 *
 * 策略：本地有 token 即视为登录（乐观）。
 * - /auth/check 返回 200 → 确认有效
 * - /auth/check 返回 401 → token 确实无效，返回 false
 * - /auth/check 网络错误/502/其他 → BFF 暂不可达，不踢人，返回 true（本地 token 仍在）
 */
export async function checkAuth(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch(`/auth/check`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return true;
    if (res.status === 401) return false; // token 明确无效
    return true; // BFF 异常（502/500等），不踢人
  } catch {
    return true; // 网络错误（BFF 没启动），不踢人
  }
}

/** 构造 EADAF SSO 登录 URL */
export function buildSsoLoginUrl(applicationId?: string): string {
  const appId = applicationId || import.meta.env.VITE_SSO_APPLICATION_ID;
  const eadafFrontend = import.meta.env.VITE_SSO_EADAF_FRONTEND || 'http://localhost:9527';
  return `${eadafFrontend}/auth/login?app=${appId}`;
}
