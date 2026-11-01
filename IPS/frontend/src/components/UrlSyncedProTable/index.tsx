import { ProTable } from '@ant-design/pro-components';
import type { ActionType, ParamsType, ProFormInstance, ProTableProps } from '@ant-design/pro-components';
import type { TablePaginationPlacement } from 'antd/es/table/interface';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { URL_PAGE_KEY, URL_PAGE_SIZE_KEY } from '@/hooks/useUrlQueryState';
import {
  DEFAULT_RESERVED_URL_KEYS,
  applyTableStateToSearchParams,
  searchParamsToTableState,
} from '@/utils/tableUrlHelper';

export type UrlSyncedProTableProps<
  T extends Record<string, any>,
  U extends ParamsType = ParamsType,
  ValueType = 'text',
> = ProTableProps<T, U, ValueType> & {
  defaultPageSize?: number;
  urlPageKey?: string;
  urlPageSizeKey?: string;
  /** 为 false 时不读写 URL（如 Drawer / Modal 内表格） */
  syncUrl?: boolean;
  /**
   * 同步到 URL 的筛选字段；不传则同步搜索表单中除 reserved（page/pageSize/scope）外的全部字段。
   * 传空数组则只同步分页。
   */
  urlFilterKeys?: string[];
  /** 需要从 URL 按逗号还原为数组的字段 */
  urlArrayKeys?: string[];
};

const DEFAULT_PAGINATION_PLACEMENT: TablePaginationPlacement[] = ['bottomStart'];

function assignRef<T>(
  target: React.MutableRefObject<T | undefined> | ((instance: T | undefined) => void) | undefined,
  instance: T | undefined,
) {
  if (!target) return;
  if (typeof target === 'function') target(instance);
  else target.current = instance;
}

export function UrlSyncedProTable<
  T extends Record<string, any>,
  U extends ParamsType = ParamsType,
  ValueType = 'text',
