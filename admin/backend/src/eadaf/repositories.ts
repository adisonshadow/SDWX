/**
 * Repositories — 领域概念到 EADAF routePath 的适配层
 */
import { eadafClient, type FindParams, type FindResult } from './EADAFClient.js';
import { EADAF_ROUTES } from '@fmms/shared';
import type {
  WorkCard,
  Workstation,
  WorkCardPart,
  InspectionItem,
  InspectionRecord,
  MeasuringTool,
  LineStock,
  LineStockItem,
  WbsNode,
  OutsourceOrder,
  ScrapRecord,
  InventoryTransaction,
  NotificationLog,
  TrayTemplate,
  TraySlot,
  Bop,
  WorkStep,
  AgvTask,
  InspectionResultData,
  InspectionResultItem,
} from '@fmms/shared';

const R = EADAF_ROUTES;

/**
 * 按 id 取单条记录。
 *
 * EADAF Find 的服务端过滤不支持 `id` 字段（实测 ?id=xxx 被忽略，返回全部），
 * 故先拉一页再在本地精确匹配 id；匹配不到回退按业务 code 字段匹配。
 */
async function findItemById<T extends { id?: string; code?: string }>(
  routePath: string,
  id: string,
  codeField?: keyof T,
): Promise<T | null> {
  const res = await eadafClient.find<T>(routePath, { limit: 100 });
  const byId = res.items.find((it) => it.id === id);
  if (byId) return byId;
  if (codeField) {
    const byCode = res.items.find((it) => (it[codeField] as unknown) === id);
    if (byCode) return byCode;
  }
  return null;
}

// ============ 工位 ============
export const workstationRepo = {
  list: (params?: { type?: string }) =>
    params?.type
      ? eadafClient.findFiltered<Workstation>(R.workstation, { station_type: params.type })
      : eadafClient.find<Workstation>(R.workstation),
  getByCode: async (code: string) => {
    const res = await eadafClient.findFiltered<Workstation>(R.workstation, { station_code: code });
    return res.items[0] ?? null;
  },
  getById: async (id: string) => {
    const res = await eadafClient.findFiltered<Workstation>(R.workstation, { id }, { limit: 1 });
    return res.items[0] ?? null;
  },
  create: (body: Partial<Workstation> & { station_code: string; station_name: string; station_type: string }) =>
    eadafClient.create<Workstation>(R.workstation, body as Record<string, unknown>),
};

// ============ 工卡 ============
export const workCardRepo = {
  list: (params?: { stationType?: string; status?: string }) => {
    const filter: Record<string, unknown> = {};
    if (params?.stationType) filter.station_type = params.stationType;
    if (params?.status) filter.status = params.status;
    return Object.keys(filter).length > 0
      ? eadafClient.findFiltered<WorkCard>(R.workCard, filter, { limit: 100 })
      : eadafClient.find<WorkCard>(R.workCard, { limit: 100 });
  },
  get: async (id: string) => findItemById<WorkCard>(R.workCard, id, 'card_code'),
  update: (id: string, body: Partial<WorkCard>) =>
    eadafClient.update(R.workCard, id, body as Record<string, unknown>),
};

// ============ WBS 节点 ============
export const wbsNodeRepo = {
  getByCode: async (wbsCode: string) => {
    const res = await eadafClient.findFiltered<WbsNode>(R.wbsNode, { wbs_code: wbsCode });
    return res.items[0] ?? null;
  },
  get: async (id: string) => findItemById<WbsNode>(R.wbsNode, id, 'wbs_code'),
};

// ============ 零部件 ============
export const workCardPartRepo = {
  listByCard: (cardId: string) =>
    eadafClient.findFiltered<WorkCardPart>(R.workCardPart, { work_card_id: cardId }, { limit: 200 }),
  update: (id: string, body: Partial<WorkCardPart>) =>
    eadafClient.update(R.workCardPart, id, body as Record<string, unknown>),
  create: (body: Partial<WorkCardPart> & { work_card_id: string; part_code: string; part_name: string }) =>
    eadafClient.create<WorkCardPart>(R.workCardPart, body as Record<string, unknown>),
};

