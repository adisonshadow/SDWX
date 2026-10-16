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
    const [parts, wbsNode, inspectionRecords, workSteps] = await Promise.all([
      repo.workCardPartRepo.listByCard(id).then((r) => r.items).catch(() => []),
      work_card.wbs_node_id
        ? repo.wbsNodeRepo.get(work_card.wbs_node_id).catch(() => null)
        : Promise.resolve(null),
      repo.inspectionRecordRepo.listByWorkCard(id).then((r) => r.items).catch(() => []),
      work_card.wbs_node_id
        ? repo.workStepRepo.listByWbs(work_card.wbs_node_id).then((r) => r.items).catch(() => [])
        : Promise.resolve([]),
    ]);
    let inspection_result: InspectionResultData | undefined;
    if (inspectionRecords.length > 0) {
      const items = await repo.inspectionItemRepo.listByWorkCard(id).then((r) => r.items).catch(() => []);
      inspection_result = await repo.recordsToInspectionResult(inspectionRecords, items);
    }
    res.json({
      code: 200,
      message: 'success',
      data: { work_card: { ...work_card, inspection_result }, parts, wbs_node: wbsNode, work_steps: workSteps },
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
      status: 'in_progress',
      accept_time: now,
      start_time: now,
      accept_operator_id: operatorId,
      accept_operator_name: operatorName,
    });
    const updated = await repo.workCardRepo.get(id);
    opHub.broadcast({ type: WS_EVENTS.WORKCARD_STATUS_CHANGED, payload: { id, status: 'in_progress', operator: operatorName } });
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

    if (req.body?.inspection_result) {
      const operatorId = req.user?.user_id ?? req.user?.id;
      const operatorName = req.user?.name ?? req.user?.username;
      await repo.saveInspectionResultData(id, req.body.inspection_result as InspectionResultData, {
        id: operatorId,
        name: operatorName,
      });
      const resultData = req.body.inspection_result as InspectionResultData;
      if (resultData.summary) {
        updateBody.qualified_parts = resultData.summary.qualified;
        updateBody.unqualified_parts = resultData.summary.unqualified;
      }
    } else {
      const records = await repo.inspectionRecordRepo.listByWorkCard(id);
      const qualified = records.items.filter((r) => r.result === 'qualified').length;
      const unqualified = records.items.filter((r) => r.result === 'unqualified').length;
      if (records.items.length > 0) {
        updateBody.qualified_parts = qualified;
        updateBody.unqualified_parts = unqualified;
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

/** 保存检测结果（写入 InspectionRecord，并更新工卡合格/不合格计数） */
opRouter.post('/workcards/:id/inspection-result', async (req, res) => {
  try {
    const resultData = req.body as InspectionResultData;
    const operatorId = req.user?.user_id ?? req.user?.id;
    const operatorName = req.user?.name ?? req.user?.username;
    await repo.saveInspectionResultData(req.params.id, resultData, { id: operatorId, name: operatorName });
    await repo.workCardRepo.update(req.params.id, {
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

// ============ 工步 ============
opRouter.get('/work-steps', async (req, res) => {
  try {
    const wbsNodeId = req.query.wbs_node_id as string | undefined;
    const result = wbsNodeId
      ? await repo.workStepRepo.listByWbs(wbsNodeId)
      : await repo.workStepRepo.list({ limit: 200 });
    res.json({ code: 200, message: 'success', data: result });
  } catch (e) {
    handleError(res, e);
  }
});

/**
 * 检测项列表（EADAF fmms/quality/InspectionItem）
 * Query: work_card_id | work_step_id | part_code
 * 优先按工卡汇总（工步 work_step_id + 零件 part_code），与 WBS 无直接关联。
 */
opRouter.get('/inspection-items', async (req, res) => {
  try {
    const workCardId = req.query.work_card_id as string | undefined;
    const workStepId = req.query.work_step_id as string | undefined;
    const partCode = req.query.part_code as string | undefined;
    let result;
    if (workCardId) result = await repo.inspectionItemRepo.listByWorkCard(workCardId);
    else if (workStepId) result = await repo.inspectionItemRepo.listByWorkStep(workStepId);
    else if (partCode) result = await repo.inspectionItemRepo.listByPartCode(partCode);
    else result = await repo.inspectionItemRepo.listAll({ limit: 100 });
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
    const { call_type, description, station_code } = req.body as {
      call_type: CallType;
      description?: string;
      station_code?: string;
    };
    const callerId = req.user?.user_id ?? req.user?.id ?? 'unknown';
    const callerName = req.user?.name ?? req.user?.username ?? '';
    let workstationId: string | undefined;
    if (station_code) {
      const ws = await repo.workstationRepo.getByCode(station_code);
      workstationId = ws?.id;
    }
    const now = new Date().toISOString();
    const log = await repo.notificationRepo.create({
      workstation_id: workstationId,
      caller_id: callerId,
      caller_name: callerName,
      call_type,
      call_content: description,
      call_time: now,
      is_responded: false,
    });
    opHub.broadcast({ type: WS_EVENTS.CALL_RECEIVED, payload: log }, station_code);
    res.json({ code: 200, message: 'success', data: log });
  } catch (e) {
    handleError(res, e);
  }
});

opRouter.get('/calls', async (req, res) => {
  try {
    const stationCode = req.query.station_code as string | undefined;
    let workstationId: string | undefined;
    if (stationCode) {
      const ws = await repo.workstationRepo.getByCode(stationCode);
      workstationId = ws?.id;
    }
    const isResponded = req.query.status === 'resolved' ? true : req.query.status === 'pending' ? false : undefined;
    const result = await repo.notificationRepo.list({ workstationId, isResponded });
    res.json({ code: 200, message: 'success', data: result });
  } catch (e) {
    handleError(res, e);
  }
});

// ============ 修理（委外/报废）============
opRouter.post('/outsource', async (req, res) => {
  try {
    const { source_card_id, outsource_party, outsource_company, part_codes, part_code, part_name, quantity } = req.body as {
      source_card_id?: string;
      outsource_party?: string;
      outsource_company?: string;
      part_codes?: string[];
      part_code?: string;
      part_name?: string;
      quantity?: number;
    };
    const company = outsource_company ?? outsource_party ?? '';
    const operatorId = req.user?.user_id ?? req.user?.id;
    const operatorName = req.user?.name ?? req.user?.username;
    const codes = part_codes?.length ? part_codes : part_code ? [part_code] : ['UNKNOWN'];
    const orders = await Promise.all(
      codes.map((code, idx) => {
        const order_no = `WW-${Date.now()}-${idx}`;
        return repo.outsourceRepo.create({
          order_no,
          workCardId: source_card_id,
          outsource_company: company,
          part_code: code,
          part_name: part_name ?? code,
          quantity: quantity ?? 1,
          outsource_status: 'pending',
          operator_id: operatorId,
          operator_name: operatorName,
          send_date: source_card_id ? new Date().toISOString() : undefined,
        });
      }),
    );
    res.json({ code: 200, message: 'success', data: orders.length === 1 ? orders[0] : orders });
  } catch (e) {
    handleError(res, e);
  }
});

opRouter.get('/outsource', async (req, res) => {
  try {
    const result = await repo.outsourceRepo.list({
      workCardId: req.query.card_id as string | undefined,
      limit: 100,
    });
    res.json({ code: 200, message: 'success', data: result });
  } catch (e) {
    handleError(res, e);
  }
});

/** 修理记录（写入 EADAF Bop 实体） */
opRouter.post('/disposal/repair', async (req, res) => {
  try {
    const { method, equipment, process, conclusion, defect_description, work_card_id, part_id } = req.body as {
      method?: string;
      equipment?: string;
      process?: string;
      conclusion?: string;
      defect_description?: string;
      work_card_id?: string;
      part_id?: string;
    };
    if (!method) return res.status(400).json({ code: 400, message: '缺少修理方法', data: null });
    const operatorName = req.user?.name ?? req.user?.username ?? '';
    const record = await repo.bopRepo.create({
      recordNo: `BOP-${Date.now()}`,
      repairMethod: method,
      equipmentTooling: equipment,
      process,
      conclusion,
      defectDescription: defect_description,
      repairDate: new Date().toISOString(),
      responsiblePerson: operatorName,
      status: 'completed',
      remark: [work_card_id && `work_card_id=${work_card_id}`, part_id && `part_id=${part_id}`].filter(Boolean).join('; ') || undefined,
    });
    res.json({ code: 200, message: 'success', data: record });
  } catch (e) {
    handleError(res, e);
  }
});

opRouter.post('/scrap', async (req, res) => {
  try {
    const { card_id, work_card_id, items } = req.body as {
      card_id?: string;
      work_card_id?: string;
      items: Array<{ part_code?: string; part_name?: string; part_id?: string; quantity: number; scrap_type?: string; scrap_category?: string; reason?: string; scrap_reason?: string }>;
    };
    const wcId = work_card_id ?? card_id;
    const operatorId = req.user?.user_id ?? req.user?.id;
    const operatorName = req.user?.name ?? req.user?.username;
    const now = new Date().toISOString();
    const records = await Promise.all(
      items.map((it, idx) =>
        repo.scrapRepo.create({
          scrap_no: `BF-${Date.now()}-${idx}`,
          work_card_id: wcId,
          part_id: it.part_id,
          part_code: it.part_code,
          part_name: it.part_name,
          quantity: it.quantity,
          scrap_category: it.scrap_category ?? it.scrap_type,
          scrap_reason: it.scrap_reason ?? it.reason,
          scrap_time: now,
          operator_id: operatorId,
          operator_name: operatorName,
        }),
      ),
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
    const { material_code, part_code, part_name, unit, stock_type, card_id, related_barcode, ...rest } = req.body as Record<string, unknown>;
    const operatorId = req.user?.user_id ?? req.user?.id;
    const operatorName = req.user?.name ?? req.user?.username;
    const tx = await repo.inventoryTxRepo.create({
      ...rest,
      transaction_no: `TX-${Date.now()}`,
      part_code: (part_code ?? material_code) as string,
      part_name: part_name as string | undefined,
      operator_id: operatorId,
      operator_name: operatorName,
      transaction_time: (rest.transaction_time as string) ?? new Date().toISOString(),
      remark: [related_barcode, card_id, stock_type, unit].filter(Boolean).join(' | ') || undefined,
    } as Parameters<typeof repo.inventoryTxRepo.create>[0]);
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
    const template = await repo.trayTemplateRepo.get(req.params.id);
    if (!template) return res.status(404).json({ code: 404, message: '模版不存在', data: null });
    const slots = await repo.traySlotRepo.listByTemplate(req.params.id);
    res.json({ code: 200, message: 'success', data: { template, slots: slots.items } });
  } catch (e) {
    handleError(res, e);
  }
});

opRouter.patch('/tray-slots/:slotId', async (req, res) => {
  try {
    const { required, slot_status, slotStatus, filled } = req.body as {
      required?: boolean;
      slot_status?: string;
      slotStatus?: string;
      filled?: boolean;
    };
    const body: Record<string, unknown> = {};
    if (required != null) body.required = required;
    const status = slotStatus ?? slot_status ?? (filled != null ? (filled ? 'filled' : 'empty') : undefined);
    if (status != null) body.slotStatus = status;
    await repo.traySlotRepo.update(req.params.slotId, body);
    res.json({ code: 200, message: 'success', data: { id: req.params.slotId, ...body } });
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

// AGV 转运（写入 EADAF AgvTask）
opRouter.post('/agv', async (req, res) => {
  try {
    const { action, from_station, to_station, card_id, carrier_info } = req.body as {
      action: 'in' | 'out';
      from_station?: string;
      to_station?: string;
      card_id?: string;
      carrier_info?: string;
    };
    if (!from_station) return res.status(400).json({ code: 400, message: '缺少起始工位 from_station', data: null });
    const now = new Date().toISOString();
    const task = await repo.agvTaskRepo.create({
      taskNo: `AGV-${Date.now()}`,
      fromStation: from_station,
      toStation: to_station ?? from_station,
      inboundRequestTime: now,
      outboundRequestTime: action === 'out' ? now : undefined,
      carrierInfo: carrier_info ?? (card_id ? `work_card:${card_id}` : undefined),
      status: 'pending',
    });
    opHub.broadcast({ type: WS_EVENTS.AGV_STATUS, payload: task });
    res.json({ code: 200, message: 'success', data: task });
  } catch (e) {
    handleError(res, e);
  }
});

opRouter.get('/agv', async (req, res) => {
  try {
    const result = await repo.agvTaskRepo.list({
      fromStation: req.query.from_station as string | undefined,
      status: req.query.status as string | undefined,
      limit: 50,
    });
    res.json({ code: 200, message: 'success', data: result });
  } catch (e) {
    handleError(res, e);
  }
});
