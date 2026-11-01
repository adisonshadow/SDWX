/**
 * EADAFClient — 访问 EADAF 平台的核心客户端
 *
 * 职责：
 * 1. 应用 token 的获取、缓存、过期前刷新、401 自动重试
 * 2. 业务数据 API 调用 (find/create/update/delete)
 * 3. 采集管道提交 (ingest)
 * 4. 文件存储 (upload/download/preview)
 *
 * 使用 application_id + app_secret 换取 JWT；token 仅在 BFF 内存中缓存，不下发前端。
 *
 * IPS 适配说明：
 * - Find 列表响应 data 形态：{ items, pagination: { total, page, pageSize, totalPages, hasNext } }
 *   （兼容旧 { items, total, page?, size? } 与执行报告 preview）
 * - Create 响应 data 形态：{ item }（解包返回实体本身）
 * - Update 响应 data 形态：{ item, matched }（返回 item）
 * - 实体字段为 camelCase（scheduling / capacity / craft 模板 / analytics / monitor 为 snake_case）
 */
import { config } from '../config/env.js';
import type { EadafEnvelope, FindParams, FindResult, UpdateResult } from '@ips/shared';

const TOKEN_REFRESH_LEAD_MS = 5 * 60 * 1000; // 过期前 5 分钟刷新

interface TokenCache {
  token: string;
  expiresAt: number; // ms timestamp
}

export class EADAFClient {
  private tokenCache: TokenCache | null = null;
  private tokenPromise: Promise<string> | null = null;