// ============ 检测项（fmms/quality/InspectionItem，关联 work_step / part，不按 WBS）============
export const inspectionItemRepo = {
  listByWorkStep: (workStepId: string) =>
    eadafClient.findFiltered<InspectionItem>(R.inspectionItem, { work_step_id: workStepId }, { limit: 100 }),
  listByPartCode: (partCode: string) =>
    eadafClient.findFiltered<InspectionItem>(R.inspectionItem, { part_code: partCode }, { limit: 100 }),
  listAll: (params?: FindParams) => eadafClient.find<InspectionItem>(R.inspectionItem, params),
  getByCode: async (itemCode: string) => {
    const res = await eadafClient.findFiltered<InspectionItem>(R.inspectionItem, { item_code: itemCode }, { limit: 1 });
    return res.items[0] ?? null;
  },
  /**
   * 按工卡汇总检测项：工卡工步 → InspectionItem.work_step_id，
   * 并合并工卡零件 part_code 命中的检测项。
   */
  listByWorkCard: async (workCardId: string): Promise<FindResult<InspectionItem>> => {
    const card = await workCardRepo.get(workCardId);
    if (!card) return { items: [], total: 0 };

    const byKey = new Map<string, InspectionItem>();
    const put = (item: InspectionItem) => {
      const key = item.id ?? item.item_code;
      if (key) byKey.set(key, item);
    };

    // 工步仍挂在工卡的 WBS 下，但检测项本身只认 work_step_id（不按 wbs 查 InspectionItem）
    if (card.wbs_node_id) {
      const steps = await eadafClient
        .findFiltered<WorkStep>(R.workStep, { wbs_node_id: card.wbs_node_id }, { limit: 100 })
        .catch(() => ({ items: [] as WorkStep[] }));
      for (const step of steps.items) {
        if (!step.id) continue;
        const res = await inspectionItemRepo.listByWorkStep(step.id).catch(() => ({ items: [] as InspectionItem[] }));
        res.items.forEach(put);
      }
    }

    const parts = await workCardPartRepo.listByCard(workCardId).catch(() => ({ items: [] as { part_code?: string }[] }));
    for (const part of parts.items) {
      if (!part.part_code) continue;
      const res = await inspectionItemRepo.listByPartCode(part.part_code).catch(() => ({ items: [] as InspectionItem[] }));
      res.items.forEach(put);
    }

    const items = [...byKey.values()].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return { items, total: items.length };
  },
};

// ============ 检测记录 ============
export const inspectionRecordRepo = {
  listByWorkCard: (workCardId: string) =>
    eadafClient.findFiltered<InspectionRecord>(R.inspectionRecord, { work_card_id: workCardId }, { limit: 100 }),
  create: (body: Partial<InspectionRecord>) =>
    eadafClient.create<InspectionRecord>(R.inspectionRecord, body as Record<string, unknown>),
  update: (id: string, body: Partial<InspectionRecord>) =>
    eadafClient.update(R.inspectionRecord, id, body as Record<string, unknown>),
};

/** InspectionRecord ↔ InspectionResultData 互转 */
export async function recordsToInspectionResult(
  records: InspectionRecord[],
  items: InspectionItem[],
): Promise<InspectionResultData> {
  const itemById = new Map(items.filter((i) => i.id).map((i) => [i.id!, i]));
  const resultItems: InspectionResultItem[] = records.map((r) => {
    const item = r.inspection_item_id ? itemById.get(r.inspection_item_id) : undefined;
    return {
      item_code: item?.item_code ?? r.measure_tool_code ?? '',
      inspection_item_id: r.inspection_item_id,
      measured_value: r.measured_value,
      result: (r.result ?? 'pending') as InspectionResultItem['result'],
      photo_object_ids: r.photo_object_id ? [r.photo_object_id] : undefined,
      collected_at: r.inspect_time,
      collected_by: r.is_manual ? 'manual' : 'auto',
    };
  });
  return {
    items: resultItems,
    summary: {
      total: resultItems.length,
      qualified: resultItems.filter((r) => r.result === 'qualified').length,
      unqualified: resultItems.filter((r) => r.result === 'unqualified').length,
      pending: resultItems.filter((r) => r.result === 'pending').length,
    },
  };
}

