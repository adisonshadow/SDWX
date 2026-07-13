/**
 * FMMS 共享类型定义
 * 字段严格对齐 EADAF apis.json（6 个已有实体 + 补充实体）
 */
import type {
  WorkstationType,
  WorkCardStatus,
  PartStatus,
  DisposalResult,
  InspectionResult,
  CallType,
  CalleeType,
  StockType,
  WsEventName,
} from './constants.js';

/** EADAF 标准 API 响应封装 */
export interface EadafEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

/** 分页查询结果 */
export interface PagedResult<T> {
  items: T[];
  total: number;
}

// ============ 已有6实体（字段对齐 apis.json）============

/** 工卡 */
export interface WorkCard {
  id?: string;
  card_code: string; // 工卡编号
  card_name: string; // 工卡名称
  station_type: string; // 工位类型
  wbs_node_id?: string; // WBS节点ID
  status: WorkCardStatus; // 工卡状态
  product_code?: string; // 产品编号
  product_name?: string; // 产品名称
  batch_no?: string; // 批次号
  serial_no?: string; // 序列号
  accept_operator_id?: string; // 接收操作工ID
  accept_operator_name?: string; // 接收操作工姓名
  accept_time?: string; // 接收时间
  start_time?: string; // 开始时间
  complete_time?: string; // 完成时间
  progress?: number; // 进度百分比
  total_parts?: number; // 零件总数
  qualified_parts?: number; // 合格数
  unqualified_parts?: number; // 不合格数
  source?: string; // 来源
  remark?: string; // 备注
  current_station_id?: string; // 当前工位ID
  // 检测结果 JSON 字段（需在 EADAF WorkCard 实体上补充）
  inspection_result?: InspectionResultData;
  created_at?: string;
  updated_at?: string;
}

/** 工位 */
export interface Workstation {
  id?: string;
  station_code: string; // 工位编码
  station_name: string; // 工位名称
  station_type: WorkstationType; // 工位类型
  location?: string; // 位置描述
  ip_address?: string; // 工位终端IP
  is_active?: boolean; // 是否启用
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** WBS 节点 */
export interface WbsNode {
  id?: string;
  wbs_code: string; // WBS编码
  wbs_name: string; // 节点名称
  parent_id?: string; // 父节点ID
  node_level: number; // 层级
  sort_order?: number; // 排序号
  process_code?: string; // 工序编码
  process_name?: string; // 工序名称
  process_description?: string; // 工艺描述
  process_resources?: ProcessResource[] | Record<string, unknown>; // 工艺资源（文件/视频）
  estimated_minutes?: number; // 预计工时(分钟)
  workstation_type?: string; // 适用工位类型
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
  item_code: string; // 检测项编码
  item_name: string; // 检测项名称
  wbs_node_id?: string; // WBS节点ID
  work_step_id?: string; // 工步ID
  part_code?: string; // 适用零件编号
  item_type?: string; // 检测项类型
  measure_tool_code?: string; // 推荐测量工具
  nominal_value?: number; // 公称值
  upper_tolerance?: number; // 上偏差
  lower_tolerance?: number; // 下偏差
  unit?: string; // 单位
  sort_order?: number; // 排序号
  require_photo?: boolean; // 是否需拍照
  inspection_method?: string; // 检测方法
  quality_criteria?: string; // 质量判定标准
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** 测量工具 */
export interface MeasuringTool {
  id?: string;
  tool_code: string; // 工具编号
  tool_name: string; // 工具名称
  tool_model?: string; // 型号规格
  protocol_type?: string; // 协议类型
  connection_params?: Record<string, unknown>; // 连接参数（JSON: port/baud_rate/ip 等）
  status?: string; // 在线状态
  workstation_id?: string; // 绑定工位
  last_heartbeat?: string; // 最后心跳时间
  firmware_version?: string; // 固件版本
  calibration_date?: string; // 校准日期
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** 线边库 */
export interface LineStock {
  id?: string;
  stock_code: string; // 线边库编码
  stock_name: string; // 线边库名称
  location?: string; // 位置
  stock_type: StockType; // 线边库存类型
  is_active?: boolean; // 是否启用
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

// ============ 补充实体（待 EADAF 创建）============

/** 工卡零部件 */
export interface WorkCardPart {
  id?: string;
  card_id: string; // → WorkCard.id
  part_code: string; // 零件编号
  part_name: string; // 零件名称
  quantity: number; // 数量（目标数量）
  sorted_quantity?: number; // 已分拣清点数量
  category?: string; // 分组类别
  status: PartStatus; // 零件状态
  pass_count?: number; // 合格数
  fail_count?: number; // 不合格数
  disposal_result?: DisposalResult; // 处置结果
  scan_barcode?: string; // 扫码条码
  wbs_node_id?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** 委外单 */
export interface OutsourceOrder {
  id?: string;
  order_no: string; // 委托单编码（唯一）
  source_card_id?: string; // 来源工卡
  outsource_party: string; // 委外方
  part_codes?: string[]; // 零件编号数组
  status?: string; // 状态
  ship_date?: string; // 发货日期
  return_date?: string; // 返回日期
  operator?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** 报废记录 */
export interface ScrapRecord {
  id?: string;
  card_id?: string;
  part_code?: string;
  part_name?: string;
  quantity: number;
  scrap_type?: string;
  reason?: string;
  operator?: string;
  remark?: string;
  created_at?: string;
}

/** 出入库流水 */
export interface InventoryTransaction {
  id?: string;
  stock_id?: string;
  transaction_type: 'inbound' | 'outbound';
  stock_type?: StockType;
  material_code: string;
  material_name?: string;
  quantity: number;
  unit: string;
  related_barcode?: string;
  card_id?: string;
  operator?: string;
  transaction_time: string;
  remark?: string;
  created_at?: string;
}

/** 呼叫日志 */
export interface NotificationLog {
  id?: string;
  station_code: string;
  caller_id: string;
  call_type: CallType;
  callee_type?: CalleeType;
  description?: string;
  status?: string;
  accepted_at?: string;
  resolved_at?: string;
  created_at?: string;
}

/** 形迹托盘模版 */
export interface TrayTemplate {
  id?: string;
  template_code: string;
  name: string;
  tray_photo_object_id?: string;
  version?: number;
  status?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

/** 形迹槽位 */
export interface TraySlot {
  id?: string;
  template_id: string;
  slot_code: string;
  material_code: string;
  material_name?: string;
  shape_type?: 'circle' | 'square' | 'custom';
  coordinates?: { x: number; y: number; r?: number; points?: Array<[number, number]> };
  filled?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

// ============ 检测结果（存 WorkCard.inspection_result JSON 字段）============

/** 单条检测结果 */
export interface InspectionResultItem {
  item_code: string;
  measured_value?: number;
  result: InspectionResult; // qualified / unqualified / pending
  photo_object_ids?: string[];
  collected_at?: string; // 采集时间
  collected_by?: 'auto' | 'manual';
}

/** 工卡检测结果汇总（存 WorkCard.inspection_result） */
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
  raw: string; // base64
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
  /** 启动时是否默认全屏（未单独设置主/副屏全屏习惯时生效） */
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
  /** 主屏是否全屏（运行时偏好，可持久化） */
  main_fullscreen?: boolean;
  /** 副屏是否全屏（运行时偏好，可持久化） */
  secondary_fullscreen?: boolean;
}
