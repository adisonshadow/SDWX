/**
 * 工位作业 REST 路由 (/api/op/*)
 *
 * 所有路由经 authenticate 中间件保护。
 * 数据存取经 repositories → EADAFClient → EADAF（routePath 格式 fmms/{scope}/{Entity}）。
 * PCS 上报已移除 — 由 EADAF Hook 监听数据变更触发，见 docs/PCS上报触发说明.md
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { opHub } from '../ws/opHub.js';
import * as repo from '../eadaf/repositories.js';
import { eadafClient, EadafError } from '../eadaf/EADAFClient.js';
import {
  WS_EVENTS,
  INGEST_ROUTE,
  type CollectFrame,
  type PartStatus,
  type CallType,
  type InspectionResultData,
} from '@fmms/shared';

export const opRouter = Router();
opRouter.use(authenticate);

function handleError(res: import('express').Response, e: unknown): void {
  if (e instanceof EadafError) {
    res.status(e.httpStatus === 200 ? 500 : e.httpStatus).json({ code: e.code ?? e.httpStatus, message: e.message, data: null });
  } else {
    res.status(500).json({ code: 500, message: (e as Error).message ?? '服务器错误', data: null });
  }
}

// ============ 工位 ============
opRouter.get('/workstations', async (req, res) => {
  try {
    const result = await repo.workstationRepo.list({ type: req.query.type as string | undefined });
    res.json({ code: 200, message: 'success', data: result });
  } catch (e) {
    handleError(res, e);
  }
});

opRouter.get('/workstations/:code', async (req, res) => {
  try {
    const ws = await repo.workstationRepo.getByCode(req.params.code);
    if (!ws) return res.status(404).json({ code: 404, message: '工位不存在', data: null });
    res.json({ code: 200, message: 'success', data: ws });
  } catch (e) {
    handleError(res, e);
  }
});

// ============ 工卡 ============
opRouter.get('/workcards', async (req, res) => {
  try {
    const result = await repo.workCardRepo.list({
      stationType: req.query.station_type as string | undefined,
      status: req.query.status as string | undefined,
    });
    res.json({ code: 200, message: 'success', data: result });
  } catch (e) {
    handleError(res, e);
  }
});

opRouter.get('/workcards/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const work_card = await repo.workCardRepo.get(id);
    if (!work_card) return res.status(404).json({ code: 404, message: '工卡不存在', data: null });
    // 并行加载关联数据
    const [parts, wbsNode] = await Promise.all([
      repo.workCardPartRepo.listByCard(id).then((r) => r.items).catch(() => []),
      work_card.wbs_node_id
        ? repo.wbsNodeRepo.get(work_card.wbs_node_id).catch(() => null)
        : Promise.resolve(null),
    ]);
    res.json({
      code: 200,
      message: 'success',
      data: { work_card, parts, wbs_node: wbsNode },
    });
  } catch (e) {
    handleError(res, e);
  }
});

/** 接受工卡 */
opRouter.post('/workcards/:id/accept', async (req, res) => {
  try {
    const id = req.params.id;
    const now = new Date().toISOString();
    const operatorId = req.user?.user_id ?? req.user?.id ?? 'unknown';
    const operatorName = req.user?.name ?? req.user?.username ?? '';
    await repo.workCardRepo.update(id, {
      status: 'processing',
      accept_time: now,
      start_time: now,
      accept_operator_id: operatorId,
      accept_operator_name: operatorName,
    });
    const updated = await repo.workCardRepo.get(id);
    opHub.broadcast({ type: WS_EVENTS.WORKCARD_STATUS_CHANGED, payload: { id, status: 'processing', operator: operatorName } });
    res.json({ code: 200, message: 'success', data: updated });
  } catch (e) {
    handleError(res, e);
  }
});

/** 更新进度 */
opRouter.patch('/workcards/:id/progress', async (req, res) => {
  try {
    const progress = Number(req.body.progress);
    if (Number.isNaN(progress)) return res.status(400).json({ code: 400, message: 'progress 须为数字', data: null });
    await repo.workCardRepo.update(req.params.id, { progress });
    opHub.broadcast({ type: WS_EVENTS.WORKCARD_PROGRESS, payload: { id: req.params.id, progress } });
    res.json({ code: 200, message: 'success', data: { progress } });
  } catch (e) {
    handleError(res, e);
  }
});

/**
 * 提交工卡执行结果
 * PCS 上报由 EADAF Hook 监听此 update(status→completed) 触发，BFF 不直接上报 PCS
 */