export async function saveInspectionResultData(
  workCardId: string,
  data: InspectionResultData,
  operator?: { id?: string; name?: string },
): Promise<void> {
  const existing = await inspectionRecordRepo.listByWorkCard(workCardId);
  const existingByItemId = new Map(
    existing.items.filter((r) => r.inspection_item_id).map((r) => [r.inspection_item_id!, r]),
  );

  for (const item of data.items) {
    let inspectionItemId = item.inspection_item_id;
    if (!inspectionItemId && item.item_code) {
      const found = await inspectionItemRepo.getByCode(item.item_code);
      inspectionItemId = found?.id;
    }
    const inspItem = inspectionItemId
      ? (await inspectionItemRepo.listAll({ filter: { id: inspectionItemId }, limit: 1 })).items[0]
      : item.item_code
        ? await inspectionItemRepo.getByCode(item.item_code)
        : null;

    const body: Partial<InspectionRecord> = {
      work_card_id: workCardId,
      inspection_item_id: inspectionItemId ?? inspItem?.id,
      measure_tool_code: inspItem?.measure_tool_code,
      result: item.result,
      measured_value: item.measured_value,
      nominal_value: inspItem?.nominal_value,
      upper_tolerance: inspItem?.upper_tolerance,
      lower_tolerance: inspItem?.lower_tolerance,
      unit: inspItem?.unit,
      is_manual: item.collected_by === 'manual',
      operator_id: operator?.id,
      operator_name: operator?.name,
      inspect_time: item.collected_at ?? new Date().toISOString(),
      photo_object_id: item.photo_object_ids?.[0],
    };

    const prev = inspectionItemId ? existingByItemId.get(inspectionItemId) : undefined;
    if (prev?.id) {
      await inspectionRecordRepo.update(prev.id, body);
    } else {
      await inspectionRecordRepo.create(body);
    }
  }
}

// ============ 测量工具 ============
export const measuringToolRepo = {
  list: (params?: { workstationId?: string }) =>
    params?.workstationId
      ? eadafClient.findFiltered<MeasuringTool>(R.measuringTool, { workstation_id: params.workstationId })
      : eadafClient.find<MeasuringTool>(R.measuringTool),
  getByCode: async (code: string) => {
    const res = await eadafClient.findFiltered<MeasuringTool>(R.measuringTool, { tool_code: code });
    return res.items[0] ?? null;
  },
  create: (body: Partial<MeasuringTool> & { tool_code: string; tool_name: string }) =>
    eadafClient.create<MeasuringTool>(R.measuringTool, body as Record<string, unknown>),
};

// ============ 线边库 ============
export const lineStockRepo = {
  list: (params?: FindParams) => eadafClient.find<LineStock>(R.lineStock, params),
};

export const lineStockItemRepo = {
  listByStock: (stockId: string) =>
    eadafClient.findFiltered<LineStockItem>(R.lineStockItem, { stock_id: stockId }, { limit: 200 }),
  create: (body: Partial<LineStockItem> & { stock_id: string; part_code: string; quantity: number }) =>
    eadafClient.create<LineStockItem>(R.lineStockItem, {
      min_quantity: 0,
      max_quantity: 9999,
      ...body,
    } as Record<string, unknown>),
};

// ============ 委外单 ============
export const outsourceRepo = {
  list: (params?: { workCardId?: string } & FindParams) => {
    const filter = params?.workCardId ? { workCardId: params.workCardId } : undefined;
    return filter
      ? eadafClient.findFiltered<OutsourceOrder>(R.outsourceOrder, filter, { limit: params?.limit ?? 100 })
      : eadafClient.find<OutsourceOrder>(R.outsourceOrder, params);
  },
  create: (body: Partial<OutsourceOrder> & { order_no: string; part_code: string; quantity: number; outsource_status: string }) =>
    eadafClient.create<OutsourceOrder>(R.outsourceOrder, body as Record<string, unknown>),
  update: (id: string, body: Partial<OutsourceOrder>) =>
    eadafClient.update(R.outsourceOrder, id, body as Record<string, unknown>),
};

