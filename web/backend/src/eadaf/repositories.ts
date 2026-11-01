/**
 * Repositories — 工位页面字段与 IPS 实体之间的适配层。
 * 页面仍用原来的字段名；写入 EADAF 前换成 IPS 的 camelCase。
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
import {
  type Row,
  mapAgv,
  mapCall,
  mapInspectionItem,
  mapInspectionRecord,
  mapOutsource,
  mapPart,
  mapScrap,
  mapSlot,
  mapStock,
  mapStockItem,
  mapTool,
  mapTray,
  mapWbs,
  mapWorkCard,
  mapWorkstation,
  mapTx,
  toAgv,
  toCall,
  toInspectionRecord,
  toOutsource,
  toPart,
  toScrap,
  toSlot,
  toStockItem,
  toTool,
  toTx,
  toWbs,
  toWorkCard,
  toWorkstation,
} from './ipsMap.js';

const R = EADAF_ROUTES;

async function mappedFind<T>(
  routePath: string,
  map: (row: Row) => T,
  params?: FindParams,
): Promise<FindResult<T>> {
  const res = await eadafClient.find<Row>(routePath, params);
  return { ...res, items: res.items.map(map) };
}

async function mappedFiltered<T>(
  routePath: string,
  filter: Row,
  map: (row: Row) => T,
  params: Omit<FindParams, 'filter'> = {},
): Promise<FindResult<T>> {
  return mappedFind(routePath, map, { ...params, filter, limit: params.limit ?? 100 });
}

async function findMappedById<T extends { id?: string }>(
  routePath: string,
  id: string,
  map: (row: Row) => T,
  codeOf?: (item: T) => string | undefined,
): Promise<T | null> {
  for (let skip = 0; skip < 500; skip += 100) {
    const res = await eadafClient.find<Row>(routePath, { limit: 100, skip });
    for (const row of res.items) {
      const item = map(row);
      if (item.id === id || (codeOf && codeOf(item) === id)) return item;
    }
    if (res.items.length < 100) break;
  }
  return null;
}

// ============ 工位 ============
export const workstationRepo = {
  list: (params?: { type?: string }) =>
    params?.type
      ? mappedFiltered<Workstation>(R.workstation, { stationType: params.type }, mapWorkstation)
      : mappedFind<Workstation>(R.workstation, mapWorkstation),
  getByCode: async (code: string) => {
    const res = await mappedFiltered<Workstation>(R.workstation, { stationNo: code }, mapWorkstation);
    return res.items[0] ?? null;
  },
  getById: async (id: string) => findMappedById(R.workstation, id, mapWorkstation, (item) => item.station_code),
  create: (body: Partial<Workstation> & { station_code: string; station_name: string; station_type: string }) =>
    eadafClient.create<Row>(R.workstation, toWorkstation(body, true)).then(mapWorkstation),
};

// ============ 工卡 ============
export const workCardRepo = {
  list: async (params?: { stationType?: string; status?: string }) => {
    const filter: Row = {};
    if (params?.stationType) filter.stationType = params.stationType;
    // pending 对应多种 IPS 状态，取回后在本地筛。其余状态一对一。
    const pending = params?.status === 'pending';
    if (params?.status && !pending) {
      filter.status = params.status === 'in_progress'
        ? 'REPAIRING'
        : params.status === 'completed'
          ? 'REPAIR_DONE'
          : params.status === 'cancelled'
            ? 'CANCELLED'
            : params.status;
    }
    const res = await eadafClient.findAll<Row>(R.workCard, { filter, limit: 100 });
    const items = res.items.map(mapWorkCard).filter((card) => !pending || card.status === 'pending');
    return { ...res, items, total: pending ? items.length : res.total };
  },
  get: async (id: string) => findMappedById(R.workCard, id, mapWorkCard, (item) => item.card_code),
  getByCode: async (cardCode: string) => {
    const res = await mappedFiltered<WorkCard>(R.workCard, { workCardNo: cardCode }, mapWorkCard, { limit: 1 });
    return res.items[0] ?? null;
  },
  create: (body: Partial<WorkCard> & { card_code: string; card_name: string; station_type: string; status: string }) =>
    eadafClient.create<Row>(R.workCard, toWorkCard(body, true)).then(mapWorkCard),
  update: (id: string, body: Partial<WorkCard>) =>
    eadafClient.update(R.workCard, id, toWorkCard(body, false)),
};

// ============ WBS 节点 ============
export const wbsNodeRepo = {
  getByCode: async (wbsCode: string) => {
    const res = await mappedFiltered<WbsNode>(R.wbsNode, { code: wbsCode }, mapWbs);
    return res.items[0] ?? null;
  },
  get: async (id: string) => findMappedById(R.wbsNode, id, mapWbs, (item) => item.wbs_code),
  create: (body: Partial<WbsNode>) => eadafClient.create<Row>(R.wbsNode, toWbs(body, true)).then(mapWbs),
};

// ============ 零部件 ============
export const workCardPartRepo = {
  listByCard: (cardId: string) =>
    mappedFiltered<WorkCardPart>(R.workCardPart, { workCardId: cardId }, mapPart, { limit: 100 }),
  update: (id: string, body: Partial<WorkCardPart>) =>
    eadafClient.update(R.workCardPart, id, toPart(body)),
  create: (body: Partial<WorkCardPart> & { work_card_id: string; part_code: string; part_name: string }) =>
    eadafClient.create<Row>(R.workCardPart, toPart(body)).then(mapPart),
};

// ============ 检测项 ============
export const inspectionItemRepo = {
  listByWorkStep: (workStepId: string) =>
    mappedFiltered<InspectionItem>(R.inspectionItem, { processStepId: workStepId }, mapInspectionItem, { limit: 100 }),
  listByPartCode: (partCode: string) =>
    mappedFiltered<InspectionItem>(R.inspectionItem, { partCode }, mapInspectionItem, { limit: 100 }),
  listByWbsNode: (wbsNodeId: string) =>
    mappedFiltered<InspectionItem>(R.inspectionItem, { wbsNodeId }, mapInspectionItem, { limit: 100 }),
  listAll: (params?: FindParams) => mappedFind<InspectionItem>(R.inspectionItem, mapInspectionItem, params),
  getByCode: async (itemCode: string) => {
    const res = await mappedFiltered<InspectionItem>(
      R.inspectionItem,
      { itemCode },
      mapInspectionItem,
      { limit: 1 },
    );
    return res.items[0] ?? null;
  },
  /**
   * 按工卡汇总检测项：挂在同一 WBS 上的项，再加上零件编码命中的项。
   */
  listByWorkCard: async (workCardId: string): Promise<FindResult<InspectionItem>> => {
    const card = await workCardRepo.get(workCardId);
    if (!card) return { items: [], total: 0 };

    const byKey = new Map<string, InspectionItem>();
    const put = (item: InspectionItem) => {
      const key = item.id ?? item.item_code;
      if (key) byKey.set(key, item);
    };

    if (card.wbs_node_id) {
      const steps = await eadafClient
        .findFiltered<WorkStep>(R.workStep, { wbs_node_id: card.wbs_node_id }, { limit: 100 })
        .catch(() => ({ items: [] as WorkStep[] }));
      for (const step of steps.items) {
        if (!step.id) continue;
        const res = await inspectionItemRepo.listByWorkStep(step.id).catch(() => ({ items: [] as InspectionItem[] }));
        res.items.forEach(put);
      }
      const byWbs = await inspectionItemRepo
        .listByWbsNode(card.wbs_node_id)
        .catch(() => ({ items: [] as InspectionItem[] }));
      byWbs.items.forEach(put);
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
    mappedFiltered<InspectionRecord>(R.inspectionRecord, { workCardId }, mapInspectionRecord, { limit: 100 }),
  create: (body: Partial<InspectionRecord>) =>
    eadafClient.create<Row>(R.inspectionRecord, toInspectionRecord(body, true)).then(mapInspectionRecord),
  update: (id: string, body: Partial<InspectionRecord>) =>
    eadafClient.update(R.inspectionRecord, id, toInspectionRecord(body, false)),
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
    mappedFind<MeasuringTool>(R.measuringTool, mapTool, params?.workstationId ? { limit: 100 } : undefined),
  getByCode: async (code: string) => {
    const res = await mappedFiltered<MeasuringTool>(R.measuringTool, { bizNo: code }, mapTool);
    return res.items[0] ?? null;
  },
  create: (body: Partial<MeasuringTool> & { tool_code: string; tool_name: string }) =>
    eadafClient.create<Row>(R.measuringTool, toTool(body, true)).then(mapTool),
};

// ============ 线边库 ============
export const lineStockRepo = {
  list: (params?: FindParams) => mappedFind<LineStock>(R.lineStock, mapStock, params),
};

export const lineStockItemRepo = {
  listByStock: (stockId: string) =>
    mappedFiltered<LineStockItem>(R.lineStockItem, { stockId }, mapStockItem, { limit: 100 }),
  create: (body: Partial<LineStockItem> & { stock_id: string; part_code: string; quantity: number }) =>
    eadafClient.create<Row>(R.lineStockItem, toStockItem(body)).then(mapStockItem),
  update: (id: string, body: Partial<LineStockItem>) =>
    eadafClient.update(R.lineStockItem, id, toStockItem(body)),
  adjust: async (
    stockId: string,
    partCode: string,
    opts: { partName?: string; delta: number },
  ): Promise<LineStockItem | null> => {
    const res = await lineStockItemRepo.listByStock(stockId);
    const hit = res.items.find((i) => i.part_code === partCode);
    if (hit?.id) {
      const quantity = Math.max(0, (hit.quantity ?? 0) + opts.delta);
      await lineStockItemRepo.update(hit.id, { quantity });
      return { ...hit, quantity };
    }
    if (opts.delta > 0) {
      return lineStockItemRepo.create({
        stock_id: stockId,
        part_code: partCode,
        part_name: opts.partName ?? partCode,
        quantity: opts.delta,
      });
    }
    return null;
  },
};

// ============ 委外单 ============
export const outsourceRepo = {
  list: (params?: { workCardId?: string } & FindParams) => {
    const filter = params?.workCardId ? { workCardId: params.workCardId } : undefined;
    return filter
      ? mappedFiltered<OutsourceOrder>(R.outsourceOrder, filter, mapOutsource, { limit: params?.limit ?? 100 })
      : mappedFind<OutsourceOrder>(R.outsourceOrder, mapOutsource, params);
  },
  create: (body: Partial<OutsourceOrder> & { order_no: string; part_code: string; quantity: number; outsource_status: string }) =>
    eadafClient.create<Row>(R.outsourceOrder, toOutsource(body, true)).then(mapOutsource),
  update: (id: string, body: Partial<OutsourceOrder>) =>
    eadafClient.update(R.outsourceOrder, id, toOutsource(body, false)),
};

// ============ 报废记录 ============
export const scrapRepo = {
  create: (body: Partial<ScrapRecord> & { scrap_no: string; quantity: number; scrap_time: string }) =>
    eadafClient.create<Row>(R.scrapRecord, toScrap(body)).then(mapScrap),
  list: (params?: { workCardId?: string }) =>
    params?.workCardId
      ? mappedFiltered<ScrapRecord>(R.scrapRecord, { workCardId: params.workCardId }, mapScrap)
      : mappedFind<ScrapRecord>(R.scrapRecord, mapScrap),
};

// ============ 出入库流水 ============
export const inventoryTxRepo = {
  create: (body: Partial<InventoryTransaction> & { transaction_no: string; part_code: string; transaction_type: string; quantity: number; transaction_time: string }) =>
    eadafClient.create<Row>(R.inventoryTransaction, toTx(body)).then(mapTx),
  list: (params?: { stockId?: string }) =>
    params?.stockId
      ? mappedFiltered<InventoryTransaction>(R.inventoryTransaction, { stockId: params.stockId }, mapTx)
      : mappedFind<InventoryTransaction>(R.inventoryTransaction, mapTx),
};

// ============ 呼叫日志 ============
export const notificationRepo = {
  create: (body: Partial<NotificationLog> & { call_type: string; call_time: string; is_responded: boolean }) =>
    eadafClient.create<Row>(R.notificationLog, toCall(body)).then(mapCall),
  list: (params?: { workstationId?: string; isResponded?: boolean }) => {
    const filter: Row = {};
    if (params?.workstationId) filter.workstationId = params.workstationId;
    if (params?.isResponded != null) filter.isResponded = params.isResponded;
    return Object.keys(filter).length > 0
      ? mappedFiltered<NotificationLog>(R.notificationLog, filter, mapCall)
      : mappedFind<NotificationLog>(R.notificationLog, mapCall);
  },
};

// ============ 形迹模版 ============
async function findRawId(routePath: string, id: string): Promise<Record<string, unknown> | null> {
  for (let skip = 0; skip < 500; skip += 100) {
    const res = await eadafClient.find<Record<string, unknown>>(routePath, { limit: 100, skip });
    const hit = res.items.find((row) => row.id === id);
    if (hit) return hit;
    if (res.items.length < 100) break;
  }
  return null;
}

const REPAIR_METHOD_LABELS: Record<string, string> = {
  OVERHAUL: '大修',
  CHECK: '检修',
  DETECT: '检测',
  OIL_SEAL: '油封',
  TROUBLESHOOT: '排故',
};

async function resolveBopSchemeId(card: Record<string, unknown> | null): Promise<string | undefined> {
  const instanceId = card?.bopInstanceId ? String(card.bopInstanceId) : '';
  if (instanceId) {
    const instance = await findRawId(R.bopInstance, instanceId);
    if (instance?.bopSchemeId) return String(instance.bopSchemeId);
  }
  const orderId = card?.workshopOrderId ? String(card.workshopOrderId) : '';
  if (!orderId) return undefined;
  const order = await findRawId(R.workshopOrder, orderId);
  return order?.bopSchemeId ? String(order.bopSchemeId) : undefined;
}

async function bopSchemeIdOfCard(cardId: string): Promise<string | undefined> {
  return resolveBopSchemeId(await findRawId(R.workCard, cardId));
}

export async function repairSchemeOfCard(cardId: string) {
  const schemeId = await bopSchemeIdOfCard(cardId);
  if (!schemeId) return null;
  const scheme = await findRawId(R.bopScheme, schemeId);
  if (!scheme) return null;
  const method = scheme.repairMethod ? String(scheme.repairMethod) : '';
  const productModel = scheme.productModel ? String(scheme.productModel) : '';
  const name = scheme.name ? String(scheme.name) : '';
  return {
    id: String(scheme.id),
    name: name || [productModel, REPAIR_METHOD_LABELS[method] ?? method].filter(Boolean).join(' '),
    product_model: productModel,
    repair_method: method,
    repair_method_label: REPAIR_METHOD_LABELS[method] ?? method,
    version: scheme.version != null && scheme.version !== '' ? Number(scheme.version) : undefined,
  };
}

export const trayTemplateRepo = {
  list: (params?: FindParams) => mappedFind<TrayTemplate>(R.trayTemplate, mapTray, params),
  /**
   * 工位只用已发布模版。工卡能解析到维修方案时按方案取；否则用分拣工位类型下的已发布模版。
   */
  listForCard: async (cardId?: string) => {
    const res = await mappedFind<TrayTemplate>(R.trayTemplate, mapTray, { limit: 100 });
    const published = res.items.filter((item) => item.status === 'published');
    if (!cardId) return { ...res, items: published, total: published.length };
    const schemeId = await bopSchemeIdOfCard(cardId);
    if (schemeId) {
      const matched = published.filter((item) => item.bop_scheme_id === schemeId);
      if (matched.length) return { ...res, items: matched, total: matched.length };
    }
    const sorting = published.filter((item) => !item.workstation_type || item.workstation_type === 'sorting');
    return { ...res, items: sorting, total: sorting.length };
  },
  get: async (id: string) => findMappedById(R.trayTemplate, id, mapTray, (item) => item.template_code),
};

export const traySlotRepo = {
  listByTemplate: (templateId: string) =>
    mappedFiltered<TraySlot>(R.traySlot, { templateId }, mapSlot, { limit: 100 }),
  update: (id: string, body: Partial<TraySlot>) =>
    eadafClient.update(R.traySlot, id, toSlot(body)),
};

export async function withMaterialNames(slots: TraySlot[]): Promise<TraySlot[]> {
  if (!slots.length) return slots;
  const materials = await eadafClient.find<Row>(R.material, { limit: 100 });
  const byId = new Map(materials.items.filter((row) => row.id).map((row) => [String(row.id), row]));
  return slots.map((slot) => {
    const material = slot.material_id ? byId.get(slot.material_id) : undefined;
    const name = material?.name ? String(material.name) : slot.material_name;
    const code = slot.part_code || (material?.materialNo ? String(material.materialNo) : undefined);
    return { ...slot, material_name: name, part_code: code, slot_name: name || slot.slot_name };
  });
}

// ============ 工步（仍是 fmms 实体，IPS 工序实例还盖不住工位工步）============
export const workStepRepo = {
  listByWbs: (wbsNodeId: string) =>
    eadafClient.findFiltered<WorkStep>(R.workStep, { wbs_node_id: wbsNodeId }, { limit: 100 }),
  list: (params?: FindParams) => eadafClient.find<WorkStep>(R.workStep, params),
};

// ============ 修理记录（仍是 fmms Bop）============
export const bopRepo = {
  list: (params?: FindParams) => eadafClient.find<Bop>(R.bop, params),
  create: (body: Partial<Bop> & { recordNo: string; repairMethod: string; status: string }) =>
    eadafClient.create<Bop>(R.bop, body as Record<string, unknown>),
  update: (id: string, body: Partial<Bop>) =>
    eadafClient.update(R.bop, id, body as Record<string, unknown>),
};

// ============ AGV 转运任务 ============
export const agvTaskRepo = {
  list: (params?: { fromStation?: string; status?: string } & FindParams) => {
    const filter: Row = {};
    if (params?.fromStation) filter.fromStation = params.fromStation;
    if (params?.status) filter.status = params.status;
    return Object.keys(filter).length > 0
      ? mappedFiltered<AgvTask>(R.agvTask, filter, mapAgv, { limit: params?.limit ?? 50 })
      : mappedFind<AgvTask>(R.agvTask, mapAgv, params);
  },
  create: (body: Partial<AgvTask> & { taskNo: string; fromStation: string; toStation: string; status: string }) =>
    eadafClient.create<Row>(R.agvTask, toAgv(body)).then(mapAgv),
  update: (id: string, body: Partial<AgvTask>) =>
    eadafClient.update(R.agvTask, id, toAgv(body)),
};

export type { FindResult };