opRouter.post('/workcards/:id/submit', async (req, res) => {
  try {
    const id = req.params.id;
    const now = new Date().toISOString();
    const updateBody: Record<string, unknown> = {
      status: 'completed',
      complete_time: now,
      progress: 100,
    };
    // 如有检测结果摘要，更新合格/不合格计数
    if (req.body?.inspection_result) {
      const resultData = req.body.inspection_result as InspectionResultData;
      updateBody.inspection_result = resultData;
      if (resultData.summary) {
        updateBody.qualified_parts = resultData.summary.qualified;
        updateBody.unqualified_parts = resultData.summary.unqualified;
      }
    }
    await repo.workCardRepo.update(id, updateBody);
    const updated = await repo.workCardRepo.get(id);
    opHub.broadcast({ type: WS_EVENTS.WORKCARD_STATUS_CHANGED, payload: { id, status: 'completed' } });
    res.json({ code: 200, message: 'success', data: updated });
  } catch (e) {
    handleError(res, e);
  }
});

/** 保存检测结果（不提交，仅存 WorkCard.inspection_result） */
opRouter.post('/workcards/:id/inspection-result', async (req, res) => {
  try {
    const resultData = req.body as InspectionResultData;
    await repo.workCardRepo.update(req.params.id, {
      inspection_result: resultData,
      qualified_parts: resultData.summary?.qualified,
      unqualified_parts: resultData.summary?.unqualified,
    });
    res.json({ code: 200, message: 'success', data: { saved: true } });
  } catch (e) {
    handleError(res, e);
  }
});

// ============ 零部件 ============
opRouter.get('/workcards/:id/parts', async (req, res) => {
  try {
    const result = await repo.workCardPartRepo.listByCard(req.params.id);
    res.json({ code: 200, message: 'success', data: result });
  } catch (e) {
    handleError(res, e);
  }
});

opRouter.patch('/parts/:partId', async (req, res) => {
  try {
    const body = req.body as { status?: PartStatus; disposal_result?: import('@fmms/shared').DisposalResult };
    await repo.workCardPartRepo.update(req.params.partId, body);
    opHub.broadcast({
      type: WS_EVENTS.PART_STATUS_CHANGED,
      payload: { id: req.params.partId, ...body },
    });
    res.json({ code: 200, message: 'success', data: { id: req.params.partId, ...body } });
  } catch (e) {
    handleError(res, e);
  }
});

// ============ 检测项 ============
opRouter.get('/inspection-items', async (req, res) => {
  try {
    const wbsNodeId = req.query.wbs_node_id as string | undefined;
    const partCode = req.query.part_code as string | undefined;
    let result;
    if (wbsNodeId) result = await repo.inspectionItemRepo.listByWbs(wbsNodeId);
    else if (partCode) result = await repo.inspectionItemRepo.listByPartCode(partCode);
    else result = await repo.inspectionItemRepo.listAll({ limit: 200 });
    res.json({ code: 200, message: 'success', data: result });
  } catch (e) {
    handleError(res, e);
  }
});

// ============ 测量工具 ============
opRouter.get('/tools', async (req, res) => {
  try {
    const result = await repo.measuringToolRepo.list({
      workstationId: req.query.workstation_id as string | undefined,
    });
    res.json({ code: 200, message: 'success', data: result });
  } catch (e) {
    handleError(res, e);
  }
});

opRouter.post('/tools', async (req, res) => {
  try {
    const tool = await repo.measuringToolRepo.create(req.body);
    res.json({ code: 200, message: 'success', data: tool });
  } catch (e) {
    handleError(res, e);
  }
});

// ============ 异常呼叫 ============
opRouter.post('/call', async (req, res) => {
  try {
    const { call_type, callee_type, description, station_code } = req.body as {
      call_type: CallType;
      callee_type?: string;
      description?: string;
      station_code?: string;
    };
    const callerId = req.user?.user_id ?? req.user?.id ?? 'unknown';
    const log = await repo.notificationRepo.create({
      station_code: station_code ?? '',
      caller_id: callerId,
      call_type,
      callee_type: callee_type as 'engineer' | 'manager' | undefined,
      description,
      status: 'pending',
    });
    opHub.broadcast({ type: WS_EVENTS.CALL_RECEIVED, payload: log }, station_code);
    res.json({ code: 200, message: 'success', data: log });
  } catch (e) {
    handleError(res, e);
  }
});

opRouter.get('/calls', async (req, res) => {
  try {
    const result = await repo.notificationRepo.list({
      stationCode: req.query.station_code as string | undefined,
      status: req.query.status as string | undefined,
    });
    res.json({ code: 200, message: 'success', data: result });
  } catch (e) {
    handleError(res, e);
  }
});

// ============ 修理（委外/报废）============
opRouter.post('/outsource', async (req, res) => {
  try {
    const { source_card_id, outsource_party, part_codes } = req.body;
    const order_no = `WW-${Date.now()}`;
    const order = await repo.outsourceRepo.create({
      order_no,
      source_card_id,
      outsource_party,
      part_codes,
      status: 'pending',
      operator: req.user?.name ?? req.user?.username,
    });
    res.json({ code: 200, message: 'success', data: order });
  } catch (e) {
    handleError(res, e);
  }
});

opRouter.get('/outsource', async (req, res) => {
  try {
    const result = await repo.outsourceRepo.list({ cardId: req.query.card_id as string | undefined });
    res.json({ code: 200, message: 'success', data: result });
  } catch (e) {
    handleError(res, e);
  }
});

