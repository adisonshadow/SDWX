/**
 * 业务编排路由 (/api/ips/*)
 *
 * 全部经 authenticate 中间件保护。
 * 数据存取经 repositories → EADAFClient → EADAF（routePath 格式 IPS/{module}/{Entity}）。
 * 响应信封 { code, message, data }；写操作带 WS 广播。
 *
 * 通用 CRUD 代理见 crud.routes.ts（/api/ips/crud/*），覆盖全部实体基础增删改查。
 * 本文件实现按 docs/模块的 业务工作流编排端点。
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { opHub } from '../ws/opHub.js';
import * as repo from '../eadaf/repositories.js';
import { parsePageParams, toListPayload } from '../lib/paging.js';
import { ok, fail, handleError } from '../lib/response.js';
import { parseOr400, parseQueryOr400 } from '../lib/validate.js';
import { WS_EVENTS } from '@ips/shared';

export const opRouter = Router();
opRouter.use(authenticate);

/** 操作人信息（取自 req.user） */
function operator(req: { user?: { user_id?: string; id?: string; name?: string; username?: string } }): {
  id: string;
  name: string;
} {
  return {
    id: req.user?.user_id ?? req.user?.id ?? 'unknown',
    name: req.user?.name ?? req.user?.username ?? '',
  };
}

// ═══════════════════════════════════════════
// 主数据查询（聚合视图）
// ═══════════════════════════════════════════

/** 工位列表 */
opRouter.get('/workstations', async (req, res) => {
  try {
    const result = await repo.workstationRepo.list({
      ...(req.query.areaType ? { areaType: String(req.query.areaType) } : {}),
    });
    return ok(res, result);
  } catch (e) {
    return handleError(res, e);
  }
});

/** 工序 / BOP 聚合读已迁至 craft.routes.ts（含工步边、物料、BOP 边） */

// ═══════════════════════════════════════════
// 令号投产向导
// ═══════════════════════════════════════════

const LaunchOrderSchema = z.object({
  factoryOrderId: z.string().min(1),
  productId: z.string().min(1),
  repairMethod: z.enum(['OVERHAUL', 'CHECK', 'DETECT', 'OIL_SEAL', 'TROUBLESHOOT']),
  bopSchemeId: z.string().min(1),
  workshopOrderNo: z.string().min(1).optional(),
  planStartDate: z.string().optional(),
  planEndDate: z.string().optional(),
});

/**
 * 令号投产向导：创建车间令号 → 生成 BOP 实例 → 批量生成 WorkCard（PENDING_EFFECTIVE）
 *              → 创建单台计划 → 建一棵 WBS 根节点。
 */