>(props: UrlSyncedProTableProps<T, U, ValueType>) {
  const {
    defaultPageSize = 10,
    urlPageKey = URL_PAGE_KEY,
    urlPageSizeKey = URL_PAGE_SIZE_KEY,
    syncUrl = true,
    urlFilterKeys,
    urlArrayKeys,
    pagination,
    request,
    actionRef,
    params,
    form,
    formRef: formRefProp,
    onSubmit,
    onReset,
    onChange,
    ...rest
  } = props;

  const [searchParams, setSearchParams] = useSearchParams();
  const internalActionRef = useRef<ActionType | undefined>(undefined);
  const internalFormRef = useRef<ProFormInstance | undefined>(undefined);
  /** URL 驱动翻页/reload 期间，忽略 ProTable 误发的 onChange(1) 回写 */
  const urlPaginationGuardRef = useRef<number | null>(null);
  const skipInitialReloadRef = useRef(true);
  const prevUrlPageRef = useRef<{ page: number; pageSize: number } | null>(null);
  /** 同步页码：用户点击时立即更新，供 request 读取（不依赖尚未完成的 URL 写入） */
  const pageRef = useRef(1);
  const pageSizeRef = useRef(defaultPageSize);

  const resolvedDefaultPageSize =
    typeof pagination === 'object' && pagination?.pageSize
      ? Number(pagination.pageSize)
      : defaultPageSize;

  const helperOptions = useMemo(
    () => ({
      pageKey: urlPageKey,
      pageSizeKey: urlPageSizeKey,
      filterKeys: urlFilterKeys,
      arrayKeys: urlArrayKeys,
      reservedKeys: [...DEFAULT_RESERVED_URL_KEYS],
      defaultPageSize: resolvedDefaultPageSize,
    }),
    [resolvedDefaultPageSize, urlArrayKeys, urlFilterKeys, urlPageKey, urlPageSizeKey],
  );

  const { pagination: urlPagination, formValues: urlFormValues } = useMemo(() => {
    if (!syncUrl) {
      return {
        pagination: { current: 1, pageSize: resolvedDefaultPageSize },
        formValues: {} as Record<string, unknown>,
      };
    }
    return searchParamsToTableState(searchParams, helperOptions);
  }, [helperOptions, resolvedDefaultPageSize, searchParams, syncUrl]);

  const page = urlPagination.current;
  const pageSize = urlPagination.pageSize;
  pageRef.current = page;
  pageSizeRef.current = pageSize;

  const syncTableToUrl = useCallback(
    (vals: Record<string, unknown>, nextPage: number, nextPageSize: number) => {
      if (!syncUrl) return;
      setSearchParams(
        (prev) => {
          const next = applyTableStateToSearchParams(
            prev,
            vals,
            { current: nextPage, pageSize: nextPageSize },
            helperOptions,
          );
          if (next.toString() === prev.toString()) return prev;
          return next;
        },
        { replace: true },
      );
    },
    [helperOptions, setSearchParams, syncUrl],
  );

  const readFormValues = useCallback((): Record<string, unknown> => {
    const fromForm = internalFormRef.current?.getFieldsValue?.() as Record<string, unknown> | undefined;
    if (fromForm && Object.keys(fromForm).length) return fromForm;
    return urlFormValues;
  }, [urlFormValues]);

  const handlePaginationChange = useCallback(
    (nextPage: number, nextPageSize: number) => {
      const guard = urlPaginationGuardRef.current;
      if (guard != null && nextPage !== guard) {
        return;
      }
      if (nextPage === page && nextPageSize === pageSize) {
        return;
      }
      pageRef.current = nextPage;
      pageSizeRef.current = nextPageSize;
      urlPaginationGuardRef.current = nextPage;
      syncTableToUrl(readFormValues(), nextPage, nextPageSize);
      window.setTimeout(() => {
        if (urlPaginationGuardRef.current === nextPage) {
          urlPaginationGuardRef.current = null;
        }
      }, 400);
    },
    [page, pageSize, readFormValues, syncTableToUrl],
  );

  // URL 回填搜索表单（刷新 / 前进后退）
  useEffect(() => {
    if (!syncUrl) return;
    const formInst = internalFormRef.current;
    if (!formInst?.setFieldsValue) return;
    formInst.setFieldsValue(urlFormValues);
  }, [syncUrl, urlFormValues]);

  // URL 页码变化（含前进/后退）时 reload；切勿把 page 放进 params（会触发 ProTable 重置到第 1 页）
  useEffect(() => {
    if (!syncUrl || !request) return;

    if (skipInitialReloadRef.current) {
      skipInitialReloadRef.current = false;
      prevUrlPageRef.current = { page, pageSize };
      return;
    }

    const prev = prevUrlPageRef.current;
    if (prev && prev.page === page && prev.pageSize === pageSize) return;
    prevUrlPageRef.current = { page, pageSize };

    urlPaginationGuardRef.current = page;
    internalActionRef.current?.reload?.();
    const timer = window.setTimeout(() => {
      if (urlPaginationGuardRef.current === page) {
        urlPaginationGuardRef.current = null;
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [page, pageSize, request, syncUrl]);

  const mergedPagination = useMemo(() => {
    if (pagination === false) return false;
    const base = typeof pagination === 'object' ? pagination : {};
    if (!syncUrl) {
      return {
        defaultPageSize: resolvedDefaultPageSize,
        showSizeChanger: true,
        placement: DEFAULT_PAGINATION_PLACEMENT,
        ...base,
      };
    }
    return {
      showSizeChanger: true,
      placement: DEFAULT_PAGINATION_PLACEMENT,
      ...base,
      current: page,
      pageSize,
      onChange: (nextPage: number, nextPageSize: number) => {
        handlePaginationChange(nextPage, nextPageSize);
        base.onChange?.(nextPage, nextPageSize);
      },
    };
  }, [handlePaginationChange, page, pageSize, pagination, resolvedDefaultPageSize, syncUrl]);

  // params 只放筛选，绝不放页码（ProTable：params 变化 → 重置到第 1 页）
  const mergedParams = useMemo(() => {
    if (!syncUrl) return params;
    return {
      ...urlFormValues,
      ...params,
    } as unknown as U;
  }, [params, syncUrl, urlFormValues]);

  const wrappedRequest = useMemo(() => {
    if (!request) return undefined;
    if (!syncUrl) return request;
    return async (requestParams: U, sort: Record<string, any>, filter: Record<string, any>) => {
      const raw = requestParams as Record<string, unknown>;
      const cleaned: Record<string, unknown> = {};
      Object.entries(raw).forEach(([key, value]) => {
        if (key.startsWith('_')) return;
        cleaned[key] = value;
      });
      return request(
        {
          ...cleaned,
          ...urlFormValues,
          current: pageRef.current,
          pageSize: pageSizeRef.current,
        } as unknown as U,
        sort,
        filter,
      );
    };
  }, [request, syncUrl, urlFormValues]);

  const handleSubmit = useCallback(
    (values: U) => {
      if (syncUrl) {
        pageRef.current = 1;
        urlPaginationGuardRef.current = 1;
        syncTableToUrl(values as Record<string, unknown>, 1, pageSize);
        window.setTimeout(() => {
          if (urlPaginationGuardRef.current === 1) urlPaginationGuardRef.current = null;
        }, 400);
      }
      onSubmit?.(values);
    },
    [onSubmit, pageSize, syncTableToUrl, syncUrl],
  );

  const handleReset = useCallback(() => {
    if (syncUrl) {
      pageRef.current = 1;
      urlPaginationGuardRef.current = 1;
      syncTableToUrl({}, 1, pageSize);
      window.setTimeout(() => {
        if (urlPaginationGuardRef.current === 1) urlPaginationGuardRef.current = null;
      }, 400);
    }
    onReset?.();
  }, [onReset, pageSize, syncTableToUrl, syncUrl]);

  const handleTableChange = useCallback(
    (pag: any, filters: any, sorter: any, extra: any) => {
      onChange?.(pag, filters, sorter, extra);
    },
    [onChange],
  );

  const mergedForm = useMemo(() => {
    if (!syncUrl) return form;
    return {
      ...form,
      initialValues: {
        ...urlFormValues,
        ...(typeof form === 'object' ? form?.initialValues : undefined),
      },
    };
  }, [form, syncUrl, urlFormValues]);

  const setFormRef = useCallback(
    (instance: ProFormInstance | undefined) => {
      internalFormRef.current = instance;
      assignRef(formRefProp as any, instance);
    },
    [formRefProp],
  );

  const setActionRef = useCallback(
    (instance: ActionType | undefined) => {
      internalActionRef.current = instance;
      assignRef(actionRef as any, instance);
    },
    [actionRef],
  );

  return (
    <ProTable<T, U, ValueType>
      {...rest}
      actionRef={setActionRef as any}
      formRef={setFormRef as any}
      form={mergedForm}
      request={wrappedRequest}
      pagination={mergedPagination}
      params={mergedParams}
      onSubmit={handleSubmit}
      onReset={handleReset}
      onChange={handleTableChange}
    />
  );
}

export default UrlSyncedProTable;
