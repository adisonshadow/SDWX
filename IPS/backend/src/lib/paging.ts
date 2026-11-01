/**
 * 列表分页 — 对齐 EADAF Skill §3.2.1
 *
 * 请求：limit + skip（page 由网关换算；BFF 对外可收 page/pageSize）
 * 响应：{ items, pagination: { total, page, pageSize, totalPages, hasNext } }
 */
import type { FindResult } from '@ips/shared';

export interface PageParams {
  limit: number;
  skip: number;
  page: number;
}

/** 从 BFF query 解析：page(1-based)/pageSize 或 limit/skip → EADAF limit+skip */
export function parsePageParams(
  query: Record<string, unknown>,
  defaultLimit = 20,
): PageParams {
  const rawLimit = query.limit ?? query.pageSize;
  const limit = rawLimit
    ? Math.min(Math.max(parseInt(String(rawLimit), 10) || defaultLimit, 1), 100)
    : defaultLimit;

  let skip = 0;
  let page = 1;
  if (query.page != null && query.page !== '') {
    page = Math.max(parseInt(String(query.page), 10) || 1, 1);
    skip = (page - 1) * limit;
  } else if (query.skip != null && query.skip !== '') {
    skip = Math.max(parseInt(String(query.skip), 10) || 0, 0);
    page = Math.floor(skip / limit) + 1;
  }

  return { limit, skip, page };
}

/** 将 EADAF FindResult 规范为 Skill §3.2.1 列表载荷（并保留 total 兼容旧前端） */
export function toListPayload<T>(
  result: FindResult<T>,
  fallback: { limit: number; skip: number; page: number },
) {
  const pageSize = result.pageSize ?? result.size ?? fallback.limit;
  const page = result.page ?? fallback.page;
  const total = result.total;
  const totalPages =
    result.totalPages ?? (pageSize > 0 ? Math.max(Math.ceil(total / pageSize), total > 0 ? 1 : 0) : 0);
  const pagination = result.pagination ?? {
    total,
    page,
    pageSize,
    totalPages,
    hasNext: result.hasNext ?? page * pageSize < total,
  };

  return {
    items: result.items,
    pagination,
    /** @deprecated 兼容旧解析；优先用 pagination.total */
    total: pagination.total,
    page: pagination.page,
    size: pagination.pageSize,
  };
}