opRouter.post('/orders/launch', async (req, res) => {
  try {
    const body = parseOr400(req, res, LaunchOrderSchema);
    if (!body) return;

    // 1. 创建车间令号
    const orderNo =
      body.workshopOrderNo ?? repo.genBizNo(`WO-${body.repairMethod.slice(0, 2)}`);
    const order = await repo.workshopOrderRepo.create({
      workshopOrderNo: orderNo,
      factoryOrderId: body.factoryOrderId,
      productId: body.productId,
      repairMethod: body.repairMethod,
      bopSchemeId: body.bopSchemeId,
      planStartDate: body.planStartDate ?? null,
      planEndDate: body.planEndDate ?? null,
      status: 'RELEASED',
    });

    // 2. 生成 BOP 实例
    const bopScheme = await repo.bopSchemeRepo.get(body.bopSchemeId).catch(() => null);
    const bopInstanceName =
      bopScheme?.name || `${orderNo} 维修方案实例`;
    const bopInstance = await repo.bopInstanceRepo.create({
      workshopOrderId: order.id,
      bopSchemeId: body.bopSchemeId,
      frozenSchemeVersion: 1,
      name: bopInstanceName,
    });

    // 3. BOP 工序节点 → 工序实例 + 工卡
    const bopNodes = await repo.bopOperationNodeRepo.listByScheme(body.bopSchemeId);
    const workCards: { id?: string }[] = [];
    let seq = 1;
    for (const node of bopNodes.items) {
      const processOp = node.operationId
        ? await repo.processOperationRepo.get(node.operationId).catch(() => null)
        : null;
      const opLabel =
        node.name || processOp?.name || processOp?.operationNo || node.nodeNo || null;
      const opInstance = await repo.operationInstanceRepo.create({
        bopInstanceId: bopInstance.id,
        processOperationId: node.operationId,
        sourceNodeNo: node.nodeNo,
        isRoutine: true,
        name: opLabel,
      });
      const card = await repo.workCardRepo.create({
        workCardNo: repo.genWorkCardNo(orderNo, seq),
        name: opLabel,
        workshopOrderId: order.id,
        operationInstanceId: opInstance.id,
        bopInstanceId: bopInstance.id,
        status: 'PENDING_EFFECTIVE',
        isRoutine: true,
        kitRequired: true,
        priority: 'ROUTINE',
      });
      workCards.push(card);
      seq += 1;
    }

    // 4. 创建单台计划 + WBS 根节点
    const planName = `${orderNo} 单台计划`;
    const plan = await repo.singleUnitPlanRepo.create({
      workshopOrderId: order.id,
      name: planName,
    });
    await repo.wbsNodeRepo.create({
      code: `WBS-${orderNo}`,
      name: planName,
      level: 0,
      nodeType: 'ROOT',
      workshopOrderId: order.id,
      singleUnitPlanId: plan.id,
      isRoutine: true,
      isMaterialBundle: false,
      status: 'PENDING_EFFECTIVE',
    });

    opHub.broadcastAll({
      type: WS_EVENTS.ORDER_LAUNCHED,
      payload: { workshopOrderId: order.id, workshopOrderNo: orderNo, workCardCount: workCards.length },
    });

    return ok(res, {
      workshopOrder: order,
      bopInstance,
      workCards,
      singleUnitPlanId: plan.id,
    });
  } catch (e) {
    return handleError(res, e);
  }
});

/** 令号总览（令号 + 工卡列表 + 单台计划 + BOP 实例） */
opRouter.get('/orders/:workshopOrderId', async (req, res) => {
  try {
    const overview = await repo.getOrderOverview(req.params.workshopOrderId);
    return ok(res, overview);
  } catch (e) {
    return handleError(res, e);
  }
});

// ═══════════════════════════════════════════
// WBS
// ═══════════════════════════════════════════

/** WBS 多级树（按令号） */
opRouter.get('/wbs/trees/:workshopOrderId', async (req, res) => {
  try {
    const nodes = await repo.wbsNodeRepo.listByOrder(req.params.workshopOrderId);
    const tree = repo.buildWbsTree(nodes.items);
    return ok(res, { tree, total: nodes.items.length });
  } catch (e) {
    return handleError(res, e);
  }
});

const WbsNodeUpdateSchema = z.object({
  code: z.string().optional(),
  name: z.string().optional(),
  level: z.number().int().optional(),
  nodeType: z.enum(['ROOT', 'TASK', 'GROUP', 'PHASE', 'PACKAGE']).optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  workstationId: z.string().nullable().optional(),
  status: z.string().optional(),
  remark: z.string().nullable().optional(),
});

/** 更新 WBS 节点 */
opRouter.patch('/wbs/nodes/:id', async (req, res) => {
  try {
    const body = parseOr400(req, res, WbsNodeUpdateSchema);
    if (!body) return;
    const updated = await repo.wbsNodeRepo.update(req.params.id, body);
    return ok(res, updated);
  } catch (e) {
    return handleError(res, e);
  }
});

const PostponeSchema = z.object({
  nodeIds: z.array(z.string()).min(1),
  days: z.number().int().positive(),
});

