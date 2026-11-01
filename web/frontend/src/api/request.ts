/**
 * HTTP 请求封装
 *
 * - 请求带上会话 Cookie，解包 {code,message,data}.data；
 * - 401 统一跳登录（带防抖，避免并发请求多次跳转）；
 * - 其它错误抛 HttpError，页面负责展示错误态，不要吞成空数据。
 */

/** EADAF/BFF 标准响应封装 */
export interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

/** 分页结果 */
export interface Paged<T> {
  items: T[];
  total: number;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const LOGIN_REDIRECT_KEY = 'fmms_login_redirect_at';
const AUTH_RETURN_KEY = 'fmms_auth_return';

/** 401 时回登录页；5 秒内只跳一次，防止并发请求连环跳 */
function handleUnauthorized(): void {
  const now = Date.now();
  const last = Number(sessionStorage.getItem(LOGIN_REDIRECT_KEY) ?? 0);
  if (now - last < 5000) return;
  sessionStorage.setItem(LOGIN_REDIRECT_KEY, String(now));

  const here = `${window.location.pathname}${window.location.search}`;
  if (here.startsWith('/auth/')) return;
  sessionStorage.setItem(AUTH_RETURN_KEY, here);
  window.location.href = '/auth/login';
}

async function parse<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (res.status === 401) {
    handleUnauthorized();
    throw new HttpError(json?.message || '登录已过期，请重新登录', 401);
  }
  if (!res.ok) {
    throw new HttpError(json?.message || `请求失败 (${res.status})`, res.status);
  }
  return (json as Envelope<T>).data;
}

/** GET 请求 */
export async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' });
  return parse<T>(res);
}

/** POST 请求 */
export async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parse<T>(res);
}

/** PATCH 请求 */
export async function patch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parse<T>(res);
}

/** 上传文件 (base64) */
export async function upload(path: string, filename: string, file: File): Promise<{ object_id: string }> {
  const data = await fileToBase64(file);
  return post(path, { filename, data });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
