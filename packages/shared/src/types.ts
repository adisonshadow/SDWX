/**
 * FMMS 共享类型定义
 * 字段严格对齐 EADAF apis.json
 */
import type {
  WorkstationType,
  WorkCardStatus,
  PartStatus,
  DisposalResult,
  InspectionResult,
  CallType,
  StockType,
  OutsourceStatus,
  WsEventName,
} from './constants.js';

/** EADAF 标准 API 响应封装 */
export interface EadafEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

/** 分页查询结果（对齐 apis.json Find 响应 data: { items, total, page, size }） */
export interface PagedResult<T> {
  items: T[];
  total: number;
  page?: number;
  size?: number;
}

// ============ 业务实体（对齐 apis.json）============

/** 工卡 */
export interface WorkCard {
  id?: string;
  card_code: string;
  card_name: string;
  station_type: string;
  wbs_node_id?: string;
  status: WorkCardStatus;
  product_code?: string;
  product_name?: string;
  batch_no?: string;
  serial_no?: string;
  accept_operator_id?: string;
  accept_operator_name?: string;
  accept_time?: string;
  start_time?: string;
  complete_time?: string;
  progress?: number;
  total_parts?: number;
  qualified_parts?: number;
  unqualified_parts?: number;
  source?: string;
  remark?: string;
  current_station_id?: string;
  created_at?: string;
  updated_at?: string;
}

