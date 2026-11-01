/**
 * 工位 BFF 仍对页面使用原来的字段名。
 * 这里把它们换成 IPS 实体的 camelCase，并把工卡、委外状态换成 IPS 枚举。
 */
import { randomUUID } from 'node:crypto';
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
  TrayHotZone,
  AgvTask,
  WorkCardStatus,
} from '@fmms/shared';

export type Row = Record<string, unknown>;

/** 种子和工位自建工卡没有排产订单时使用的占位。工序实例每次新建，避免唯一约束冲突。 */
export const PLACEHOLDER_WORKSHOP_ORDER = '00000000-0000-4000-8000-0000000000aa';
export const PLACEHOLDER_STEP = '00000000-0000-4000-8000-0000000000bb';

const TO_CARD_STATUS: Record<string, string> = {
  pending: 'PENDING_ACCEPT',
  in_progress: 'REPAIRING',
  completed: 'REPAIR_DONE',
  cancelled: 'CANCELLED',
};

const FROM_CARD_STATUS: Record<string, WorkCardStatus> = {
  PENDING_ACCEPT: 'pending',
  PENDING_REPAIR: 'pending',
  PENDING_EFFECTIVE: 'pending',
  KIT_SUSPENDED: 'pending',
  LOAD_SUSPENDED: 'pending',
  REPAIRING: 'in_progress',
  REPAIR_DONE: 'completed',
  CANCELLED: 'cancelled',
};

const TO_OUTSOURCE: Record<string, string> = {
  pending: 'ISSUED',
  created: 'ISSUED',
  sent: 'ISSUED',
  shipped: 'ISSUED',
  received: 'RETURNED',
  returned: 'RETURNED',
  completed: 'ACCEPTED',
  cancelled: 'CANCELLED',
  in_progress: 'IN_PROGRESS',
};

const FROM_OUTSOURCE: Record<string, string> = {
  ISSUED: 'created',
  IN_PROGRESS: 'created',
  RETURNED: 'received',
  ACCEPTED: 'completed',
  CANCELLED: 'cancelled',
};

