import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  TABLE_PAGE_KEY,
  TABLE_PAGE_SIZE_KEY,
  TABLE_SCOPE_KEY,
  applyTableStateToSearchParams,
  searchParamsToTableState,
  type TablePaginationState,
  type TableUrlHelperOptions,
} from '@/utils/tableUrlHelper';

/** admin 列表 page 为 1-based，与后端 offset=(page-1)*size 一致 */
export const URL_PAGE_KEY = TABLE_PAGE_KEY;
export const URL_PAGE_SIZE_KEY = TABLE_PAGE_SIZE_KEY;
export const URL_SCOPE_KEY = TABLE_SCOPE_KEY;

export function parseUrlPage(value: string | null, fallback = 1): number {
  const n = parseInt(value || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

type SearchParamPatch = Record<string, string | null | undefined>;

export function usePatchSearchParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const patchSearchParams = useCallback(
    (patch: SearchParamPatch, options?: { replace?: boolean }) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(patch).forEach(([key, value]) => {
            if (value == null || value === '') next.delete(key);
            else next.set(key, value);
          });
          return next;
        },
        { replace: options?.replace ?? true },
      );
    },
    [setSearchParams],
  );

  return { searchParams, patchSearchParams };
}

export function useUrlPagination(defaultPageSize = 10) {
  const { searchParams, patchSearchParams } = usePatchSearchParams();

  const page = parseUrlPage(searchParams.get(URL_PAGE_KEY), 1);
  const pageSize = parseUrlPage(searchParams.get(URL_PAGE_SIZE_KEY), defaultPageSize);

  const setPagination = useCallback(
    (nextPage: number, nextPageSize = pageSize) => {
      patchSearchParams({
        [URL_PAGE_KEY]: nextPage <= 1 ? null : String(nextPage),
        [URL_PAGE_SIZE_KEY]: nextPageSize === defaultPageSize ? null : String(nextPageSize),
      });
    },
    [defaultPageSize, pageSize, patchSearchParams],
  );

  const resetPage = useCallback(() => {
    patchSearchParams({ [URL_PAGE_KEY]: null, [URL_PAGE_SIZE_KEY]: null });
  }, [patchSearchParams]);

  return { page, pageSize, setPagination, resetPage, searchParams };
}

export function useScopeFromUrl() {
  const { searchParams, patchSearchParams } = usePatchSearchParams();
  const scope = searchParams.get(URL_SCOPE_KEY) || undefined;

  const setScope = useCallback(
    (next?: string) => {
      patchSearchParams({
        [URL_SCOPE_KEY]: next ?? null,
        [URL_PAGE_KEY]: null,
        [URL_PAGE_SIZE_KEY]: null,
      });
    },
    [patchSearchParams],
  );

  return [scope, setScope] as const;
}

export type UseTableUrlStateOptions = TableUrlHelperOptions & {
  defaultPageSize?: number;
};

/**
 * 任意页面可用的表格 URL 状态：分页 + 筛选读写，保留 scope 等 reserved 键。
 * 筛选与分页均以 URL 为唯一数据源。
 */
export function useTableUrlState(options: UseTableUrlStateOptions = {}) {
  const defaultPageSize = options.defaultPageSize ?? 10;
  const pageKey = options.pageKey;
  const pageSizeKey = options.pageSizeKey;
  const filterKeysJoined = options.filterKeys?.join(',') ?? '';
  const reservedKeysJoined = options.reservedKeys?.join(',') ?? '';
  const arrayKeysJoined = options.arrayKeys?.join(',') ?? '';

  const helperOptions: TableUrlHelperOptions = useMemo(
    () => ({
      pageKey,
      pageSizeKey,
      filterKeys: filterKeysJoined ? filterKeysJoined.split(',') : undefined,
      reservedKeys: reservedKeysJoined ? reservedKeysJoined.split(',') : undefined,
      arrayKeys: arrayKeysJoined ? arrayKeysJoined.split(',') : undefined,
      defaultPageSize,
    }),
    [arrayKeysJoined, defaultPageSize, filterKeysJoined, pageKey, pageSizeKey, reservedKeysJoined],
  );

  const [searchParams, setSearchParams] = useSearchParams();

  const { pagination, formValues } = useMemo(
    () => searchParamsToTableState(searchParams, helperOptions),
    [helperOptions, searchParams],
  );

  const syncUrl = useCallback(
    (vals: Record<string, unknown>, nextPagination: TablePaginationState) => {
      setSearchParams(
        (prev) => applyTableStateToSearchParams(prev, vals, nextPagination, helperOptions),
        { replace: true },
      );
    },
    [helperOptions, setSearchParams],
  );

  const syncPagination = useCallback(
    (nextPage: number, nextPageSize = pagination.pageSize) => {
      syncUrl(formValues, { current: nextPage, pageSize: nextPageSize });
    },
    [formValues, pagination.pageSize, syncUrl],
  );

  const syncFilters = useCallback(
    (vals: Record<string, unknown>, resetPage = true) => {
      syncUrl(vals, {
        current: resetPage ? 1 : pagination.current,
        pageSize: pagination.pageSize,
      });
    },
    [pagination.current, pagination.pageSize, syncUrl],
  );

  const resetFilters = useCallback(() => {
    syncUrl({}, { current: 1, pageSize: pagination.pageSize });
  }, [pagination.pageSize, syncUrl]);

  return {
    searchParams,
    pagination,
    formValues,
    syncUrl,
    syncPagination,
    syncFilters,
    resetFilters,
  };
}