/** 工位 */
export interface Workstation {
  id?: string;
  station_code: string;
  station_name: string;
  station_type: WorkstationType;
  location?: string;
  ip_address?: string;
  is_active?: boolean;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** WBS 节点 */
export interface WbsNode {
  id?: string;
  wbs_code: string;
  wbs_name: string;
  parent_id?: string;
  node_level: number;
  sort_order?: number;
  process_code?: string;
  process_name?: string;
  process_description?: string;
  process_resources?: ProcessResource[] | Record<string, unknown>;
  estimated_minutes?: number;
  workstation_type?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** 工艺资源（文件/视频） */
export interface ProcessResource {
  resource_type: 'document' | 'file' | 'video';
  title: string;
  url: string;
  mime_type?: string;
  playable_in_client?: boolean;
}

/** 检测项 */
export interface InspectionItem {
  id?: string;
  item_code: string;
  item_name: string;
  wbs_node_id?: string;
  work_step_id?: string;
  part_code?: string;
  item_type?: string;
  measure_tool_code?: string;
  nominal_value?: number;
  upper_tolerance?: number;
  lower_tolerance?: number;
  unit?: string;
  sort_order?: number;
  require_photo?: boolean;
  inspection_method?: string;
  quality_criteria?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** 检测记录 */
export interface InspectionRecord {
  id?: string;
  work_card_id?: string;
  part_id?: string;
  inspection_item_id?: string;
  measure_tool_id?: string;
  measure_tool_code?: string;
  result?: InspectionResult;
  measured_value?: number;
  nominal_value?: number;
  upper_tolerance?: number;
  lower_tolerance?: number;
  unit?: string;
  is_manual?: boolean;
  is_overridden?: boolean;
  operator_id?: string;
  operator_name?: string;
  inspect_time?: string;
  photo_object_id?: string;
  photo_urls?: Record<string, unknown>;
  raw_data?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** 测量工具 */
export interface MeasuringTool {
  id?: string;
  tool_code: string;
  tool_name: string;
  tool_model?: string;
  protocol_type?: string;
  connection_params?: Record<string, unknown>;
  parseTemplate?: Record<string, unknown>;
  status?: string;
  workstation_id?: string;
  last_heartbeat?: string;
  firmware_version?: string;
  calibration_date?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** 线边库 */
export interface LineStock {
  id?: string;
  stock_code: string;
  stock_name: string;
  location?: string;
  stock_type: StockType;
  is_active?: boolean;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** 线边库物料 */
export interface LineStockItem {
  id?: string;
  stock_id: string;
  part_code: string;
  part_name?: string;
  quantity: number;
  min_quantity?: number;
  max_quantity?: number;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** 工卡零部件 */
export interface WorkCardPart {
  id?: string;
  work_card_id: string;
  part_code: string;
  part_name: string;
  barcode?: string;
  scan_barcode?: string;
  category?: string;
  quantity: number;
  sorted_quantity?: number;
  status: PartStatus;
  disposal_result?: DisposalResult;
  disposal_operator_id?: string;
  disposal_operator_name?: string;
  disposal_time?: string;
  suggested_disposal?: string;
  disposal_remark?: string;
  sort_order?: number;
  parent_part_id?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** 委外单 */
export interface OutsourceOrder {
  id?: string;
  order_no: string;
  workCardId?: string;
  operator_id?: string;
  operator_name?: string;
  outsource_company?: string;
  outsource_cost?: number;
  outsource_status: OutsourceStatus | string;
  part_code: string;
  part_name?: string;
  quantity: number;
  send_date?: string;
  receive_date?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** 报废记录 */
export interface ScrapRecord {
  id?: string;
  scrap_no: string;
  work_card_id?: string;
  part_id?: string;
  part_code?: string;
  part_name?: string;
  quantity: number;
  scrap_category?: string;
  scrap_reason?: string;
  scrap_time: string;
  operator_id?: string;
  operator_name?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** 出入库流水 */
export interface InventoryTransaction {
  id?: string;
  transaction_no: string;
  stock_id?: string;
  part_code: string;
  part_name?: string;
  transaction_type: 'inbound' | 'outbound' | string;
  quantity: number;
  operator_id?: string;
  operator_name?: string;
  transaction_time: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** 异常呼叫日志 */
export interface NotificationLog {
  id?: string;
  workstation_id?: string;
  call_type: CallType | string;
  call_content?: string;
  call_time: string;
  caller_id?: string;
  caller_name?: string;
  is_responded: boolean;
  respond_time?: string;
  responder_id?: string;
  responder_name?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** 形迹托盘模版 */
export interface TrayTemplate {
  id?: string;
  template_code: string;
  template_name: string;
  workstation_type?: string;
  description?: string;
  trayPhotoObjectId?: string;
  created_at?: string;
  updated_at?: string;
}

/** 形迹槽位 */
export interface TraySlot {
  id?: string;
  template_id: string;
  slot_code: string;
  slot_name?: string;
  slot_shape: string;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  part_code?: string;
  required: boolean;
  slotStatus?: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

/** 工步 */
export interface WorkStep {
  id?: string;
  step_code?: string;
  step_name?: string;
  wbs_node_id?: string;
  operation_content?: string;
  quality_standard?: string;
  tool_code?: string;
  sort_order?: number;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** 修理记录（EADAF 实体名 Bop） */
export interface Bop {
  id?: string;
  recordNo: string;
  repairMethod: string;
  repairDate?: string;
  equipmentTooling?: string;
  process?: string;
  conclusion?: string;
  defectDescription?: string;
  responsiblePerson?: string;
  status: string;
  remark?: string;
}

/** AGV 转运任务 */
export interface AgvTask {
  id?: string;
  taskNo: string;
  fromStation: string;
  toStation: string;
  inboundRequestTime?: string;
  outboundRequestTime?: string;
  completedTime?: string;
  carrierInfo?: string;
  status: string;
  remark?: string;
}

// ============ 检测结果聚合 DTO（BFF ↔ 前端，由 InspectionRecord 聚合）============

/** 单条检测结果 */
export interface InspectionResultItem {
  item_code: string;
  inspection_item_id?: string;
  measured_value?: number;
  result: InspectionResult;
  photo_object_ids?: string[];
  collected_at?: string;
  collected_by?: 'auto' | 'manual';
}

/** 工卡检测结果汇总 */
export interface InspectionResultData {
  items: InspectionResultItem[];
  summary: {
    total: number;
    qualified: number;
    unqualified: number;
    pending: number;
  };
}

// ============ WebSocket ============

export interface WsMessage<T = unknown> {
  type: WsEventName;
  payload: T;
}

/** 采集数据帧（Electron → BFF） */
export interface CollectFrame {
  tool_code: string;
  station_code?: string;
  operator_id?: string;
  card_id?: string;
  item_code?: string;
  raw: string;
  ts: string;
}

/** 采集回显（BFF WS → 前端） */
export interface CollectEcho {
  tool_code: string;
  item_code?: string;
  measured_value?: number;
  result?: InspectionResult;
  raw: string;
  ts: string;
}

// ============ SSO / 本地配置 ============

export interface SsoUserInfo {
  user_id?: string;
  id?: string;
  username?: string;
  name?: string;
  email?: string;
  department_id?: string;
  [key: string]: unknown;
}

export interface LocalConfig {
  op_base_url: string;
  eadaf_frontend_url: string;
  sso_application_id: string;
  selected_station_code?: string;
  selected_station_name?: string;
  selected_station_type?: WorkstationType;
  dual_screen: boolean;
  default_fullscreen?: boolean;
}

/** OPWeb 字体档位（触摸屏） */
export type OpFontScale = 'small' | 'medium' | 'large';

export interface UserHabits {
  recent_card_ids: string[];
  page_size: number;
  sound_alarm: boolean;
  last_secondary_tab?: string;
  font_scale?: OpFontScale;
  main_fullscreen?: boolean;
  secondary_fullscreen?: boolean;
}