  /** 获取有效的应用 token（缓存 + 自动刷新，并发去重） */
  async getToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - TOKEN_REFRESH_LEAD_MS) {
      return this.tokenCache.token;
    }
    if (!this.tokenPromise) {
      this.tokenPromise = this.refreshToken().finally(() => {
        this.tokenPromise = null;
      });
    }
    return this.tokenPromise;
  }

  private async refreshToken(): Promise<string> {
    const { apiBaseUrl, applicationId, appSecret } = config.eadaf;
    const tokenUrl = `${apiBaseUrl}/api/v1/applications/token`;
    const reqBody = { application_id: applicationId, app_secret: appSecret };

    let res: Response;
    let resText: string;
    try {
      res = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      resText = await res.text();
    } catch (e) {
      throw new Error(
        `EADAF token 接口网络错误: ${(e as Error).message}\n  请求: POST ${tokenUrl}`,
      );
    }

    let json: EadafEnvelope<{ token: string; expires_in?: number }> | null = null;
    try {
      json = JSON.parse(resText);
    } catch {
      json = null;
    }

    if (!res.ok || !json?.data?.token) {
      const detail = [
        `EADAF token 获取失败`,
        `  HTTP ${res.status} ${res.statusText}`,
        `  请求: POST ${tokenUrl}`,
        `  响应体: ${resText.slice(0, 500)}`,
      ];
      throw new Error(detail.join('\n'));
    }

    const expiresIn = json.data.expires_in ?? 86400; // 默认 24h
    this.tokenCache = {
      token: json.data.token,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    return this.tokenCache.token;
  }

  /** 带 token + 401 重试的 fetch 封装 */
  private async authedFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const token = await this.getToken();
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string>),
      Authorization: `Bearer ${token}`,
    };
    const res = await fetch(`${config.eadaf.apiBaseUrl}${path}`, { ...init, headers });
    // 401 → 强制刷新 token 后重试一次
    if (res.status === 401 && retry) {
      this.tokenCache = null;
      return this.authedFetch(path, init, false);
    }
    return res;
  }

  // ============ 业务数据 API ============

  /**
   * 查询 (Find) — 对齐 EADAF Skill ≥1.1.2
   *
   * GET /api/v1/data/{routePath}Find?limit=&skip=&filter=...
   *
   * - 分页：limit + skip → data.items + data.pagination
   * - 过滤（三者等价）：filter={"k":"v"} | ?k=v | ?filter[k]=v
   *   本客户端统一下发 filter JSON 字符串；status 仍可用顶层便捷参数（优先级更高）
   * - limit 上限 100
   */
  async find<T>(routePath: string, params: FindParams = {}): Promise<FindResult<T>> {
    const query = new URLSearchParams();
    if (params.limit != null) query.set('limit', String(Math.min(params.limit, 100)));
    if (params.skip != null) query.set('skip', String(params.skip));
    if (params.filter) {
      const cleaned: Record<string, unknown> = {};
      for (const [field, val] of Object.entries(params.filter)) {
        if (val == null || val === '') continue;
        // 顶层 status 优先于 filter.status
        if (field === 'status' && params.status != null) continue;
        cleaned[field] = val;
      }
      if (Object.keys(cleaned).length > 0) {
        query.set('filter', JSON.stringify(cleaned));
      }
    }
    if (params.status) query.set('status', params.status);
    const qs = query.toString();
    const res = await this.authedFetch(`/api/v1/data/${routePath}Find${qs ? `?${qs}` : ''}`);
    const json = (await res.json()) as EadafEnvelope<FindResult<T> | T[]>;
    if (!res.ok) throw new EadafError(json.message ?? '查询失败', res.status, json.code);
    return normalizeFindResult<T>(json.data);
  }

  /**
   * 查询并按 filter 过滤（服务端字段级过滤，Skill ≥1.1.2）。
   */
  async findFiltered<T>(
    routePath: string,
    filter: Record<string, unknown>,
    params: Omit<FindParams, 'filter'> = {},
  ): Promise<FindResult<T>> {
    return this.find<T>(routePath, { ...params, filter, limit: params.limit ?? 100 });
  }

  /**
   * 创建 (Create) — body 包在 { body: {...} } 里。
   * 响应 data 为 { item: {...} }，解包返回实体本身。
   *
   * @param withTimestamps IPS 业务实体表均无 created_at/updated_at 列，**默认 false**。
   *   仅当目标实体确有这两列时再传 true（否则 EADAF 报「未建模字段」）。
   */
  async create<T>(
    routePath: string,
    body: Record<string, unknown>,
    withTimestamps = false,
  ): Promise<T> {
    const now = new Date().toISOString();
    const payload = withTimestamps
      ? { ...body, created_at: body.created_at ?? now, updated_at: body.updated_at ?? now }
      : body;
    const res = await this.authedFetch(`/api/v1/data/${routePath}Create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: payload }),
    });
    const json = (await res.json()) as EadafEnvelope<{ item: T } | T>;
    if (!res.ok) throw new EadafError(json.message ?? '创建失败', res.status, json.code);
    const data = json.data as ({ item?: T } & T) | undefined;
    // 兼容 { item: T } 与裸 T 两种返回形态
    return data && typeof data === 'object' && 'item' in data ? (data.item as T) : (data as T);
  }

  /**
   * 更新 (Update) — PATCH /{routePath}Update/{id}（EADAF Skill ≥1.1.1）
   * body: { id, body: {...} }。响应 data 为 { item, matched? }，返回 item。
   */
  async update<T = unknown>(
    routePath: string,
    id: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const res = await this.authedFetch(`/api/v1/data/${routePath}Update/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, body }),
    });
    const text = await res.text();
    let json: EadafEnvelope<UpdateResult<T> | { item: T } | T> | null = null;
    try {
      json = text ? (JSON.parse(text) as EadafEnvelope<UpdateResult<T> | { item: T } | T>) : null;
    } catch {
      throw new EadafError(text?.trim() || '更新失败', res.status);
    }
    if (!res.ok || !json) {
      throw new EadafError(json?.message ?? '更新失败', res.status, json?.code);
    }
    const data = json.data as ({ item?: T | null } & T) | undefined;
    if (data && typeof data === 'object' && 'item' in data) return (data.item as T) ?? (data as T);
    return data as T;
  }

  /** 删除 (Delete) — DELETE /{routePath}Delete/{id}（EADAF Skill ≥1.1.1） */
  async deleteOne(routePath: string, id: string): Promise<void> {
    const res = await this.authedFetch(`/api/v1/data/${routePath}Delete/${id}`, {
      method: 'DELETE',
    });
    const text = await res.text();
    let json: EadafEnvelope<unknown> | null = null;
    try {
      json = text ? (JSON.parse(text) as EadafEnvelope<unknown>) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      throw new EadafError(
        json?.message ?? (text?.trim() || '删除失败'),
        res.status,
        json?.code,
      );
    }
  }

  // ============ 采集管道 ============

  /** 提交采集原始数据 (ingest) — 原始字节 ≤ 1MB */
  async ingest(
    routePath: string,
    rawBytes: Uint8Array,
    contentType = 'application/octet-stream',
  ): Promise<void> {
    const res = await this.authedFetch(`/api/v1/ingest/${routePath}`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: rawBytes,
    });
    if (!res.ok) {
      const json = (await res.json()) as EadafEnvelope<unknown>;
      throw new EadafError(json.message ?? '采集提交失败', res.status, json.code);
    }
  }

  // ============ 文件存储 ============

  /** 上传文件到 EADAF：POST /api/v1/storage/objects/upload，multipart，必填 bucketCode */
  async uploadObject(
    file: Buffer,
    filename: string,
    options?: { bucketCode?: string; mimeType?: string },
  ): Promise<string> {
    const bucketCode = options?.bucketCode || config.eadaf.storageBucket;
    const token = await this.getToken();
    const form = new FormData();
    form.append('bucketCode', bucketCode);
    form.append('file', new Blob([file], { type: options?.mimeType || 'application/octet-stream' }), filename);
    const res = await fetch(`${config.eadaf.apiBaseUrl}/api/v1/storage/objects/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const json = (await res.json()) as EadafEnvelope<{ object_id?: string; id?: string; objectId?: string }>;
    if (!res.ok) throw new EadafError(json.message ?? '上传失败', res.status, json.code);
    const data = json.data ?? {};
    return data.object_id ?? data.objectId ?? data.id ?? '';
  }

  /** 下载文件 — 返回 Response 流（通过 Response.body） */
  async downloadObject(objectId: string): Promise<Response> {
    return this.authedFetch(`/api/v1/storage/objects/${objectId}/download`);
  }

  /** 预览文件 */
  async previewObject(objectId: string): Promise<Response> {
    return this.authedFetch(`/api/v1/storage/objects/${objectId}/preview`);
  }
}

/** EADAF 调用错误 */
export class EadafError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly code?: number,
  ) {
    super(message);
    this.name = 'EadafError';
  }
}

/** 统一 Find 结果为 {items, total, ...} — 兼容多种 EADAF 响应格式 */
function normalizeFindResult<T>(data: unknown): FindResult<T> {
  // 格式1: 直接数组
  if (Array.isArray(data)) {
    return { items: data, total: data.length };
  }
  const obj = data as Record<string, unknown>;

  // 格式2: { items, pagination }（新文档）或旧 { items, total, page?, size? }
  if (Array.isArray(obj.items)) {
    const items = obj.items as T[];
    const pagination = obj.pagination as
      | {
          total?: number;
          page?: number;
          pageSize?: number;
          totalPages?: number;
          hasNext?: boolean;
        }
      | undefined;
    const total =
      (typeof pagination?.total === 'number' ? pagination.total : undefined) ??
      (typeof obj.total === 'number' ? obj.total : undefined) ??
      items.length;
    const page = pagination?.page ?? (obj.page as number | undefined);
    const pageSize =
      pagination?.pageSize ??
      (obj.size as number | undefined) ??
      (obj.pageSize as number | undefined);
    return {
      items,
      total,
      page,
      size: pageSize,
      pageSize,
      totalPages: pagination?.totalPages,
      hasNext: pagination?.hasNext,
      pagination:
        pagination && typeof pagination.total === 'number'
          ? {
              total: pagination.total,
              page: pagination.page ?? 1,
              pageSize: pagination.pageSize ?? items.length,
              totalPages: pagination.totalPages ?? 1,
              hasNext: Boolean(pagination.hasNext),
            }
          : undefined,
    };
  }

  // 格式3: 旧执行报告 { preview: { items, count? } }
  const preview = obj.preview as Record<string, unknown> | undefined;
  if (preview && Array.isArray(preview.items)) {
    const items = preview.items as T[];
    return {
      items,
      total:
        (preview.total as number | undefined) ??
        (preview.count as number | undefined) ??
        items.length,
    };
  }
  return { items: [], total: 0 };
}

/** 单例 */
export const eadafClient = new EADAFClient();
