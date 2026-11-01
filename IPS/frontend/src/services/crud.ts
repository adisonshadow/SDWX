/**
 * 通用 CRUD 代理封装 → 后端 /api/ips/crud/:module/:entity
 * 对应 backend crud.routes.ts，覆盖全部 38 实体。
 */
import { request } from '@/utils/request';
import type { ApiEnvelope } from '@/utils/request';

export interface ListParams {
  page?: number;
  pageSize?: number;
  /** 顶层字段过滤（非空值才下发） */
  [key: string]: unknown;
}

export interface ListData<T> {
  items: T[];
  total: number;
  page?: number;
  size?: number;
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
  };
}

/** GET 列表（分页 + 字段过滤） */
export function crudList<T>(
  module: string,
  entity: string,
  params: ListParams = {},
): Promise<ApiEnvelope<ListData<T>>> {
  const query = new URLSearchParams();
  const { page, pageSize, ...filter } = params;
  // BFF：page 1-based；pageSize → limit（EADAF 原生为 limit+skip，见 Skill §3.2.1）
  if (page != null && Number(page) > 0) query.set('page', String(page));
  if (pageSize != null && Number(pageSize) > 0) query.set('pageSize', String(pageSize));
  for (const [k, v] of Object.entries(filter)) {
    if (v === undefined || v === null || v === '') continue;
    query.set(k, String(v));
  }
  const qs = query.toString();
  return request<ListData<T>>(`/api/ips/crud/${module}/${entity}${qs ? `?${qs}` : ''}`);
}

/** POST 创建 */
export function crudCreate<T>(
  module: string,
  entity: string,
  body: Record<string, unknown>,
): Promise<ApiEnvelope<T>> {
  return request<T>(`/api/ips/crud/${module}/${entity}`, {
    method: 'POST',
    data: body,
  });
}

/** PATCH 更新 */
export function crudUpdate<T>(
  module: string,
  entity: string,
  id: string,
  body: Record<string, unknown>,
): Promise<ApiEnvelope<T>> {
  return request<T>(`/api/ips/crud/${module}/${entity}/${id}`, {
    method: 'PATCH',
    data: body,
  });
}

/** DELETE 删除 */
export function crudDelete(
  module: string,
  entity: string,
  id: string,
): Promise<ApiEnvelope<{ id: string; deleted: boolean }>> {
  return request(`/api/ips/crud/${module}/${entity}/${id}`, { method: 'DELETE' });
}
