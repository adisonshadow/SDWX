/**
 * 会话客户端。令牌只在 BFF，浏览器不保存 access_token。
 * 对齐 EADAF app_example/src/auth/auth.ts。
 */
const AUTH_RETURN_KEY = 'fmms_auth_return';

export interface SessionUser {
  user_id?: string;
  username?: string;
  name?: string;
}

export function saveAuthReturnPath(path: string) {
  sessionStorage.setItem(AUTH_RETURN_KEY, path);
}

export function consumeAuthReturnPath(fallback = '/OPWeb'): string {
  const saved = sessionStorage.getItem(AUTH_RETURN_KEY);
  sessionStorage.removeItem(AUTH_RETURN_KEY);
  return saved || fallback;
}

export async function fetchSession(): Promise<'authenticated' | 'unauthenticated' | 'unknown'> {
  try {
    const res = await fetch('/auth/me', { credentials: 'include' });
    if (res.ok) return 'authenticated';
    if (res.status === 401) return 'unauthenticated';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function checkAuth(): Promise<boolean> {
  const status = await fetchSession();
  if (status === 'authenticated') return true;
  if (status === 'unauthenticated') return false;
  return false;
}

/** 整页跳到 BFF，由 BFF 302 到 EADAF 授权页 */
export async function startLogin(redirect?: string): Promise<void> {
  const res = await fetch('/auth/sso-config', { credentials: 'include' });
  const json = (await res.json()) as { data?: { login_url?: string } };
  const loginUrl = json.data?.login_url;
  if (!loginUrl) throw new Error('未取得登录地址');
  const target = redirect && redirect.startsWith('/') ? redirect : '/OPWeb';
  window.location.href = `${loginUrl}?redirect=${encodeURIComponent(target)}`;
}

export async function logout(): Promise<void> {
  try {
    const res = await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    const json = (await res.json()) as { data?: { end_session_url?: string } };
    if (json.data?.end_session_url) {
      window.location.href = json.data.end_session_url;
      return;
    }
  } catch {
    // 清不掉服务端会话时仍回登录页
  }
  window.location.href = '/auth/login';
}
