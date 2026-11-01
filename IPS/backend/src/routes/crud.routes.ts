/**
 * 通用 CRUD 代理路由 (/api/ips/crud/:module/:entity)
 *
 * 以一套路由覆盖全部实体，透传到 EADAF 的 *Find/*Create/*Update/*Delete。
 * Find 分页/过滤对齐 EADAF Skill ≥1.1.2：limit+skip → items+pagination；字段过滤走 filter。
 *
 * 全部经 authenticate 中间件保护。
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { eadafClient } from '../eadaf/EADAFClient.js';
import { resolveEntity } from '../eadaf/entities.js';
import { parsePageParams, toListPayload } from '../lib/paging.js';
import { ok, fail, handleError } from '../lib/response.js';

export const crudRouter = Router();
crudRouter.use(authenticate);

/** 分页/过滤保留字段（不下发到 EADAF 过滤） */
const RESERVED_QUERY = new Set(['limit', 'skip', 'page', 'pageSize']);

/** 查询保留参数；其余 query 视为字段级等值过滤 */
function buildFilter(query: Record<string, unknown>): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(query)) {
    if (RESERVED_QUERY.has(k)) continue;
    if (v === undefined || v === null || v === '') continue;
    filter[k] = v;
  }
  return filter;
}

/**
 * GET /:module/:entity — 列表
 * Query：page/pageSize（前端）或 limit/skip（EADAF 原生）+ 字段过滤
 */
crudRouter.get('/:module/:entity', async (req, res) => {
  try {
    const meta = resolveEntity(req.params.module, req.params.entity);
    if (!meta) return fail(res, 404, `未知实体: ${req.params.module}/${req.params.entity}`, null);

    const q = req.query as Record<string, unknown>;
    const pageParams = parsePageParams(q);
    const filter = buildFilter(q);
    const status = typeof q.status === 'string' ? q.status : undefined;

    const result = await eadafClient.find(meta.routePath, {
      limit: pageParams.limit,
      skip: pageParams.skip,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      status,
    });
    return ok(res, toListPayload(result, pageParams));
  } catch (e) {
    return handleError(res, e);
  }
});

/** POST /:module/:entity — 创建，body 透传为实体字段 */
crudRouter.post('/:module/:entity', async (req, res) => {
  try {
    const meta = resolveEntity(req.params.module, req.params.entity);
    if (!meta) return fail(res, 404, `未知实体: ${req.params.module}/${req.params.entity}`, null);

    const item = await eadafClient.create(meta.routePath, req.body as Record<string, unknown>);
    return ok(res, item);
  } catch (e) {
    return handleError(res, e);
  }
});

/** PATCH /:module/:entity/:id — 更新，body 透传为待更新字段 */
crudRouter.patch('/:module/:entity/:id', async (req, res) => {
  try {
    const meta = resolveEntity(req.params.module, req.params.entity);
    if (!meta) return fail(res, 404, `未知实体: ${req.params.module}/${req.params.entity}`, null);

    const item = await eadafClient.update(meta.routePath, req.params.id, req.body as Record<string, unknown>);
    return ok(res, item);
  } catch (e) {
    return handleError(res, e);
  }
});

/** DELETE /:module/:entity/:id — 删除 */
crudRouter.delete('/:module/:entity/:id', async (req, res) => {
  try {
    const meta = resolveEntity(req.params.module, req.params.entity);
    if (!meta) return fail(res, 404, `未知实体: ${req.params.module}/${req.params.entity}`, null);

    await eadafClient.deleteOne(meta.routePath, req.params.id);
    return ok(res, { id: req.params.id, deleted: true });
  } catch (e) {
    return handleError(res, e);
  }
});