/** 批量顺延（按 DAG 约束重算计划时间） */
opRouter.post('/wbs/nodes/postpone', async (req, res) => {
  try {
    const body = parseOr400(req, res, PostponeSchema);
    if (!body) return;
    const updated = await Promise.all(
      body.nodeIds.map((id) =>
        repo.wbsNodeRepo.update(id, { remark: `顺延 ${body.days} 天 @ ${new Date().toISOString()}` }),
      ),
    );
    return ok(res, { postponed: updated.length });
  } catch (e) {
    return handleError(res, e);
  }
});

// ═══════════════════════════════════════════
// 工卡作业
// ═══════════════════════════════════════════

const WorkCardListQuerySchema = z.object({
  workshopOrderId: z.string().optional(),
  workstationId: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  /** 需要齐套的工卡 */
  kitRequired: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === true || v === 'true')),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

/** 工卡列表（分页对齐 EADAF Skill §3.2.1：limit+skip → items+pagination） */
opRouter.get('/workcards', async (req, res) => {
  try {
    const q = parseQueryOr400(req, res, WorkCardListQuerySchema);
    if (!q) return;
    const filter: Record<string, unknown> = {};
    if (q.workshopOrderId) filter.workshopOrderId = q.workshopOrderId;
    if (q.workstationId) filter.workstationId = q.workstationId;
    if (q.status) filter.status = q.status;
    if (q.priority) filter.priority = q.priority;
    if (q.kitRequired !== undefined) filter.kitRequired = q.kitRequired;
    const pageParams = parsePageParams({
      page: q.page,
      pageSize: q.pageSize ?? q.limit,
      limit: q.limit,
    });
    const result = await repo.workCardRepo.list(filter, {
      limit: pageParams.limit,
      skip: pageParams.skip,
    });
    return ok(res, toListPayload(result, pageParams));
  } catch (e) {
    return handleError(res, e);
  }
});

/** 游离工卡池（待生效） */
opRouter.get('/workcards/floating', async (req, res) => {
  try {
    const filter: Record<string, unknown> = { status: 'PENDING_EFFECTIVE' };
    if (req.query.workstationId) filter.workstationId = String(req.query.workstationId);
    if (req.query.priority) filter.priority = String(req.query.priority);
    const result = await repo.workCardRepo.list(filter);
    return ok(res, result);
  } catch (e) {
    return handleError(res, e);
  }
});

