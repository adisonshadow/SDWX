/**
 * FMMS 全局常量定义
 * 对齐 EADAF apis.json 实际字段值 + 5702demo 状态命名
 */

// ---- 工位类型 ----
export const WORKSTATION_TYPES = [
  'sorting', // 分拣
  'inspection_small', // 故检1（小件）
  'inspection_large', // 故检2（大/小件）
  'repair', // 修理
  'receive_send', // 收发
] as const;
export type WorkstationType = (typeof WORKSTATION_TYPES)[number];

export const WORKSTATION_TYPE_LABELS: Record<WorkstationType, string> = {
  sorting: '分拣',
  inspection_small: '故检1（小件）',
  inspection_large: '故检2（大/小件）',
  repair: '修理',
  receive_send: '收发',
};

// ---- 工卡状态（对齐 demo: unaccepted/pending/processing/completed）----
export const WORK_CARD_STATUSES = ['unaccepted', 'pending', 'processing', 'completed'] as const;
export type WorkCardStatus = (typeof WORK_CARD_STATUSES)[number];

export const WORK_CARD_STATUS_LABELS: Record<WorkCardStatus, string> = {
  unaccepted: '未接受',
  pending: '待处理',
  processing: '处理中',
  completed: '已完成',
};

// ---- 零部件状态 ----
export const PART_STATUSES = [
  'pending', // 待处理
  'checking', // 检测中（对齐 demo 用 checking 而非 inspecting）
  'done', // 检测完成
] as const;
export type PartStatus = (typeof PART_STATUSES)[number];

export const PART_STATUS_LABELS: Record<PartStatus, string> = {
  pending: '待处理',
  checking: '检测中',
  done: '检测完成',
};

// ---- 处置结果 ----
export const DISPOSAL_RESULTS = ['qualified', 'repair', 'outsource', 'scrap'] as const;
export type DisposalResult = (typeof DISPOSAL_RESULTS)[number];

export const DISPOSAL_RESULT_LABELS: Record<DisposalResult, string> = {
  qualified: '合格',
  repair: '修理',
  outsource: '委外',
  scrap: '报废',
};

// ---- 检测判定结果 ----
export const INSPECTION_RESULTS = ['qualified', 'unqualified', 'pending'] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

// ---- 异常呼叫类型 ----
export const CALL_TYPES = ['tool_fault', 'equipment_fault', 'tech_help', 'personnel', 'material'] as const;
export type CallType = (typeof CALL_TYPES)[number];

export const CALL_TYPE_LABELS: Record<CallType, string> = {
  tool_fault: '设备故障',
  equipment_fault: '设备故障',
  tech_help: '技术求助',
  personnel: '人员异常',
  material: '物料异常',
};

// ---- 呼叫被叫对象 ----
export const CALLEE_TYPES = ['engineer', 'manager'] as const;
export type CalleeType = (typeof CALLEE_TYPES)[number];

export const CALLEE_TYPE_LABELS: Record<CalleeType, string> = {
  engineer: '工程师',
  manager: '管理人员',
};

// ---- 线边库类型 ----
export const STOCK_TYPES = ['outsource_cache', 'staging', 'scrap'] as const;
export type StockType = (typeof STOCK_TYPES)[number];

export const STOCK_TYPE_LABELS: Record<StockType, string> = {
  outsource_cache: '待委外缓存',
  staging: '零件暂存',
  scrap: '报废',
};

/**
 * EADAF 子 Scope（对齐 apis.json 中 fmms/{scope}/ 路径段）
 */
export const EADAF_SCOPES = {
  logistics: 'fmms/logistics',
  production: 'fmms/production',
  quality: 'fmms/quality',
  tooling: 'fmms/tooling',
} as const;

/**
 * EADAF 业务数据 API routePath（fmms/{scope}/{Entity}，对齐 apis.json）
 * 集中管理，routePath 变化时只改这里
 */
export const EADAF_ROUTES = {
  // 已有 6 实体（已发布，见 applications-public/FMMS/apis.json）
  workCard: `${EADAF_SCOPES.production}/WorkCard`,
  workstation: `${EADAF_SCOPES.tooling}/Workstation`,
  wbsNode: `${EADAF_SCOPES.production}/WbsNode`,
  inspectionItem: `${EADAF_SCOPES.quality}/InspectionItem`,
  measuringTool: `${EADAF_SCOPES.tooling}/MeasuringTool`,
  lineStock: `${EADAF_SCOPES.logistics}/LineStock`,
  // 补充实体（待 EADAF 创建，scope 按业务域预分配）
  workCardPart: `${EADAF_SCOPES.production}/WorkCardPart`,
  outsourceOrder: `${EADAF_SCOPES.production}/OutsourceOrder`,
  scrapRecord: `${EADAF_SCOPES.production}/ScrapRecord`,
  inventoryTransaction: `${EADAF_SCOPES.logistics}/InventoryTransaction`,
  notificationLog: `${EADAF_SCOPES.production}/NotificationLog`,
  trayTemplate: `${EADAF_SCOPES.tooling}/TrayTemplate`,
  traySlot: `${EADAF_SCOPES.tooling}/TraySlot`,
} as const;

/**
 * EADAF 操作后缀（拼接到 routePath 后）
 * URL pattern: /api/v1/data/{routePath}{Op}
 * Update/Delete 的 id 在 URL path: /Update/:id, /Delete/:id
 */
export const EADAF_OPS = {
  FIND: 'Find',
  CREATE: 'Create',
  UPDATE: 'Update',
  DELETE: 'Delete',
} as const;

/**
 * 采集管道 routePath
 */
export const INGEST_ROUTE = 'fmms/measurementIngest';

/**
 * WebSocket 事件类型
 */
export const WS_EVENTS = {
  WORKCARD_PUSHED: 'workcard.pushed',
  WORKCARD_STATUS_CHANGED: 'workcard.status.changed',
  WORKCARD_PROGRESS: 'workcard.progress',
  PART_STATUS_CHANGED: 'part.status.changed',
  CALL_RECEIVED: 'call.received',
  COLLECT_FRAME: 'collect.frame',
  TOOL_STATUS: 'tool.status',
  TOOL_ALARM: 'tool.alarm',
  AGV_STATUS: 'agv.status',
} as const;
export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

/**
 * 双屏同步 BroadcastChannel 名称
 */
export const OP_SCREEN_CHANNEL = 'fmms-op';

/**
 * 主副屏标识
 */
export const SCREEN_MODES = { MAIN: 'main', SECONDARY: 'secondary' } as const;
export type ScreenMode = (typeof SCREEN_MODES)[keyof typeof SCREEN_MODES];
