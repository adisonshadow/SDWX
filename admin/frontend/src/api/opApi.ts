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
  TrayTemplate,
  TraySlot,
  WbsNode,
  WorkstationType,
  PartStatus,
  DisposalResult,
  CallType,
  CalleeType,
  InspectionResultData,
} from '@fmms/shared';

const BASE = '/api/op';

// ---- 工位 ----
export const fetchWorkstations = (type?: WorkstationType) =>
  get<Paged<Workstation>>(`${BASE}/workstations${type ? `?type=${type}` : ''}`);

export const fetchWorkstation = (code: string) => get<Workstation>(`${BASE}/workstations/${code}`);

// ---- 工卡 ----
export const fetchWorkCards = (params: { stationType?: string; status?: string; page?: number; size?: number }) => {
  const q = new URLSearchParams();
  if (params.stationType) q.set('station_type', params.stationType);
  if (params.status) q.set('status', params.status);
  q.set('page', String(params.page ?? 1));
  q.set('size', String(params.size ?? 20));
  return get<Paged<WorkCard>>(`${BASE}/workcards?${q}`);
};

export interface WorkCardDetail {
  work_card: WorkCard;
  parts: WorkCardPart[];
  wbs_node: WbsNode | null;
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

// ---- 检测项 ----
export const fetchInspectionItems = (params: { wbsNodeId?: string; partCode?: string }) => {
  const q = new URLSearchParams();
  if (params.wbsNodeId) q.set('wbs_node_id', params.wbsNodeId);
  if (params.partCode) q.set('part_code', params.partCode);
  return get<Paged<InspectionItem>>(`${BASE}/inspection-items?${q}`);
};

// ---- 测量工具 ----
export const fetchTools = (workstationId?: string) =>
  get<Paged<MeasuringTool>>(`${BASE}/tools${workstationId ? `?workstation_id=${workstationId}` : ''}`);

export const registerTool = (body: Partial<MeasuringTool> & { tool_code: string; tool_name: string }) =>
  post<MeasuringTool>(`${BASE}/tools`, body);

// ---- 异常呼叫 ----
export const createCall = (body: {
  call_type: CallType;
  callee_type?: CalleeType;
  description?: string;
  station_code?: string;
}) => post<NotificationLog>(`${BASE}/call`, body);

// ---- 修理（委外/报废）----
export const createOutsource = (body: { source_card_id?: string; outsource_party: string; part_codes?: string[] }) =>
  post<OutsourceOrder>(`${BASE}/outsource`, body);

export const fetchOutsource = (cardId?: string) =>
  get<Paged<OutsourceOrder>>(`${BASE}/outsource${cardId ? `?card_id=${cardId}` : ''}`);

export const createScrap = (body: {
  card_id?: string;
  items: Array<{ part_code?: string; part_name?: string; quantity: number; scrap_type?: string; reason?: string }>;
}) => post(`${BASE}/scrap`, body);

// ---- 收发（线边库/出入库）----
export const fetchInventory = () => get<Paged<LineStock>>(`${BASE}/inventory`);

export const createInventoryTransaction = (body: {
  stock_id?: string;
  transaction_type: 'inbound' | 'outbound';
  stock_type?: string;
  material_code: string;
  material_name?: string;
  quantity: number;
  unit: string;
  related_barcode?: string;
  card_id?: string;
}) => post(`${BASE}/inventory/transaction`, body);

// ---- 形迹模版 ----
export const fetchTrayTemplates = () => get<Paged<TrayTemplate>>(`${BASE}/tray-templates`);

export const fetchTrayTemplateDetail = (id: string) =>
  get<{ template: TrayTemplate; slots: TraySlot[] }>(`${BASE}/tray-templates/${id}`);

export const updateTraySlot = (slotId: string, filled: boolean) =>
  patch(`${BASE}/tray-slots/${slotId}`, { filled });

// ---- 存储 ----
export const uploadFile = (filename: string, file: File) => upload(`${BASE}/storage/upload`, filename, file);

// ---- SSO ----
export const fetchSsoConfig = () =>
  get<{ eadaf_frontend_url: string; application_id: string; callback_url: string; redirect_mode: string }>(
    '/auth/sso-config',
  );

export const fetchMe = () => get<unknown>('/auth/me');

// ---- AGV（Mock）----
export const requestAgv = (body: { card_id?: string; action: 'in' | 'out' }) =>
  post(`${BASE}/agv`, body);
