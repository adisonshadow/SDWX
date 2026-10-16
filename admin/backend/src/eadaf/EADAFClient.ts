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
  page?: number;
  size?: number;
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
   * GET /api/v1/data/{routePath}Find?limit=&skip=&{字段级参数}
   *
   * 过滤规则（对齐 EADAF 平台约定）：
   * - 优先使用顶层字段级参数（如 ?status=completed&station_type=sorting），简洁高效。
   * - 也支持 filter 对象（如 filter={"status":"pending"}），但顶层参数优先级更高
   *   ——若同时传 status 与 filter.status，以顶层 status 为准。
   * - 如无必要尽量使用顶层参数。
   * - **不参与过滤的字段不要传**：省略即代表「全部」。部分字段（如 status）有枚举校验，
   *   传空串会被拒（400 Invalid option），因此只下发有实际值的字段。
   *
   * 实现说明：params.filter 中的字段映射为顶层字段级参数（仅非空值），params.status
   * 作为 status 字段便捷入口并覆盖 filter.status。
   */
  async find<T>(routePath: string, params: FindParams = {}): Promise<FindResult<T>> {
    const query = new URLSearchParams();
    // EADAF Find 的 limit 上限为 100（apis.json: maximum 100），超过会 400
    if (params.limit != null) query.set('limit', String(Math.min(params.limit, 100)));
    if (params.skip != null) query.set('skip', String(params.skip));
    if (params.filter) {
      for (const [field, val] of Object.entries(params.filter)) {
        if (val != null && val !== '') {
          // 顶层 status 优先于 filter.status
          if (field === 'status' && params.status != null) continue;
          query.set(field, String(val));
        }
      }
    }
    // 顶层 status 便捷入口（覆盖 filter.status）
    if (params.status) query.set('status', params.status);
    const qs = query.toString();
    const res = await this.authedFetch(`/api/v1/data/${routePath}Find${qs ? `?${qs}` : ''}`);
    const json = (await res.json()) as EadafEnvelope<FindResult<T> | T[]>;
    if (!res.ok) throw new EadafError(json.message ?? '查询失败', res.status, json.code);
    return normalizeFindResult(json.data);
  }

  /**
   * 查询并按 filter 过滤（服务端字段级过滤）。
   *
   * filter 中的字段（非空值）经 find() 下发为顶层字段级参数，真正的服务端过滤；
   * 顶层 status 优先级高于 filter.status。
   */
  async findFiltered<T>(
    routePath: string,
    filter: Record<string, unknown>,
    params: Omit<FindParams, 'filter'> = {},
  ): Promise<FindResult<T>> {
    return this.find<T>(routePath, { ...params, filter, limit: params.limit ?? 100 });
  }

  /**
   * 创建 (Create) — body 包在 { body: {...} } 里；snake_case 实体自动补齐时间戳。
   * 响应 data 结构为 { item: {...} }（所有实体统一），此处解包返回实体本身。
   */
  async create<T>(routePath: string, body: Record<string, unknown>, withTimestamps = true): Promise<T> {
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
    // 兼容 { item: T } 与裸 T 两种返回形态
    const data = json.data as { item?: T } & T;
    return (data && typeof data === 'object' && 'item' in data ? data.item : data) as T;
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

  /** 删除 (Delete) — DELETE /{routePath}Delete/:id，id 仅在 URL path（无 request body） */
  async deleteOne(routePath: string, id: string): Promise<void> {
    const res = await this.authedFetch(`/api/v1/data/${routePath}Delete/${id}`, {
      method: 'DELETE',
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

/**
 * 统一 Find 结果为 {items, total, page?, size?} — 兼容多种 EADAF 响应格式。
 *
 * 实测部分部署会在外层 envelope 内再包一层 `{ code, message, data: { items, total } }`，
 * 若不解包则 items 恒为空。
 */
function normalizeFindResult<T>(data: unknown): FindResult<T> {
  let cur: unknown = data;
  // 剥掉多余的 { code, message, data } 外壳，直到看到列表形态
  for (let i = 0; i < 3; i++) {
    if (cur == null || Array.isArray(cur) || typeof cur !== 'object') break;
    const obj = cur as Record<string, unknown>;
    if (Array.isArray(obj.items)) break;
    const preview = obj.preview as Record<string, unknown> | undefined;
    if (preview && Array.isArray(preview.items)) break;
    if (obj.data != null && typeof obj.data === 'object') {
      cur = obj.data;
      continue;
    }
    break;
  }

  // 格式1: 直接数组
  if (Array.isArray(cur)) {
    return { items: cur as T[], total: cur.length };
  }
  if (cur == null || typeof cur !== 'object') {
    return { items: [], total: 0 };
  }
  const obj = cur as Record<string, unknown>;
  // 格式2: { items: [...], total: N, page?, size? }
  if (Array.isArray(obj.items)) {
    return {
      items: obj.items as T[],
      total: (obj.total as number) ?? (obj.count as number) ?? (obj.items as T[]).length,
      page: obj.page as number | undefined,
      size: obj.size as number | undefined,
    };
  }
  // 格式3: EADAF 执行报告 { preview: { items: [...], count|total } }
  const preview = obj.preview as Record<string, unknown> | undefined;
  if (preview && Array.isArray(preview.items)) {
    return {
      items: preview.items as T[],
      total: (preview.count as number) ?? (preview.total as number) ?? (preview.items as T[]).length,
    };
  }
  return { items: [], total: 0 };
}

/** 单例 */
export const eadafClient = new EADAFClient();