// ============ 报废记录 ============
export const scrapRepo = {
  create: (body: Partial<ScrapRecord> & { scrap_no: string; quantity: number; scrap_time: string }) =>
    eadafClient.create<ScrapRecord>(R.scrapRecord, body as Record<string, unknown>),
  list: (params?: { workCardId?: string }) =>
    params?.workCardId
      ? eadafClient.findFiltered<ScrapRecord>(R.scrapRecord, { work_card_id: params.workCardId })
      : eadafClient.find<ScrapRecord>(R.scrapRecord),
};

// ============ 出入库流水 ============
export const inventoryTxRepo = {
  create: (body: Partial<InventoryTransaction> & { transaction_no: string; part_code: string; transaction_type: string; quantity: number; transaction_time: string }) =>
    eadafClient.create<InventoryTransaction>(R.inventoryTransaction, body as Record<string, unknown>),
  list: (params?: { stockId?: string }) =>
    params?.stockId
      ? eadafClient.findFiltered<InventoryTransaction>(R.inventoryTransaction, { stock_id: params.stockId })
      : eadafClient.find<InventoryTransaction>(R.inventoryTransaction),
};

// ============ 呼叫日志 ============
export const notificationRepo = {
  create: (body: Partial<NotificationLog> & { call_type: string; call_time: string; is_responded: boolean }) =>
    eadafClient.create<NotificationLog>(R.notificationLog, body as Record<string, unknown>),
  list: (params?: { workstationId?: string; isResponded?: boolean }) => {
    const filter: Record<string, unknown> = {};
    if (params?.workstationId) filter.workstation_id = params.workstationId;
    if (params?.isResponded != null) filter.is_responded = params.isResponded;
    return Object.keys(filter).length > 0
      ? eadafClient.findFiltered<NotificationLog>(R.notificationLog, filter)
      : eadafClient.find<NotificationLog>(R.notificationLog);
  },
};

// ============ 形迹模版 ============
export const trayTemplateRepo = {
  list: (params?: FindParams) => eadafClient.find<TrayTemplate>(R.trayTemplate, params),
  get: async (id: string) => findItemById<TrayTemplate>(R.trayTemplate, id, 'template_code'),
};

export const traySlotRepo = {
  listByTemplate: (templateId: string) =>
    eadafClient.findFiltered<TraySlot>(R.traySlot, { template_id: templateId }, { limit: 500 }),
  update: (id: string, body: Partial<TraySlot>) =>
    eadafClient.update(R.traySlot, id, body as Record<string, unknown>),
};

// ============ 工步 ============
export const workStepRepo = {
  listByWbs: (wbsNodeId: string) =>
    eadafClient.findFiltered<WorkStep>(R.workStep, { wbs_node_id: wbsNodeId }, { limit: 200 }),
  list: (params?: FindParams) => eadafClient.find<WorkStep>(R.workStep, params),
};

// ============ 修理记录（Bop）============
export const bopRepo = {
  list: (params?: FindParams) => eadafClient.find<Bop>(R.bop, params),
  create: (body: Partial<Bop> & { recordNo: string; repairMethod: string; status: string }) =>
    eadafClient.create<Bop>(R.bop, body as Record<string, unknown>, false),
  update: (id: string, body: Partial<Bop>) =>
    eadafClient.update(R.bop, id, body as Record<string, unknown>),
};

// ============ AGV 转运任务 ============
export const agvTaskRepo = {
  list: (params?: { fromStation?: string; status?: string } & FindParams) => {
    const filter: Record<string, unknown> = {};
    if (params?.fromStation) filter.fromStation = params.fromStation;
    if (params?.status) filter.status = params.status;
    return Object.keys(filter).length > 0
      ? eadafClient.findFiltered<AgvTask>(R.agvTask, filter, { limit: params?.limit ?? 50 })
      : eadafClient.find<AgvTask>(R.agvTask, params);
  },
  create: (body: Partial<AgvTask> & { taskNo: string; fromStation: string; toStation: string; status: string }) =>
    eadafClient.create<AgvTask>(R.agvTask, {
      inboundRequestTime: new Date().toISOString(),
      ...body,
    } as Record<string, unknown>, false),
  update: (id: string, body: Partial<AgvTask>) =>
    eadafClient.update(R.agvTask, id, body as Record<string, unknown>),
};

export type { FindResult };