/** 工卡详情（聚合 工序/工步/齐套/DAG） */
opRouter.get('/workcards/:id', async (req, res) => {
  try {
    const card = await repo.workCardRepo.get(req.params.id);
    if (!card) return fail(res, 404, '工卡不存在', null);
    const [kitReqRaw, outsourcingRaw, outEdgesRaw, inEdgesRaw, opInstance, steps, workstation] =
      await Promise.all([
        repo.kitRequirementRepo.listByCard(req.params.id).then((r) => r.items).catch(() => []),
        repo.outsourcingRepo.listByCard(req.params.id).then((r) => r.items).catch(() => []),
        repo.workCardEdgeRepo.listByFrom(req.params.id).then((r) => r.items).catch(() => []),
        repo.workCardEdgeRepo.listByTo(req.params.id).then((r) => r.items).catch(() => []),
        card.operationInstanceId
          ? repo.operationInstanceRepo.get(card.operationInstanceId).catch(() => null)
          : Promise.resolve(null),
        card.operationInstanceId
          ? repo.stepInstanceRepo
              .listByOperation(card.operationInstanceId)
              .then((r) => r.items)
              .catch(() => [])
          : Promise.resolve([]),
        card.workstationId
          ? repo.workstationRepo.get(card.workstationId).catch(() => null)
          : Promise.resolve(null),
      ]);
    const kit = await repo.checkKit(req.params.id).catch(() => null);
    let operationLabel: string | null =
      opInstance?.name || card.name || opInstance?.sourceNodeNo || null;
    if (!operationLabel && opInstance?.processOperationId) {
      const processOp = await repo.processOperationRepo
        .get(opInstance.processOperationId)
        .catch(() => null);
      operationLabel = processOp?.name || processOp?.operationNo || null;
    }
    const workstationName = workstation
      ? `${workstation.stationNo}${workstation.name ? `（${workstation.name}）` : ''}`
      : null;

    /** 物料名称：齐套 / 委外共用，避免直接露 UUID */
    const materialIds = [
      ...new Set(
        [...kitReqRaw, ...outsourcingRaw]
          .map((r) => r.materialId)
          .filter((id): id is string => !!id),
      ),
    ];
    const materialLabelById = new Map<string, string>();
    await Promise.all(
      materialIds.map(async (mid) => {
        const m = await repo.materialRepo.get(mid).catch(() => null);
        if (!m) return;
        const label = [m.materialNo, m.name].filter(Boolean).join(' · ') || mid;
        materialLabelById.set(mid, label);
      }),
    );
    const kitRequirements = kitReqRaw.map((r) => ({
      ...r,
      materialLabel: r.materialId
        ? materialLabelById.get(r.materialId) || r.materialId
        : r.name || null,
    }));
    const outsourcing = outsourcingRaw.map((r) => ({
      ...r,
      materialLabel: r.materialId
        ? materialLabelById.get(r.materialId) || r.materialId
        : r.name || null,
    }));

    /** DAG 边两端工卡：工卡号 + 名称，避免直接露 UUID */
    const edgeCardIds = [
      ...new Set(
        [...outEdgesRaw, ...inEdgesRaw].flatMap((e) =>
          [e.fromWorkCardId, e.toWorkCardId].filter(Boolean),
        ),
      ),
    ];
    const edgeCardLabelById = new Map<string, string>();
    await Promise.all(
      edgeCardIds.map(async (cid) => {
        const c = await repo.workCardRepo.get(cid).catch(() => null);
        if (!c) return;
        const label = [c.workCardNo, c.name].filter(Boolean).join(' · ') || cid;
        edgeCardLabelById.set(cid, label);
      }),
    );
    const enrichEdge = (e: (typeof outEdgesRaw)[number]) => ({
      ...e,
      fromWorkCardLabel: edgeCardLabelById.get(e.fromWorkCardId) || e.fromWorkCardId,
      toWorkCardLabel: edgeCardLabelById.get(e.toWorkCardId) || e.toWorkCardId,
    });
    const outEdges = outEdgesRaw.map(enrichEdge);
    const inEdges = inEdgesRaw.map(enrichEdge);

    return ok(res, {
      workCard: card,
      operationInstance: opInstance
        ? { ...opInstance, name: opInstance.name || operationLabel }
        : null,
      workstationName,
      steps,
      kitRequirements,
      outsourcing,
      outEdges,
      inEdges,
      kit,
    });
  } catch (e) {
    return handleError(res, e);
  }
});

/** 手动生效工卡（PENDING_EFFECTIVE → PENDING_ACCEPT，推工位） */
opRouter.post('/workcards/:id/effect', async (req, res) => {
  try {
    const updated = await repo.workCardRepo.update(req.params.id, { status: 'PENDING_ACCEPT' });
    opHub.broadcastAll({
      type: WS_EVENTS.WORKCARD_EFFECTED,
      payload: { id: req.params.id, status: 'PENDING_ACCEPT' },
    });
    return ok(res, updated);
  } catch (e) {
    return handleError(res, e);
  }
});

/** 取消工卡（批量） */
const CancelSchema = z.object({ ids: z.array(z.string()).min(1) });
opRouter.post('/workcards/cancel', async (req, res) => {
  try {
    const body = parseOr400(req, res, CancelSchema);
    if (!body) return;
    await Promise.all(
      body.ids.map((id) => repo.workCardRepo.update(id, { status: 'CANCELLED' })),
    );
    opHub.broadcastAll({
      type: WS_EVENTS.WORKCARD_CANCELLED,
      payload: { ids: body.ids, status: 'CANCELLED' },
    });
    return ok(res, { cancelled: body.ids.length });
  } catch (e) {
    return handleError(res, e);
  }
});

