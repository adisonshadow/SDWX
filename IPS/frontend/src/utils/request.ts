/**
 * HTTP 请求封装（axios）
 *
 * - 请求拦截：注入 Authorization: Bearer ${getToken()}
 * - 响应拦截：解 { code, message, data } 信封；401 → clearAuth + 跳登录；非 2xx 抛错
 *
 * 后端契约：列表 data={items,page,size,total}；写操作 data={item,...}。
 * request() 返回完整信封 { code, message, data }，由 apiResponse 工具按需解包。
 */
import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { clearAuth, getToken } from '@/auth/auth';

export interface ApiEnvelope<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export class BizError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly httpStatus?: number,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'BizError';
  }
}

const instance: AxiosInstance = axios.create({
  timeout: 15000,
});

// 请求拦截：注入 token
instance.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let unauthorizedRedirecting = false;

// 响应拦截：解信封、统一错误
instance.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiEnvelope>) => {
    const status = error.response?.status;
    // 401 → 清登录态并跳登录（仅触发一次）
    if (status === 401 && !unauthorizedRedirecting) {
      unauthorizedRedirecting = true;
      clearAuth();
      // 保留当前路径用于登录后回跳
      const returnPath = `${window.location.pathname}${window.location.search}`;
      try {
        sessionStorage.setItem('ips_auth_return', returnPath);
      } catch {
        // ignore
      }
      window.location.href = `/auth/login?from=${encodeURIComponent(returnPath)}`;
    }
    return Promise.reject(error);
  },
);

export interface RequestOptions extends AxiosRequestConfig {
  /** 响应类型；默认 unknown */
  responseType?: AxiosRequestConfig['responseType'];
}

/**
 * 发起请求，返回完整信封。
 * 业务失败（code 非 2xx 或 axios 非 2xx）时抛 BizError。
 */
export async function request<T = unknown>(
  url: string,
  options: RequestOptions = {},
): Promise<ApiEnvelope<T>> {
  try {
    const response = await instance.request<ApiEnvelope<T>>({
      url,
      ...options,
    });
    const body = response.data;
    // 信封业务码非 2xx 也视为失败
    if (body && typeof body.code === 'number' && (body.code < 200 || body.code >= 300)) {
      throw new BizError(body.message || '请求失败', body.code, response.status, body.data);
    }
    return body;
  } catch (e) {
    if (e instanceof BizError) throw e;
    const axiosErr = e as AxiosError<ApiEnvelope>;
    const data = axiosErr.response?.data;
    const message =
      (data && typeof data.message === 'string' && data.message) ||
      axiosErr.message ||
      '请求失败';
    throw new BizError(message, data?.code, axiosErr.response?.status, data?.data);
  }
}

export default instance;
