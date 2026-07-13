/**
 * HTTP 请求封装 — 改编自参考工程 demoApi.ts 的 request<T>()
 *
 * 自动注入 Bearer token，解包 {code,message,data}.data 封装
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

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('fmms_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** GET 请求 */
export async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { ...authHeaders() } });
  const json = (await res.json()) as Envelope<T>;
  if (!res.ok) {
    throw new Error(json.message || `请求失败 (${res.status})`);
  }
  return json.data;
}

/** POST 请求 */
export async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as Envelope<T>;
  if (!res.ok) {
    throw new Error(json.message || `请求失败 (${res.status})`);
  }
  return json.data;
}

/** PATCH 请求 */
export async function patch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as Envelope<T>;
  if (!res.ok) {
    throw new Error(json.message || `请求失败 (${res.status})`);
  }
  return json.data;
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