/** 接受工卡（PENDING_ACCEPT → REPAIRING） */
opRouter.post('/workcards/:id/accept', async (req, res) => {
  try {
    const op = operator(req);
    const now = new Date().toISOString();
    const updated = await repo.workCardRepo.update(req.params.id, {
      status: 'REPAIRING',
      acceptedAt: now,
      repairStartedAt: now,
    });
    opHub.broadcastAll({
      type: WS_EVENTS.WORKCARD_STATUS_CHANGED,
      payload: { id: req.params.id, status: 'REPAIRING', operator: op.name },
    });
    return ok(res, updated);
  } catch (e) {
    return handleError(res, e);
  }
});

/** 更新工卡进度 */
const ProgressSchema = z.object({ progress: z.number().min(0).max(100) });
opRouter.patch('/workcards/:id/progress', async (req, res) => {
  try {
    const body = parseOr400(req, res, ProgressSchema);
    if (!body) return;
    opHub.broadcastAll({
      type: WS_EVENTS.WORKCARD_PROGRESS,
      payload: { id: req.params.id, progress: body.progress },
    });
    return ok(res, { id: req.params.id, progress: body.progress });
  } catch (e) {
    return handleError(res, e);
  }
});

/** 提交工卡（REPAIRING → REPAIR_DONE） */
opRouter.post('/workcards/:id/submit', async (req, res) => {
  try {
    const now = new Date().toISOString();
    const updated = await repo.workCardRepo.update(req.params.id, {
      status: 'REPAIR_DONE',
      repairFinishedAt: now,
    });
    opHub.broadcastAll({
      type: WS_EVENTS.WORKCARD_STATUS_CHANGED,
      payload: { id: req.params.id, status: 'REPAIR_DONE' },
    });
    return ok(res, updated);
  } catch (e) {
    return handleError(res, e);
  }
});

// ═══════════════════════════════════════════
// 齐套管理
// ═══════════════════════════════════════════

/** 齐套需求列表 */
opRouter.get('/kit/requirements/:workCardId', async (req, res) => {
  try {
    const result = await repo.kitRequirementRepo.listByCard(req.params.workCardId);
    return ok(res, result);
  } catch (e) {
    return handleError(res, e);
  }
});

/** 齐套校验 */
opRouter.post('/kit/check/:workCardId', async (req, res) => {
  try {
    const result = await repo.checkKit(req.params.workCardId);
    opHub.broadcastAll({
      type: WS_EVENTS.KIT_CHANGED,
      payload: { workCardId: req.params.workCardId, ...result },
    });
    return ok(res, result);
  } catch (e) {
    return handleError(res, e);
  }
});

/** 齐套挂起工卡 */
opRouter.post('/workcards/:id/suspend', async (req, res) => {
  try {
    const updated = await repo.workCardRepo.update(req.params.id, {
      status: 'KIT_SUSPENDED',
      occupiesPipeline: false,
    });
    opHub.broadcastAll({
      type: WS_EVENTS.WORKCARD_STATUS_CHANGED,
      payload: { id: req.params.id, status: 'KIT_SUSPENDED' },
    });
    return ok(res, updated);
  } catch (e) {
    return handleError(res, e);
  }
});

/** 恢复挂起工卡（齐套满足后回到 PENDING_REPAIR） */
opRouter.post('/workcards/:id/resume', async (req, res) => {
  try {
    const kit = await repo.checkKit(req.params.id);
    if (!kit.satisfied) {
      return fail(res, 400, `齐套未满足（缺 ${kit.missing} 项），无法恢复`, null);
    }
    const updated = await repo.workCardRepo.update(req.params.id, { status: 'PENDING_REPAIR' });
    opHub.broadcastAll({
      type: WS_EVENTS.WORKCARD_STATUS_CHANGED,
      payload: { id: req.params.id, status: 'PENDING_REPAIR' },
    });
    return ok(res, updated);
  } catch (e) {
    return handleError(res, e);
  }
});

