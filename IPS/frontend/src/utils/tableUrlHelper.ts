/**
 * 表格筛选 + 分页 ↔ URL search 互转。
 * 约定：admin 列表 page 为 1-based（与后端 offset=(page-1)*size 一致）。
 */

export const TABLE_PAGE_KEY = 'page';
export const TABLE_PAGE_SIZE_KEY = 'pageSize';
export const TABLE_SCOPE_KEY = 'scope';

/** 默认不作为筛选字段写入/读出的 URL 键 */
export const DEFAULT_RESERVED_URL_KEYS = [
  TABLE_PAGE_KEY,
  TABLE_PAGE_SIZE_KEY,
  TABLE_SCOPE_KEY,
] as const;

export type TablePaginationState = {
  current: number;
  pageSize: number;
};

export type TableUrlHelperOptions = {
  pageKey?: string;
  pageSizeKey?: string;
  /** 不参与筛选序列化的键（默认含 page/pageSize/scope） */
  reservedKeys?: string[];
  /** 若指定，则只同步这些筛选字段；不传则同步除 reserved 外的全部参数 */
  filterKeys?: string[];
  /** 需要按逗号拆回数组的筛选字段（如日期区间） */
  arrayKeys?: string[];
  defaultPageSize?: number;
};

function isEmptyFilterValue(val: unknown): boolean {
  if (val === undefined || val === null || val === '') return true;
  if (Array.isArray(val) && val.length === 0) return true;
  return false;
}

function serializeFilterValue(val: unknown): string {
  if (Array.isArray(val)) return val.map(String).join(',');
  if (typeof val === 'object' && val !== null) return JSON.stringify(val);
  return String(val);
}

/**
 * 将筛选条件 + 分页转为可写入 URL 的键值（不含 reserved 之外的无关键）。
 * 返回的对象值均为 string；空值不会出现。
 * page=1 / pageSize=default 时省略对应键。
 */
export function tableStateToSearchParams(
  formValues: Record<string, unknown>,
  pagination: TablePaginationState,
  options: TableUrlHelperOptions = {},
): Record<string, string> {
  const pageKey = options.pageKey ?? TABLE_PAGE_KEY;
  const pageSizeKey = options.pageSizeKey ?? TABLE_PAGE_SIZE_KEY;
  const reserved = new Set(options.reservedKeys ?? DEFAULT_RESERVED_URL_KEYS);
  const defaultPageSize = options.defaultPageSize ?? 10;
  const filterKeySet = options.filterKeys ? new Set(options.filterKeys) : null;

  const params: Record<string, string> = {};

  const current = pagination.current || 1;
  const pageSize = pagination.pageSize || defaultPageSize;
  if (current > 1) params[pageKey] = String(current);
  if (pageSize !== defaultPageSize) params[pageSizeKey] = String(pageSize);

  Object.entries(formValues || {}).forEach(([key, val]) => {
    if (reserved.has(key)) return;
    if (filterKeySet && !filterKeySet.has(key)) return;
    if (isEmptyFilterValue(val)) return;
    params[key] = serializeFilterValue(val);
  });

  return params;
}

/**
 * 从 URLSearchParams 解析分页 + 筛选初始值。
 * 不会改动 reserved 键（如 scope）——调用方应自行保留。
 */
export function searchParamsToTableState(
  searchParams: URLSearchParams,
  options: TableUrlHelperOptions = {},
): {
  pagination: TablePaginationState;
  formValues: Record<string, unknown>;
} {
  const pageKey = options.pageKey ?? TABLE_PAGE_KEY;
  const pageSizeKey = options.pageSizeKey ?? TABLE_PAGE_SIZE_KEY;
  const reserved = new Set(options.reservedKeys ?? DEFAULT_RESERVED_URL_KEYS);
  const defaultPageSize = options.defaultPageSize ?? 10;
  const filterKeySet = options.filterKeys ? new Set(options.filterKeys) : null;
  const arrayKeys = new Set(options.arrayKeys ?? []);

  const pageRaw = parseInt(searchParams.get(pageKey) || '', 10);
  const sizeRaw = parseInt(searchParams.get(pageSizeKey) || '', 10);
  const current = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize = Number.isFinite(sizeRaw) && sizeRaw > 0 ? sizeRaw : defaultPageSize;

  const formValues: Record<string, unknown> = {};
  searchParams.forEach((value, key) => {
    if (reserved.has(key)) return;
    if (filterKeySet && !filterKeySet.has(key)) return;
    if (value === '') return;
    if (arrayKeys.has(key)) {
      formValues[key] = value.split(',');
    } else {
      formValues[key] = value;
    }
  });

  return {
    pagination: { current, pageSize },
    formValues,
  };
}

/**
 * 在保留 reserved 键（如 scope）的前提下，用表格状态覆盖分页与筛选参数。
 */
export function applyTableStateToSearchParams(
  prev: URLSearchParams,
  formValues: Record<string, unknown>,
  pagination: TablePaginationState,
  options: TableUrlHelperOptions = {},
): URLSearchParams {
  const pageKey = options.pageKey ?? TABLE_PAGE_KEY;
  const pageSizeKey = options.pageSizeKey ?? TABLE_PAGE_SIZE_KEY;
  const reserved = new Set(options.reservedKeys ?? DEFAULT_RESERVED_URL_KEYS);
  const filterKeySet = options.filterKeys ? new Set(options.filterKeys) : null;

  const next = new URLSearchParams(prev);

  // 清除旧的分页与（将被重写的）筛选键
  next.delete(pageKey);
  next.delete(pageSizeKey);
  const keysToClear: string[] = [];
  next.forEach((_v, key) => {
    if (reserved.has(key)) return;
    if (filterKeySet && !filterKeySet.has(key)) return;
    // 未指定 filterKeys 时：清除所有非 reserved 键再重写
    if (!filterKeySet || filterKeySet.has(key)) keysToClear.push(key);
  });
  keysToClear.forEach((k) => next.delete(k));

  const written = tableStateToSearchParams(formValues, pagination, options);
  Object.entries(written).forEach(([k, v]) => next.set(k, v));

  return next;
}