opRouter.post('/scrap', async (req, res) => {
  try {
    const { card_id, items } = req.body as {
      card_id?: string;
      items: Array<{ part_code?: string; part_name?: string; quantity: number; scrap_type?: string; reason?: string }>;
    };
    const operator = req.user?.name ?? req.user?.username;
    const records = await Promise.all(
      items.map((it) => repo.scrapRepo.create({ card_id, ...it, operator })),
    );
    res.json({ code: 200, message: 'success', data: records });
  } catch (e) {
    handleError(res, e);
  }
});

// ============ 收发（线边库/出入库）============
opRouter.get('/inventory', async (_req, res) => {
  try {
    const result = await repo.lineStockRepo.list();
    res.json({ code: 200, message: 'success', data: result });
  } catch (e) {
    handleError(res, e);
  }
});

opRouter.post('/inventory/transaction', async (req, res) => {
  try {
    const tx = await repo.inventoryTxRepo.create({
      ...req.body,
      operator: req.user?.name ?? req.user?.username,
      transaction_time: req.body.transaction_time ?? new Date().toISOString(),
    });
    res.json({ code: 200, message: 'success', data: tx });
  } catch (e) {
    handleError(res, e);
  }
});

// ============ 形迹模版（分拣）============
opRouter.get('/tray-templates', async (_req, res) => {
  try {
    const result = await repo.trayTemplateRepo.list();
    res.json({ code: 200, message: 'success', data: result });
  } catch (e) {
    handleError(res, e);
  }
});

opRouter.get('/tray-templates/:id', async (req, res) => {
  try {
    const result = await repo.trayTemplateRepo.list({ filter: { id: req.params.id } });
    const template = result.items[0];
    if (!template) return res.status(404).json({ code: 404, message: '模版不存在', data: null });
    const slots = await repo.traySlotRepo.listByTemplate(req.params.id);
    res.json({ code: 200, message: 'success', data: { template, slots: slots.items } });
  } catch (e) {
    handleError(res, e);
  }
});

opRouter.patch('/tray-slots/:slotId', async (req, res) => {
  try {
    const { filled } = req.body;
    await repo.traySlotRepo.update(req.params.slotId, { filled });
    res.json({ code: 200, message: 'success', data: { id: req.params.slotId, filled } });
  } catch (e) {
    handleError(res, e);
  }
});

// ============ 采集转发（Electron → EADAF ingest）============
opRouter.post('/ingest', async (req, res) => {
  try {
    const frame = req.body as CollectFrame;
    if (!frame.raw) return res.status(400).json({ code: 400, message: '缺少 raw 数据', data: null });
    const rawBytes = Buffer.from(frame.raw, 'base64');
    if (rawBytes.length > 1024 * 1024) {
      return res.status(413).json({ code: 413, message: '采集数据超过 1MB 限制', data: null });
    }
    await eadafClient.ingest(INGEST_ROUTE, new Uint8Array(rawBytes));
    opHub.broadcast(
      { type: WS_EVENTS.COLLECT_FRAME, payload: { tool_code: frame.tool_code, item_code: frame.item_code, raw: frame.raw, ts: frame.ts } },
      frame.station_code,
    );
    res.json({ code: 200, message: 'success', data: { processed: 1 } });
  } catch (e) {
    handleError(res, e);
  }
});

// ============ 文件存储（代理 EADAF storage）============
opRouter.post('/storage/upload', async (req, res) => {
  try {
    const { filename, data, bucketId } = req.body as { filename: string; data: string; bucketId?: string };
    if (!data) return res.status(400).json({ code: 400, message: '缺少文件数据', data: null });
    const buf = Buffer.from(data, 'base64');
    const objectId = await eadafClient.uploadObject(buf, filename, bucketId);
    res.json({ code: 200, message: 'success', data: { object_id: objectId } });
  } catch (e) {
    handleError(res, e);
  }
});

opRouter.get('/storage/:objectId/download', async (req, res) => {
  try {
    const resp = await eadafClient.downloadObject(req.params.objectId);
    const contentType = resp.headers.get('content-type') ?? 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    const buf = Buffer.from(await resp.arrayBuffer());
    res.send(buf);
  } catch (e) {
    handleError(res, e);
  }
});

opRouter.get('/storage/:objectId/preview', async (req, res) => {
  try {
    const resp = await eadafClient.previewObject(req.params.objectId);
    const contentType = resp.headers.get('content-type') ?? 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    const buf = Buffer.from(await resp.arrayBuffer());
    res.send(buf);
  } catch (e) {
    handleError(res, e);
  }
});

// AGV（Mock 占位，不上报 PCS）
opRouter.post('/agv', async (req, res) => {
  res.json({ code: 200, message: 'success', data: { task_id: `AGV-${Date.now()}`, status: 'pending', mock: true, ...req.body } });
});