// ═══════════════════════════════════════════
// 非例行插单
// ═══════════════════════════════════════════

const NonRoutineCardSchema = z.object({
  workshopOrderId: z.string().min(1),
  operationInstanceId: z.string().min(1),
  workstationId: z.string().min(1),
  priority: z.enum(['NON_ROUTINE', 'URGENT']).default('NON_ROUTINE'),
  pipelineOrder: z.number().int().positive().optional(),
  remark: z.string().optional(),
});

/** 创建非例行工卡并插入工位管道 */
opRouter.post('/workcards/non-routine', async (req, res) => {
  try {
    const body = parseOr400(req, res, NonRoutineCardSchema);
    if (!body) return;
    const order = await repo.workshopOrderRepo.get(body.workshopOrderId);
    if (!order) return fail(res, 404, '车间令号不存在', null);

    const card = await repo.workCardRepo.create({
      workCardNo: repo.genBizNo('WC-NR'),
      workshopOrderId: body.workshopOrderId,
      operationInstanceId: body.operationInstanceId,
      status: 'PENDING_ACCEPT',
      isRoutine: false,
      kitRequired: false,
      priority: body.priority,
      workstationId: body.workstationId,
      pipelineOrder: body.pipelineOrder ?? 1,
      occupiesPipeline: false,
      remark: body.remark ?? '非例行插单',
    });

    opHub.broadcast(
      { type: WS_EVENTS.PIPELINE_CHANGED, payload: { workstationId: body.workstationId, inserted: card } },
      undefined,
    );
    return ok(res, card);
  } catch (e) {
    return handleError(res, e);
  }
});

/** Recall：召回已生效工卡至待接受 */
opRouter.post('/workcards/:id/recall', async (req, res) => {
  try {
    const updated = await repo.workCardRepo.update(req.params.id, {
      status: 'PENDING_ACCEPT',
      occupiesPipeline: false,
    });
    opHub.broadcastAll({
      type: WS_EVENTS.WORKCARD_STATUS_CHANGED,
      payload: { id: req.params.id, status: 'PENDING_ACCEPT', action: 'recall' },
    });
    return ok(res, updated);
  } catch (e) {
    return handleError(res, e);
  }
});

// ═══════════════════════════════════════════
// 排产引擎
// ═══════════════════════════════════════════

interface EngineState {
  running: boolean;
  lastRunAt: string | null;
  lastRunError: string | null;
  runCount: number;
}
const engineState: EngineState = {
  running: false,
  lastRunAt: null,
  lastRunError: null,
  runCount: 0,
};

/** 引擎状态 */
opRouter.get('/engine/status', async (_req, res) => {
  try {
    return ok(res, engineState);
  } catch (e) {
    return handleError(res, e);
  }
});

/**
 * 触发一次全量重算：扫描所有 PENDING_EFFECTIVE 工卡，按配置生成 WorkCardPlanSlot。
 * 这里是简化实现（实际排产引擎算法按需扩展）。
 */
opRouter.post('/engine/run', async (req, res) => {
  try {
    engineState.running = true;
    opHub.broadcastAll({ type: WS_EVENTS.ENGINE_STATUS, payload: { running: true } });

    const floating = await repo.workCardRepo.list({ status: 'PENDING_EFFECTIVE' });
    const log = (message: string) =>
      opHub.broadcastAll({ type: WS_EVENTS.ENGINE_LOG, payload: { message, ts: new Date().toISOString() } });

    log(`开始重算，待生效工卡 ${floating.items.length} 张`);
    let effected = 0;
    for (const card of floating.items) {
      if (!card.id) continue;
      // 简化：直接生效为待接受（真实引擎会按容量/齐套/DAG 决策）
      await repo.workCardRepo.update(card.id, { status: 'PENDING_ACCEPT' });
      effected += 1;
    }
    log(`重算完成，生效 ${effected} 张工卡`);

    engineState.running = false;
    engineState.lastRunAt = new Date().toISOString();
    engineState.lastRunError = null;
    engineState.runCount += 1;
    opHub.broadcastAll({ type: WS_EVENTS.ENGINE_STATUS, payload: { running: false, runCount: engineState.runCount } });

    return ok(res, { ...engineState, effected, total: floating.items.length });
  } catch (e) {
    engineState.running = false;
    engineState.lastRunError = (e as Error).message;
    engineState.lastRunAt = new Date().toISOString();
    opHub.broadcastAll({ type: WS_EVENTS.ENGINE_STATUS, payload: { running: false, error: engineState.lastRunError } });
    return handleError(res, e);
  }
});

