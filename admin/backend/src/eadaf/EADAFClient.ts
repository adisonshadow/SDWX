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
 */
import { config } from '../config/env.js';
import type { EadafEnvelope } from '@fmms/shared';

const TOKEN_REFRESH_LEAD_MS = 5 * 60 * 1000; // 过期前 5 分钟刷新

export interface FindParams {
  limit?: number;
  skip?: number;
  filter?: Record<string, unknown>;
  status?: string;
}

export interface FindResult<T> {
  items: T[];
  total: number;
}

interface TokenCache {
  token: string;
  expiresAt: number; // ms timestamp
}

export class EADAFClient {
  private tokenCache: TokenCache | null = null;
  private tokenPromise: Promise<string> | null = null;

  /** 获取有效的应用 token（缓存 + 自动刷新） */
  async getToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - TOKEN_REFRESH_LEAD_MS) {
      return this.tokenCache.token;
    }
    // 并发去重：多个请求同时触发刷新只换一次
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

    // 文档说明：/token 为公开接口，无需已有 Token，直接用 application_id + app_secret 换取
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

    // 解析响应体
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
   * 查询 (Find)
   *
   * EADAF Find 是 GET，filter 参数在 schema 中定义为 object 类型，
   * 通过 URL query string 传 JSON 字符串会被校验拒绝（expected record, received string）。
   * 因此：Find 只传 limit/skip 分页，不传 filter；复杂过滤在调用方（repos）做客户端过滤。
   */
  async find<T>(routePath: string, params: FindParams = {}): Promise<FindResult<T>> {
    const query = new URLSearchParams();
    if (params.limit != null) query.set('limit', String(params.limit));
    if (params.skip != null) query.set('skip', String(params.skip));
    const qs = query.toString();
    const res = await this.authedFetch(`/api/v1/data/${routePath}Find${qs ? `?${qs}` : ''}`);
    const json = (await res.json()) as EadafEnvelope<FindResult<T> | T[]>;
    if (!res.ok) throw new EadafError(json.message ?? '查询失败', res.status, json.code);
    return normalizeFindResult(json.data);
  }

  /**
   * 查询并在客户端按 filter 过滤
   * （EADAF Find 不支持 URL 传 filter object，拉取后本地过滤）
   */
  async findFiltered<T>(
    routePath: string,
    filter: Record<string, unknown>,
    params: Omit<FindParams, 'filter'> = {},
  ): Promise<FindResult<T>> {
    const result = await this.find<T>(routePath, { ...params, limit: 100 });
    const items = result.items.filter((item) =>
      Object.entries(filter).every(([key, val]) => {
        const itemVal = (item as Record<string, unknown>)[key];
        // 模糊匹配：string includes，其他严格相等
        if (typeof val === 'string' && typeof itemVal === 'string') {
          return itemVal === val || itemVal.includes(val);
        }
        return itemVal === val;
      }),
    );
    return { items, total: items.length };
  }

  /** 创建 (Create) — body 包在 { body: {...} } 里；id 需调用方提供（EADAF 不自动生成） */
  async create<T>(routePath: string, body: Record<string, unknown>): Promise<T> {
    const res = await this.authedFetch(`/api/v1/data/${routePath}Create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    const json = (await res.json()) as EadafEnvelope<T>;
    if (!res.ok) throw new EadafError(json.message ?? '创建失败', res.status, json.code);
    return json.data;
  }

  /** 更新 (Update) — PATCH /{routePath}Update/:id，body: { id, body: {...} } */
  async update(
    routePath: string,
    id: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const res = await this.authedFetch(`/api/v1/data/${routePath}Update/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, body }),
    });
    if (!res.ok) {
      const json = (await res.json()) as EadafEnvelope<unknown>;
      throw new EadafError(json.message ?? '更新失败', res.status, json.code);
    }
  }

  /** 删除 (Delete) — DELETE /{routePath}Delete/:id，body: { id } */
  async deleteOne(routePath: string, id: string): Promise<void> {
    const res = await this.authedFetch(`/api/v1/data/${routePath}Delete/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const json = (await res.json()) as EadafEnvelope<unknown>;
      throw new EadafError(json.message ?? '删除失败', res.status, json.code);
    }
  }

  // ============ 采集管道 ============

  /** 提交采集原始数据 (ingest) — 原始字节 ≤ 1MB */
  async ingest(routePath: string, rawBytes: Uint8Array, contentType = 'application/octet-stream'): Promise<void> {
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

  /** 上传文件 — multipart，返回 objectId */
  async uploadObject(file: Buffer, filename: string, bucketId?: string): Promise<string> {
    const token = await this.getToken();
    const form = new FormData();
    if (bucketId) form.append('bucketId', bucketId);
    form.append('file', new Blob([file]), filename);
    const res = await fetch(`${config.eadaf.apiBaseUrl}/api/v1/storage/objects/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const json = (await res.json()) as EadafEnvelope<{ object_id?: string; id?: string }>;
    if (!res.ok) throw new EadafError(json.message ?? '上传失败', res.status, json.code);
    return json.data.object_id ?? json.data.id ?? '';
  }

  /** 下载文件 — 返回 Readable 流（通过 Response.body） */
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

/** 统一 Find 结果为 {items, total} — 兼容多种 EADAF 响应格式 */
function normalizeFindResult<T>(data: unknown): FindResult<T> {
  // 格式1: 直接数组
  if (Array.isArray(data)) {
    return { items: data, total: data.length };
  }
  const obj = data as Record<string, unknown>;
  // 格式2: { items: [...], total: N }
  if (Array.isArray(obj.items)) {
    return { items: obj.items as T[], total: (obj.total as number) ?? (obj.items as T[]).length };
  }
  // 格式3: EADAF 执行报告 { preview: { items: [...] } }
  const preview = obj.preview as Record<string, unknown> | undefined;
  if (preview && Array.isArray(preview.items)) {
    return { items: preview.items as T[], total: (preview.total as number) ?? (preview.items as T[]).length };
  }
  return { items: [], total: 0 };
}

/** 单例 */
export const eadafClient = new EADAFClient();
