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

// ---- 工卡状态（对齐 EADAF: pending/in_progress/completed/cancelled）----
export const WORK_CARD_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;
export type WorkCardStatus = (typeof WORK_CARD_STATUSES)[number];

export const WORK_CARD_STATUS_LABELS: Record<WorkCardStatus, string> = {
  pending: '待执行',
  in_progress: '执行中',
  completed: '已完成',
  cancelled: '已取消',
};

/**
 * 工卡状态排序优先级（数字小者在前）。
 * 顺序：待执行 pending → 执行中 in_progress → 已完成 completed → 已取消 cancelled
 */
export const WORK_CARD_STATUS_PRIORITY: Record<WorkCardStatus, number> = {
  pending: 1,
  in_progress: 2,
  completed: 3,
  cancelled: 4,
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

// ---- 委外状态 ----
export const OUTSOURCE_STATUSES = ['pending', 'sent', 'received', 'cancelled'] as const;
export type OutsourceStatus = (typeof OUTSOURCE_STATUSES)[number];

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
  service: 'fmms/service',
  tooling: 'fmms/tooling',
} as const;

/**
 * EADAF 业务数据 API routePath（fmms/{scope}/{Entity}，对齐 apis.json）
 * 集中管理，routePath 变化时只改这里
 */
export const EADAF_ROUTES = {
  // 对齐 applications-public/FMMS/apis.json
  workCard: `${EADAF_SCOPES.production}/WorkCard`,
  workstation: `${EADAF_SCOPES.tooling}/Workstation`,
  wbsNode: `${EADAF_SCOPES.production}/WbsNode`,
  inspectionItem: `${EADAF_SCOPES.quality}/InspectionItem`,
  inspectionRecord: `${EADAF_SCOPES.quality}/InspectionRecord`,
  measuringTool: `${EADAF_SCOPES.tooling}/MeasuringTool`,
  lineStock: `${EADAF_SCOPES.logistics}/LineStock`,
  lineStockItem: `${EADAF_SCOPES.logistics}/LineStockItem`,
  workCardPart: `${EADAF_SCOPES.production}/WorkCardPart`,
  outsourceOrder: `${EADAF_SCOPES.service}/OutsourceOrder`,
  scrapRecord: `${EADAF_SCOPES.service}/ScrapRecord`,
  inventoryTransaction: `${EADAF_SCOPES.logistics}/InventoryTransaction`,
  notificationLog: `${EADAF_SCOPES.service}/NotificationLog`,
  trayTemplate: `${EADAF_SCOPES.logistics}/TrayTemplate`,
  traySlot: `${EADAF_SCOPES.logistics}/TraySlot`,
  bop: `${EADAF_SCOPES.production}/Bop`,
  workStep: `${EADAF_SCOPES.production}/WorkStep`,
  agvTask: `${EADAF_SCOPES.service}/AgvTask`,
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