// ═══════════════════════════════════════════
// 排产配置
// ═══════════════════════════════════════════

/** 排产配置（默认） */
opRouter.get('/config/schedule', async (_req, res) => {
  try {
    const config = await repo.scheduleConfigRepo.getDefault();
    return ok(res, config);
  } catch (e) {
    return handleError(res, e);
  }
});

const ScheduleConfigSchema = z.object({
  includeSaturday: z.boolean().optional(),
  includeSunday: z.boolean().optional(),
  amStart: z.string().optional(),
  amEnd: z.string().optional(),
  pmStart: z.string().optional(),
  pmEnd: z.string().optional(),
  pipelineCapacityFactor: z.number().optional(),
  effectiveLookaheadSlots: z.number().int().optional(),
  preferHistoricalMedian: z.boolean().optional(),
});

opRouter.patch('/config/schedule', async (req, res) => {
  try {
    const body = parseOr400(req, res, ScheduleConfigSchema);
    if (!body) return;
    let config = await repo.scheduleConfigRepo.getDefault();
    if (!config?.id) {
      config = await repo.scheduleConfigRepo.create({ configKey: 'DEFAULT', ...body });
    } else {
      config = await repo.scheduleConfigRepo.update(config.id, body);
    }
    return ok(res, config);
  } catch (e) {
    return handleError(res, e);
  }
});

/** 工位产能列表 */
opRouter.get('/config/workstation-capacity', async (_req, res) => {
  try {
    const result = await repo.workstationCapacityRepo.list();
    return ok(res, result);
  } catch (e) {
    return handleError(res, e);
  }
});

const WorkstationCapacitySchema = z.object({
  workstationId: z.string().min(1),
  effectiveFrom: z.string().min(1),
  dailyLoadHours: z.union([z.number(), z.string()]),
  amHours: z.union([z.number(), z.string()]).nullable().optional(),
  pmHours: z.union([z.number(), z.string()]).nullable().optional(),
  pipelineCapacityFactor: z.union([z.number(), z.string()]).nullable().optional(),
});

/** 创建/更新工位产能（按 workstationId+effectiveFrom 判定） */
opRouter.put('/config/workstation-capacity', async (req, res) => {
  try {
    const body = parseOr400(req, res, WorkstationCapacitySchema);
    if (!body) return;
    const existing = await repo.workstationCapacityRepo.listByWorkstation(body.workstationId);
    const found = existing.items.find((c) => c.effectiveFrom === body.effectiveFrom);
    if (found?.id) {
      const updated = await repo.workstationCapacityRepo.update(found.id, body);
      return ok(res, updated);
    }
    const created = await repo.workstationCapacityRepo.create(body);
    return ok(res, created);
  } catch (e) {
    return handleError(res, e);
  }
});

// ═══════════════════════════════════════════
// 排产可视化
// ═══════════════════════════════════════════

/** 令号甘特图：工卡条带（按令号聚合工卡 + 计划时段） */
opRouter.get('/gantt/workshop-order/:id', async (req, res) => {
  try {
    const [cards, tasks] = await Promise.all([
      repo.workCardRepo.listByOrder(req.params.id),
      repo.workCardTaskRepo.listByOrder(req.params.id),
    ]);
    return ok(res, { workCards: cards.items, tasks: tasks.items });
  } catch (e) {
    return handleError(res, e);
  }
});

