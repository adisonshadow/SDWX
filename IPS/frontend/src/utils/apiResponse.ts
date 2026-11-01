import type { ApiEnvelope } from './request';
import { BizError } from './request';

type ApiRecord = Record<string, unknown>;

/** 判断 API 请求是否成功 */
export function isApiSuccess(response: unknown): boolean {
  if (response == null || typeof response !== 'object') return false;
  const res = response as ApiRecord;
  if (typeof res.code === 'number') return res.code >= 200 && res.code < 300;
  return true;
}

/**
 * 解析分页列表响应 → ProTable request 所需 { data, items, total, success }。
 * 兼容：
 * - 信封 { code, data: { items, total } }
 * - 信封 { code, data: { items, pagination: { total } } }
 * - 已解包 { items, total } / { items, pagination }
 */
export function parseApiListResponse<T>(response: unknown): {
  data: T[];
  items: T[];
  total: number;
  success: boolean;
} {
  if (response == null || typeof response !== 'object') {
    return { data: [], items: [], total: 0, success: false };
  }
  const res = response as ApiRecord;
  const payload = res.data && typeof res.data === 'object' ? (res.data as ApiRecord) : res;
  const items = (Array.isArray(payload.items) ? payload.items : []) as T[];
  const pagination =
    payload.pagination && typeof payload.pagination === 'object'
      ? (payload.pagination as ApiRecord)
      : undefined;
  const total =
    typeof pagination?.total === 'number'
      ? pagination.total
      : typeof payload.total === 'number'
        ? payload.total
        : 0;
  return { data: items, items, total, success: isApiSuccess(response) };
}

/** 从 API 响应中取出 data 字段（兼容已解包的情况） */
export function getApiData<T>(response: unknown): T | undefined {
  if (response == null || typeof response !== 'object') return undefined;
  const res = response as ApiRecord;
  if (res.data !== undefined) return res.data as T;
  return response as T;
}

/** 从 API 响应或异常中取出 message */
export function getApiErrorMessage(response: unknown, fallback?: string): string {
  if (response == null) return fallback || '请求失败';
  // BizError / axios 异常
  const err = response as {
    info?: { message?: string };
    response?: { data?: ApiRecord | string | null };
    message?: string;
    code?: number;
  };
  const responseData = err.response?.data;
  if (responseData && typeof responseData === 'object') {
    const apiMessage = (responseData as ApiRecord).message;
    if (typeof apiMessage === 'string' && apiMessage.trim()) return apiMessage;
  }
  if (typeof response === 'object') {
    const res = response as ApiRecord;
    if (typeof res.message === 'string' && res.message.trim()) return res.message;
  }
  if (
    typeof err.message === 'string' &&
    err.message.trim() &&
    !/^Request failed with status code/i.test(err.message)
  ) {
    return err.message;
  }
  return fallback || '请求失败';
}

/** 判断是否 BizError */
export function isBizError(e: unknown): e is BizError {
  return e instanceof BizError;
}

export type { ApiEnvelope };
