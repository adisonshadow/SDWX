/**
 * OP API — 工位作业接口封装
 * 对接 BFF /api/op/* 路由
 * 字段对齐 EADAF apis.json（新字段名）
 */
import { get, post, patch, upload, type Paged } from './request';
import type {
  Workstation,
  WorkCard,
  WorkCardPart,
  InspectionItem,
  MeasuringTool,
  NotificationLog,
  OutsourceOrder,
  LineStock,
  LineStockItem,
  TrayTemplate,
  TraySlot,
  WbsNode,
  WorkStep,
  Bop,
  AgvTask,
  WorkstationType,
  PartStatus,
  DisposalResult,
  StockType,
  InspectionResultData,
} from '@fmms/shared';

const BASE = '/api/op';

// ---- 工位 ----
export const fetchWorkstations = (type?: WorkstationType) =>
  get<Paged<Workstation>>(`${BASE}/workstations${type ? `?type=${type}` : ''}`);

export const fetchWorkstation = (code: string) => get<Workstation>(`${BASE}/workstations/${code}`);

// ---- 工卡 ----
/** 工卡列表：BFF 一次最多取 100 条（EADAF limit 上限），分页在前端做 */
export const fetchWorkCards = (params: { stationType?: string; status?: string }) => {
  const q = new URLSearchParams();
  if (params.stationType) q.set('station_type', params.stationType);
  if (params.status) q.set('status', params.status);
  const qs = q.toString();
  return get<Paged<WorkCard>>(`${BASE}/workcards${qs ? `?${qs}` : ''}`);
};

export interface RepairSchemeInfo {
  id: string;
  name: string;
  product_model: string;
  repair_method: string;
  repair_method_label: string;
  version?: number;
}

export interface WorkCardDetail {
  work_card: WorkCard & { inspection_result?: InspectionResultData };
  parts: WorkCardPart[];
  wbs_node: WbsNode | null;
  work_steps?: WorkStep[];
  repair_scheme?: RepairSchemeInfo | null;
}

export const fetchWorkCardDetail = (id: string) => get<WorkCardDetail>(`${BASE}/workcards/${id}`);

export const acceptWorkCard = (id: string) => post<WorkCard>(`${BASE}/workcards/${id}/accept`);

export const updateWorkCardProgress = (id: string, progress: number) =>
  patch(`${BASE}/workcards/${id}/progress`, { progress });

export const submitWorkCard = (id: string, inspectionResult?: InspectionResultData) =>
  post<WorkCard>(`${BASE}/workcards/${id}/submit`, inspectionResult ? { inspection_result: inspectionResult } : undefined);

export const saveInspectionResult = (id: string, result: InspectionResultData) =>
  post(`${BASE}/workcards/${id}/inspection-result`, result);

// ---- 零部件 ----
export const fetchWorkCardParts = (cardId: string) => get<Paged<WorkCardPart>>(`${BASE}/workcards/${cardId}/parts`);

export const updatePart = (partId: string, body: { status?: PartStatus; disposal_result?: DisposalResult }) =>
  patch(`${BASE}/parts/${partId}`, body);

// ---- 检测项（按工卡/工步/零件，不按 WBS）----
export const fetchInspectionItems = (params: {
  workCardId?: string;
  workStepId?: string;
  partCode?: string;
}) => {
  const q = new URLSearchParams();
  if (params.workCardId) q.set('work_card_id', params.workCardId);
  if (params.workStepId) q.set('work_step_id', params.workStepId);
  if (params.partCode) q.set('part_code', params.partCode);
  return get<Paged<InspectionItem>>(`${BASE}/inspection-items?${q}`);
};

// ---- 测量工具 ----
export const registerTool = (body: Partial<MeasuringTool> & { tool_code: string; tool_name: string }) =>
  post<MeasuringTool>(`${BASE}/tools`, body);

// ---- 异常呼叫 ----
export const createCall = (body: {
  call_type: string;
  description?: string;
  station_code?: string;
}) => post<NotificationLog>(`${BASE}/call`, body);

// ---- 修理（委外/报废）----
export const createOutsource = (body: {
  source_card_id?: string;
  outsource_party?: string;
  outsource_company?: string;
  part_codes?: string[];
  part_code?: string;
  part_name?: string;
  quantity?: number;
}) => post<OutsourceOrder>(`${BASE}/outsource`, body);

export const createScrap = (body: {
  card_id?: string;
  work_card_id?: string;
  items: Array<{
    part_code?: string;
    part_name?: string;
    part_id?: string;
    quantity: number;
    scrap_type?: string;
    scrap_category?: string;
    reason?: string;
    scrap_reason?: string;
  }>;
}) => post(`${BASE}/scrap`, body);

/** 修理记录（EADAF Bop） */
export const createRepairRecord = (body: {
  method: string;
  equipment?: string;
  process?: string;
  conclusion?: string;
  defect_description?: string;
  work_card_id?: string;
  part_id?: string;
}) => post<Bop>(`${BASE}/disposal/repair`, body);

export const requestShortage = (body: {
  work_card_id: string;
  scrap_category?: string;
  items: Array<{ part_code?: string; part_name?: string; quantity?: number }>;
}) => post<NotificationLog>(`${BASE}/shortage`, body);

// ---- 收发（线边库/出入库）----
export const fetchInventory = () =>
  get<Paged<LineStock> & { stock_items: Array<LineStockItem & { stock_type?: StockType }> }>(`${BASE}/inventory`);

export const createInventoryTransaction = (body: {
  stock_id?: string;
  /** 线边库类型，给了 stock_type 时由 BFF 反查 stock_id */
  stock_type?: string;
  /** EADAF 枚举：stock_in / stock_out / transfer */
  transaction_type: 'stock_in' | 'stock_out' | 'transfer';
  part_code?: string;
  part_name?: string;
  material_code?: string;
  material_name?: string;
  quantity: number;
  related_barcode?: string;
  card_id?: string;
}) => post<{ transaction: unknown; stock_item: unknown }>(`${BASE}/inventory/transaction`, body);

// ---- 形迹模版 ----
export const fetchTrayTemplates = (cardId?: string) =>
  get<Paged<TrayTemplate>>(`${BASE}/tray-templates${cardId ? `?card_id=${encodeURIComponent(cardId)}` : ''}`);

export const fetchTrayTemplateDetail = (id: string) =>
  get<{ template: TrayTemplate; slots: TraySlot[] }>(`${BASE}/tray-templates/${id}`);

export const updateTraySlot = (slotId: string, body: { required?: boolean; slotStatus?: string; filled?: boolean }) =>
  patch(`${BASE}/tray-slots/${slotId}`, body);

// ---- 存储 ----
export const uploadFile = (filename: string, file: File) => upload(`${BASE}/storage/upload`, filename, file);

// ---- AGV 转运 ----
export const requestAgv = (body: {
  action: 'in' | 'out';
  from_station: string;
  to_station?: string;
  card_id?: string;
  carrier_info?: string;
}) => post<AgvTask>(`${BASE}/agv`, body);