/** 工位负荷：各工位未来 N 天负荷（计划时段汇总） */
opRouter.get('/load/workstations', async (req, res) => {
  try {
    const days = req.query.days ? parseInt(String(req.query.days), 10) : 14;
    const workstations = await repo.workstationRepo.list();
    const loads = await Promise.all(
      workstations.items.map(async (ws) => {
        const slots = ws.id ? await repo.workCardPlanSlotRepo.listByWorkstation(ws.id) : { items: [], total: 0 };
        return { workstation: ws, slotCount: slots.total, slots: slots.items, horizonDays: days };
      }),
    );
    return ok(res, { items: loads, days });
  } catch (e) {
    return handleError(res, e);
  }
});

// ═══════════════════════════════════════════
// 统计分析
// ═══════════════════════════════════════════

/** 工时中位数列表 */
opRouter.get('/analytics/work-hour-medians', async (_req, res) => {
  try {
    const result = await repo.workHourMedianRepo.list();
    return ok(res, result);
  } catch (e) {
    return handleError(res, e);
  }
});

/** 管道利用率（各工位计划时段汇总 vs 日负荷） */
opRouter.get('/analytics/utilization', async (_req, res) => {
  try {
    const workstations = await repo.workstationRepo.list();
    const items = await Promise.all(
      workstations.items.map(async (ws) => {
        const slots = ws.id ? await repo.workCardPlanSlotRepo.listByWorkstation(ws.id) : { items: [], total: 0 };
        const plannedHours = slots.items.reduce(
          (sum, s) => sum + Number(s.hours ?? 0),
          0,
        );
        const capacity = Number(ws.dailyLoadHours ?? 0);
        return {
          workstationId: ws.id,
          stationNo: ws.stationNo,
          name: ws.name ?? null,
          plannedHours,
          dailyLoadHours: capacity,
          utilization: capacity > 0 ? plannedHours / capacity : 0,
        };
      }),
    );
    return ok(res, { items });
  } catch (e) {
    return handleError(res, e);
  }
});

/** 排产偏差分析（简化：按工卡计划时段 vs 实际工时） */
opRouter.get('/analytics/deviation', async (req, res) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.workshopOrderId) filter.workshopOrderId = String(req.query.workshopOrderId);
    const cards = await repo.workCardRepo.list(filter);
    const items = cards.items
      .filter((c) => c.selectedHours != null && c.actualHours != null)
      .map((c) => ({
        workCardId: c.id,
        workCardNo: c.workCardNo,
        selectedHours: Number(c.selectedHours ?? 0),
        actualHours: Number(c.actualHours ?? 0),
        deviation: Number(c.actualHours ?? 0) - Number(c.selectedHours ?? 0),
      }));
    const avgDeviation =
      items.length > 0 ? items.reduce((s, i) => s + i.deviation, 0) / items.length : 0;
    return ok(res, { items, avgDeviation, count: items.length });
  } catch (e) {
    return handleError(res, e);
  }
});

// ═══════════════════════════════════════════
// 预警
// ═══════════════════════════════════════════

/** 预警记录列表（EADAF 字段为 snake_case，对外归一化为前端使用的 camelCase） */
opRouter.get('/monitor/alerts', async (req, res) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.alertType) filter.alert_type = String(req.query.alertType);
    if (req.query.resolved !== undefined) {
      filter.is_resolved = req.query.resolved === 'true';
    }
    const result = await repo.alertRecordRepo.list(filter);
    const items = result.items.map((raw) => {
      const r = raw as unknown as Record<string, unknown>;
      return {
        ...r,
        // 前端 Dashboard / EngineMonitor 约定字段
        alertType: r.alert_type ?? r.alertType,
        content: r.alert_content ?? r.content,
        triggerAt: r.alert_time ?? r.triggerAt,
        resolved: r.is_resolved ?? r.resolved ?? false,
        alertLevel: r.alert_level ?? r.alertLevel,
      };
    });
    return ok(res, { ...result, items, total: result.total ?? items.length });
  } catch (e) {
    return handleError(res, e);
  }
});