export function compact(row: Row): Row {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

function text(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  return String(value);
}

function num(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function bool(value: unknown): boolean | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return Boolean(value);
}

function jsonText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function parseJson(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function toCardStatus(status: string | undefined): string | undefined {
  if (!status) return undefined;
  return TO_CARD_STATUS[status] ?? status;
}

export function fromCardStatus(status: unknown): WorkCardStatus {
  const raw = text(status) ?? 'pending';
  return FROM_CARD_STATUS[raw] ?? (raw as WorkCardStatus);
}

export function mapWorkCard(row: Row): WorkCard {
  return {
    id: text(row.id),
    card_code: text(row.workCardNo) ?? '',
    card_name: text(row.name) ?? '',
    station_type: text(row.stationType) ?? '',
    wbs_node_id: text(row.wbsNodeId),
    status: fromCardStatus(row.status),
    accept_operator_name: text(row.acceptOperatorName),
    accept_time: text(row.acceptedAt),
    start_time: text(row.repairStartedAt),
    complete_time: text(row.repairFinishedAt),
    progress: num(row.progress),
    qualified_parts: num(row.qualifiedCount),
    unqualified_parts: num(row.unqualifiedCount),
    current_station_id: text(row.workstationId),
    remark: text(row.remark),
    created_at: text(row.created_at) ?? text(row.createdAt),
    updated_at: text(row.updated_at) ?? text(row.updatedAt),
  };
}

export function toWorkCard(body: Partial<WorkCard> & { workshop_order_id?: string; bop_instance_id?: string }, creating: boolean): Row {
  const row: Row = {
    workCardNo: body.card_code,
    name: body.card_name,
    stationType: body.station_type,
    status: toCardStatus(body.status),
    acceptOperatorName: body.accept_operator_name,
    acceptedAt: body.accept_time,
    repairStartedAt: body.start_time,
    repairFinishedAt: body.complete_time,
    progress: body.progress,
    qualifiedCount: body.qualified_parts,
    unqualifiedCount: body.unqualified_parts,
    workstationId: body.current_station_id,
    wbsNodeId: body.wbs_node_id,
    remark: body.remark,
  };
  if (creating) {
    row.workshopOrderId = body.workshop_order_id || PLACEHOLDER_WORKSHOP_ORDER;
    if (body.bop_instance_id) row.bopInstanceId = body.bop_instance_id;
    row.operationInstanceId = randomUUID();
    row.isRoutine = false;
    row.kitRequired = false;
    row.priority = 'ROUTINE';
    row.occupiesPipeline = false;
    if (!row.status) row.status = 'PENDING_ACCEPT';
    if (!row.name) row.name = row.workCardNo;
  }
  return compact(row);
}

export function mapWorkstation(row: Row): Workstation {
  return {
    id: text(row.id),
    station_code: text(row.stationNo) ?? '',
    station_name: text(row.name) ?? '',
    station_type: (text(row.stationType) ?? text(row.areaType) ?? 'sorting') as Workstation['station_type'],
    location: text(row.location),
    ip_address: text(row.ipAddress),
    is_active: bool(row.enabled),
    remark: text(row.remark),
    created_at: text(row.created_at) ?? text(row.createdAt),
    updated_at: text(row.updated_at) ?? text(row.updatedAt),
  };
}

export function toWorkstation(
  body: Partial<Workstation> & { station_code?: string; station_name?: string; station_type?: string },
  creating: boolean,
): Row {
  const row: Row = {
    stationNo: body.station_code,
    name: body.station_name,
    stationType: body.station_type,
    location: body.location,
    ipAddress: body.ip_address,
    enabled: body.is_active,
    remark: body.remark,
  };
  if (creating) {
    row.areaType = 'FAULT_REPAIR';
    row.dailyLoadHours = 8;
    row.pipelineCapacityFactor = 1;
    if (row.enabled == null) row.enabled = true;
  }
  return compact(row);
}

export function mapWbs(row: Row): WbsNode {
  return {
    id: text(row.id),
    wbs_code: text(row.code) ?? '',
    wbs_name: text(row.name) ?? '',
    parent_id: text(row.parentId),
    node_level: num(row.level) ?? 0,
    sort_order: num(row.sortOrder),
    process_name: text(row.processName),
    process_description: text(row.processDescription),
    estimated_minutes: num(row.estimatedMinutes),
    workstation_type: text(row.workstationType),
    remark: text(row.remark),
    created_at: text(row.created_at) ?? text(row.createdAt),
    updated_at: text(row.updated_at) ?? text(row.updatedAt),
  };
}

export function toWbs(body: Partial<WbsNode>, creating: boolean): Row {
  const row: Row = {
    code: body.wbs_code,
    name: body.wbs_name,
    parentId: body.parent_id,
    level: body.node_level,
    sortOrder: body.sort_order,
    processName: body.process_name,
    processDescription: body.process_description,
    estimatedMinutes: body.estimated_minutes,
    workstationType: body.workstation_type,
    remark: body.remark,
  };
  if (creating) {
    row.nodeType = 'TASK';
    row.workshopOrderId = PLACEHOLDER_WORKSHOP_ORDER;
    row.isRoutine = false;
    row.isMaterialBundle = false;
    if (row.level == null) row.level = 1;
    if (!row.name) row.name = row.code;
  }
  return compact(row);
}

export function mapPart(row: Row): WorkCardPart {
  return {
    id: text(row.id),
    work_card_id: text(row.workCardId) ?? '',
    part_code: text(row.partCode) ?? '',
    part_name: text(row.partName) ?? '',
    barcode: text(row.barcode),
    quantity: num(row.quantity) ?? 1,
    status: (text(row.status) ?? 'pending') as WorkCardPart['status'],
    disposal_result: text(row.disposalResult) as WorkCardPart['disposal_result'],
    remark: text(row.remark),
    created_at: text(row.created_at) ?? text(row.createdAt),
    updated_at: text(row.updated_at) ?? text(row.updatedAt),
  };
}

export function toPart(body: Partial<WorkCardPart>): Row {
  return compact({
    workCardId: body.work_card_id,
    partCode: body.part_code,
    partName: body.part_name,
    barcode: body.barcode,
    quantity: body.quantity,
    status: body.status,
    disposalResult: body.disposal_result,
    remark: body.remark,
  });
}

export function mapInspectionItem(row: Row): InspectionItem {
  return {
    id: text(row.id),
    item_code: text(row.itemCode) ?? text(row.bizNo) ?? '',
    item_name: text(row.name) ?? '',
    wbs_node_id: text(row.wbsNodeId),
    part_code: text(row.partCode),
    measure_tool_code: text(row.measureToolCode),
    nominal_value: num(row.nominalValue),
    upper_tolerance: num(row.upperTolerance),
    lower_tolerance: num(row.lowerTolerance),
    unit: text(row.unit),
    sort_order: num(row.sortOrder),
    require_photo: bool(row.requirePhoto),
    inspection_method: text(row.inspectionMethod) ?? text(row.inspectionType),
    quality_criteria: text(row.qualityCriteria),
    remark: text(row.remark),
    created_at: text(row.created_at) ?? text(row.createdAt),
    updated_at: text(row.updated_at) ?? text(row.updatedAt),
  };
}

export function toInspectionItem(body: Partial<InspectionItem>, creating: boolean): Row {
  const method = body.inspection_method;
  const row: Row = {
    itemCode: body.item_code,
    bizNo: body.item_code,
    name: body.item_name,
    wbsNodeId: body.wbs_node_id,
    partCode: body.part_code,
    measureToolCode: body.measure_tool_code,
    nominalValue: body.nominal_value,
    upperTolerance: body.upper_tolerance,
    lowerTolerance: body.lower_tolerance,
    unit: body.unit,
    sortOrder: body.sort_order,
    requirePhoto: body.require_photo,
    inspectionMethod: method,
    qualityCriteria: body.quality_criteria,
    remark: body.remark,
  };
  if (creating) {
    row.inspectionType = method === 'manual' ? 'manual' : 'tolerance';
    row.processStepId = PLACEHOLDER_STEP;
    if (row.sortOrder == null) row.sortOrder = 0;
    if (!row.name) row.name = row.itemCode;
  }
  return compact(row);
}

export function mapInspectionRecord(row: Row): InspectionRecord {
  return {
    id: text(row.id),
    work_card_id: text(row.workCardId),
    inspection_item_id: text(row.inspectionItemId),
    result: text(row.result) as InspectionRecord['result'],
    measured_value: num(row.measuredValue),
    operator_name: text(row.inspector),
    inspect_time: text(row.inspectedAt),
    photo_object_id: text(row.photoObjectId),
    remark: text(row.remark),
    created_at: text(row.created_at) ?? text(row.createdAt),
    updated_at: text(row.updated_at) ?? text(row.updatedAt),
  };
}

export function toInspectionRecord(body: Partial<InspectionRecord>, creating: boolean): Row {
  const row: Row = {
    workCardId: body.work_card_id,
    inspectionItemId: body.inspection_item_id,
    result: body.result,
    measuredValue: body.measured_value,
    inspector: body.operator_name,
    inspectedAt: body.inspect_time,
    photoObjectId: body.photo_object_id,
    remark: body.remark,
  };
  if (creating) {
    row.stepInstanceId = PLACEHOLDER_STEP;
    if (!row.inspectionItemId) row.inspectionItemId = PLACEHOLDER_STEP;
    if (!row.result) row.result = 'pending';
  }
  return compact(row);
}

export function mapTool(row: Row): MeasuringTool {
  return {
    id: text(row.id),
    tool_code: text(row.bizNo) ?? text(row.serialNo) ?? '',
    tool_name: text(row.name) ?? '',
    tool_model: text(row.model),
    connection_params: parseJson(row.connectionParams),
    status: text(row.status) === 'normal' ? 'online' : text(row.status) === 'fault' ? 'offline' : text(row.status),
    calibration_date: text(row.calibrationDate),
    remark: text(row.remark),
    created_at: text(row.created_at) ?? text(row.createdAt),
    updated_at: text(row.updated_at) ?? text(row.updatedAt),
  };
}

const TO_TOOL_STATUS: Record<string, string> = {
  online: 'normal',
  offline: 'fault',
  normal: 'normal',
  fault: 'fault',
  pending_calibration: 'pending_calibration',
};

export function toTool(body: Partial<MeasuringTool>, creating: boolean): Row {
  const row: Row = {
    bizNo: body.tool_code,
    serialNo: body.tool_code,
    name: body.tool_name,
    model: body.tool_model,
    connectionParams: jsonText(body.connection_params),
    status: body.status ? (TO_TOOL_STATUS[body.status] ?? body.status) : undefined,
    calibrationDate: body.calibration_date,
    remark: body.remark,
  };
  if (creating && !row.status) row.status = 'normal';
  return compact(row);
}

export function mapStock(row: Row): LineStock {
  return {
    id: text(row.id),
    stock_code: text(row.stockCode) ?? '',
    stock_name: text(row.stockName) ?? '',
    stock_type: (text(row.stockType) ?? 'staging') as LineStock['stock_type'],
    location: text(row.location),
    is_active: bool(row.isActive),
    remark: text(row.remark),
    created_at: text(row.created_at) ?? text(row.createdAt),
    updated_at: text(row.updated_at) ?? text(row.updatedAt),
  };
}

export function toStock(body: Partial<LineStock>): Row {
  return compact({
    stockCode: body.stock_code,
    stockName: body.stock_name,
    stockType: body.stock_type,
    location: body.location,
    isActive: body.is_active,
    remark: body.remark,
  });
}

export function mapStockItem(row: Row): LineStockItem {
  return {
    id: text(row.id),
    stock_id: text(row.stockId) ?? '',
    part_code: text(row.partCode) ?? '',
    part_name: text(row.partName),
    quantity: num(row.quantity) ?? 0,
    remark: text(row.remark),
    created_at: text(row.created_at) ?? text(row.createdAt),
    updated_at: text(row.updated_at) ?? text(row.updatedAt),
  };
}

export function toStockItem(body: Partial<LineStockItem>): Row {
  return compact({
    stockId: body.stock_id,
    partCode: body.part_code,
    partName: body.part_name,
    quantity: body.quantity,
    remark: body.remark,
  });
}

export function mapOutsource(row: Row): OutsourceOrder {
  const status = text(row.status) ?? 'ISSUED';
  return {
    id: text(row.id),
    order_no: text(row.orderNo) ?? '',
    workCardId: text(row.workCardId),
    operator_name: text(row.operatorName),
    outsource_company: text(row.name),
    outsource_status: FROM_OUTSOURCE[status] ?? status,
    part_code: text(row.partCode) ?? '',
    part_name: text(row.partName),
    quantity: num(row.quantity) ?? 1,
    send_date: text(row.issuedAt),
    receive_date: text(row.returnedAt),
    remark: text(row.remark),
    created_at: text(row.created_at) ?? text(row.createdAt),
    updated_at: text(row.updated_at) ?? text(row.updatedAt),
  };
}

export function toOutsource(body: Partial<OutsourceOrder>, creating: boolean): Row {
  const row: Row = {
    orderNo: body.order_no,
    workCardId: body.workCardId,
    name: body.outsource_company,
    operatorName: body.operator_name,
    status: body.outsource_status ? (TO_OUTSOURCE[body.outsource_status] ?? body.outsource_status) : undefined,
    partCode: body.part_code,
    partName: body.part_name,
    quantity: body.quantity,
    issuedAt: body.send_date,
    returnedAt: body.receive_date,
    remark: body.remark,
  };
  if (creating) {
    if (!row.workCardId) row.workCardId = PLACEHOLDER_WORKSHOP_ORDER;
    if (!row.status) row.status = 'ISSUED';
  }
  return compact(row);
}

export function mapScrap(row: Row): ScrapRecord {
  return {
    id: text(row.id),
    scrap_no: text(row.scrapNo) ?? '',
    work_card_id: text(row.workCardId),
    part_code: text(row.partCode),
    part_name: text(row.partName),
    quantity: num(row.quantity) ?? 0,
    scrap_reason: text(row.scrapReason),
    scrap_time: text(row.scrapTime) ?? '',
    remark: text(row.remark),
    created_at: text(row.created_at) ?? text(row.createdAt),
    updated_at: text(row.updated_at) ?? text(row.updatedAt),
  };
}

export function toScrap(body: Partial<ScrapRecord>): Row {
  return compact({
    scrapNo: body.scrap_no,
    workCardId: body.work_card_id,
    partCode: body.part_code,
    partName: body.part_name,
    quantity: body.quantity,
    scrapReason: body.scrap_reason ?? body.remark,
    scrapTime: body.scrap_time,
    remark: body.remark,
  });
}

export function mapTx(row: Row): InventoryTransaction {
  return {
    id: text(row.id),
    transaction_no: text(row.transactionNo) ?? '',
    stock_id: text(row.stockId),
    part_code: text(row.partCode) ?? '',
    part_name: text(row.partName),
    transaction_type: text(row.transactionType) ?? '',
    quantity: num(row.quantity) ?? 0,
    operator_name: text(row.operatorName),
    transaction_time: text(row.transactionTime) ?? '',
    remark: text(row.remark),
    created_at: text(row.created_at) ?? text(row.createdAt),
    updated_at: text(row.updated_at) ?? text(row.updatedAt),
  };
}

export function toTx(body: Partial<InventoryTransaction>): Row {
  return compact({
    transactionNo: body.transaction_no,
    stockId: body.stock_id,
    partCode: body.part_code,
    partName: body.part_name,
    transactionType: body.transaction_type,
    quantity: body.quantity,
    operatorName: body.operator_name,
    transactionTime: body.transaction_time,
    remark: body.remark,
  });
}

export function mapCall(row: Row): NotificationLog {
  return {
    id: text(row.id),
    workstation_id: text(row.workstationId),
    call_type: text(row.callType) ?? '',
    call_content: text(row.callContent),
    call_time: text(row.callTime) ?? '',
    caller_name: text(row.callerName),
    is_responded: bool(row.isResponded) ?? false,
    status: text(row.status) || 'sent',
    accepted_by: text(row.acceptedBy),
    accepted_at: text(row.acceptedAt),
    completed_at: text(row.completedAt),
    remark: text(row.remark),
    created_at: text(row.created_at) ?? text(row.createdAt),
    updated_at: text(row.updated_at) ?? text(row.updatedAt),
  };
}

export function toCall(body: Partial<NotificationLog>): Row {
  return compact({
    workstationId: body.workstation_id,
    callType: body.call_type,
    callContent: body.call_content,
    callTime: body.call_time,
    callerName: body.caller_name,
    isResponded: body.is_responded,
    status: body.status,
    remark: body.remark,
  });
}

export function mapTray(row: Row): TrayTemplate {
  return {
    id: text(row.id),
    template_code: text(row.templateCode) ?? '',
    template_name: text(row.templateName) ?? text(row.name) ?? '',
    workstation_type: text(row.workstationType),
    trayPhotoObjectId: text(row.photoObjectId),
    status: text(row.status),
    bop_scheme_id: text(row.bopSchemeId),
    material_class_id: text(row.materialClassId),
    created_at: text(row.created_at) ?? text(row.createdAt),
    updated_at: text(row.updated_at) ?? text(row.updatedAt),
  };
}

export function toTray(body: Partial<TrayTemplate>): Row {
  return compact({
    templateCode: body.template_code,
    templateName: body.template_name,
    workstationType: body.workstation_type,
  });
}

function parseHotZone(value: unknown): TrayHotZone | undefined {
  if (!value) return undefined;
  try {
    const raw = typeof value === 'string'
      ? JSON.parse(value) as Partial<TrayHotZone>
      : value as Partial<TrayHotZone>;
    if (![raw.x, raw.y, raw.w, raw.h].every((n) => Number.isFinite(n))) return undefined;
    return {
      shape: raw.shape === 'circle' || raw.shape === 'rect' ? raw.shape : 'square',
      x: Number(raw.x),
      y: Number(raw.y),
      w: Number(raw.w),
      h: Number(raw.h),
    };
  } catch {
    return undefined;
  }
}

export function mapSlot(row: Row): TraySlot {
  const zone = parseHotZone(row.hotZone);
  return {
    id: text(row.id),
    template_id: text(row.templateId) ?? '',
    slot_code: text(row.slotCode) ?? text(row.partCode) ?? text(row.id) ?? '',
    part_code: text(row.partCode),
    material_id: text(row.materialId),
    instance_no: num(row.instanceNo),
    hot_zone: zone,
    slot_shape: 'rect',
    position_x: zone?.x,
    position_y: zone?.y,
    width: zone?.w,
    height: zone?.h,
    required: bool(row.required) ?? true,
    slotStatus: text(row.slotStatus),
    sort_order: num(row.sortOrder) ?? 0,
    created_at: text(row.created_at) ?? text(row.createdAt),
    updated_at: text(row.updated_at) ?? text(row.updatedAt),
  };
}

export function toSlot(body: Partial<TraySlot>): Row {
  return compact({
    templateId: body.template_id,
    partCode: body.part_code ?? body.slot_code,
    materialId: body.material_id,
    instanceNo: body.instance_no,
    slotCode: body.slot_code,
    hotZone: body.hot_zone ? JSON.stringify(body.hot_zone) : undefined,
    required: body.required,
    slotStatus: body.slotStatus,
    sortOrder: body.sort_order,
  });
}

export function mapAgv(row: Row): AgvTask {
  return {
    id: text(row.id),
    taskNo: text(row.taskNo) ?? '',
    fromStation: text(row.fromStation) ?? '',
    toStation: text(row.toStation) ?? '',
    status: text(row.status) ?? '',
    remark: text(row.remark),
  };
}

export function toAgv(body: Partial<AgvTask>): Row {
  return compact({
    taskNo: body.taskNo,
    fromStation: body.fromStation,
    toStation: body.toStation,
    status: body.status,
    remark: body.remark,
  });
}
