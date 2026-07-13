/**
 * Repositories — 领域概念到 EADAF routePath 的适配层
 *
 * routePath 集中在 @fmms/shared EADAF_ROUTES，格式 fmms/{scope}/{Entity}。
 * EADAF Find 不支持 URL filter，使用 findFiltered 做客户端过滤。
 */
import { eadafClient, type FindParams, type FindResult } from './EADAFClient.js';
import { EADAF_ROUTES } from '@fmms/shared';
import type {
  WorkCard,
  Workstation,
  WorkCardPart,
  InspectionItem,
  MeasuringTool,
  LineStock,
  WbsNode,
  OutsourceOrder,
  ScrapRecord,
  InventoryTransaction,
  NotificationLog,
  TrayTemplate,
  TraySlot,
} from '@fmms/shared';

const R = EADAF_ROUTES;

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
  get: async (id: string) => {
    const res = await eadafClient.findFiltered<WorkCard>(R.workCard, { id }, { limit: 100 });
    return res.items[0] ?? null;
  },
  update: (id: string, body: Partial<WorkCard>) =>
    eadafClient.update(R.workCard, id, body as Record<string, unknown>),
};

// ============ WBS 节点 ============
export const wbsNodeRepo = {
  getByCode: async (wbsCode: string) => {
    const res = await eadafClient.findFiltered<WbsNode>(R.wbsNode, { wbs_code: wbsCode });
    return res.items[0] ?? null;
  },
  get: async (id: string) => {
    const res = await eadafClient.findFiltered<WbsNode>(R.wbsNode, { id }, { limit: 100 });
    return res.items[0] ?? null;
  },
};

// ============ 零部件（补充实体）============
export const workCardPartRepo = {
  listByCard: (cardId: string) =>
    eadafClient.findFiltered<WorkCardPart>(R.workCardPart, { card_id: cardId }, { limit: 200 }),
  update: (id: string, body: Partial<WorkCardPart>) =>
    eadafClient.update(R.workCardPart, id, body as Record<string, unknown>),
  create: (body: Partial<WorkCardPart> & { card_id: string; part_code: string; part_name: string }) =>
    eadafClient.create<WorkCardPart>(R.workCardPart, body as Record<string, unknown>),
};

// ============ 检测项 ============
export const inspectionItemRepo = {
  listByWbs: (wbsNodeId: string) =>
    eadafClient.findFiltered<InspectionItem>(R.inspectionItem, { wbs_node_id: wbsNodeId }, { limit: 500 }),
  listByPartCode: (partCode: string) =>
    eadafClient.findFiltered<InspectionItem>(R.inspectionItem, { part_code: partCode }, { limit: 500 }),
  listAll: (params?: FindParams) => eadafClient.find<InspectionItem>(R.inspectionItem, params),
};

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

// ============ 委外单（补充实体）============
export const outsourceRepo = {
  list: (params?: { cardId?: string }) =>
    params?.cardId
      ? eadafClient.findFiltered<OutsourceOrder>(R.outsourceOrder, { source_card_id: params.cardId })
      : eadafClient.find<OutsourceOrder>(R.outsourceOrder),
  create: (body: Partial<OutsourceOrder> & { order_no: string; outsource_party: string }) =>
    eadafClient.create<OutsourceOrder>(R.outsourceOrder, body as Record<string, unknown>),
  update: (id: string, body: Partial<OutsourceOrder>) =>
    eadafClient.update(R.outsourceOrder, id, body as Record<string, unknown>),
};

// ============ 报废记录（补充实体）============
export const scrapRepo = {
  create: (body: Partial<ScrapRecord> & { quantity: number }) =>
    eadafClient.create<ScrapRecord>(R.scrapRecord, body as Record<string, unknown>),
  list: (params?: { cardId?: string }) =>
    params?.cardId
      ? eadafClient.findFiltered<ScrapRecord>(R.scrapRecord, { card_id: params.cardId })
      : eadafClient.find<ScrapRecord>(R.scrapRecord),
};

// ============ 出入库流水（补充实体）============
export const inventoryTxRepo = {
  create: (body: Partial<InventoryTransaction> & { transaction_type: string; material_code: string; quantity: number; unit: string; transaction_time: string }) =>
    eadafClient.create<InventoryTransaction>(R.inventoryTransaction, body as Record<string, unknown>),
  list: (params?: { stockId?: string }) =>
    params?.stockId
      ? eadafClient.findFiltered<InventoryTransaction>(R.inventoryTransaction, { stock_id: params.stockId })
      : eadafClient.find<InventoryTransaction>(R.inventoryTransaction),
};

// ============ 呼叫日志（补充实体）============
export const notificationRepo = {
  create: (body: Partial<NotificationLog> & { station_code: string; caller_id: string; call_type: string }) =>
    eadafClient.create<NotificationLog>(R.notificationLog, body as Record<string, unknown>),
  list: (params?: { stationCode?: string; status?: string }) => {
    const filter: Record<string, unknown> = {};
    if (params?.stationCode) filter.station_code = params.stationCode;
    if (params?.status) filter.status = params.status;
    return Object.keys(filter).length > 0
      ? eadafClient.findFiltered<NotificationLog>(R.notificationLog, filter)
      : eadafClient.find<NotificationLog>(R.notificationLog);
  },
};

// ============ 形迹模版（补充实体）============
export const trayTemplateRepo = {
  list: (params?: FindParams) => eadafClient.find<TrayTemplate>(R.trayTemplate, params),
};

export const traySlotRepo = {
  listByTemplate: (templateId: string) =>
    eadafClient.findFiltered<TraySlot>(R.traySlot, { template_id: templateId }, { limit: 500 }),
  update: (id: string, body: Partial<TraySlot>) =>
    eadafClient.update(R.traySlot, id, body as Record<string, unknown>),
};

export type { FindResult };
