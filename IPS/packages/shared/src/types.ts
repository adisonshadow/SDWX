/**
 * @ips/shared — 共享类型定义
 *
 * 字段命名约定：主业务模块一律 camelCase（与 IPS apis.json 一致）。
 * snake_case 例外模块：scheduling、capacity、craft 模板、analytics、monitor。
 * 所有实体继承 IpsBaseEntity（id? 可选，由 EADAF 生成）。
 */

// ============ 响应信封 ============

/** EADAF 标准响应信封 */
export interface EadafEnvelope<T = unknown> {
  code: number;
  message: string;
  data: T;
}

/** Find 列表分页元数据（对齐 IPS apis.json data.pagination） */
export interface FindPagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
}

/** Find 列表查询结果（兼容旧 total/page/size 与新 pagination） */
export interface FindResult<T> {
  items: T[];
  total: number;
  page?: number;
  size?: number;
  pageSize?: number;
  totalPages?: number;
  hasNext?: boolean;
  pagination?: FindPagination;
}

/** Find 查询参数 */
export interface FindParams {
  limit?: number;
  skip?: number;
  filter?: Record<string, unknown>;
  /** status 字段便捷入口（优先级高于 filter.status） */
  status?: string;
}

/** Update 响应（data 形态） */
export interface UpdateResult<T> {
  item: T | null;
  matched: number;
}

// ============ WebSocket ============

export interface WsMessage<T = unknown> {
  type: string;
  payload?: T;
  /** 可选：限定广播工位 */
  workstationCode?: string;
}

// ============ SSO ============

/** SSO 用户信息（JWT payload） */
export interface SsoUserInfo {
  user_id?: string;
  id?: string;
  username?: string;
  name?: string;
  email?: string;
  department_id?: string;
  [key: string]: unknown;
}

// ============ 业务实体基类 ============

/** 业务实体基类（id 由 EADAF 生成，前端侧可选） */
export interface IpsBaseEntity {
  id?: string;
  bizNo?: string | null;
  name?: string | null;
  remark?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// ═══════════════════════════════════════════
// master 主数据
// ═══════════════════════════════════════════

/** ips:master:Product 产品 */
export interface Product extends IpsBaseEntity {
  productNo: string;
  model?: string | null;
  batchSerial?: string | null;
  historyBookNo?: string | null;
}

/** ips:master:Material 物料 */
export interface Material extends IpsBaseEntity {
  materialNo: string;
  nodeType: string; // MaterialNodeType
  independentRepair: boolean;
}

/** ips:master:Workstation 工位 */
export interface Workstation extends IpsBaseEntity {
  stationNo: string;
  areaType: string; // WorkAreaType
  dailyLoadHours?: string | number | null;
  pipelineCapacityFactor?: string | number | null;
  enabled?: boolean;
  /** 工位执行类型：sorting / inspection_small / inspection_large / repair / receive_send */
  stationType?: string | null;
  location?: string | null;
  ipAddress?: string | null;
}

/** ips:master:RepairResource 维修资源 */
export interface RepairResource extends IpsBaseEntity {
  resourceNo: string;
  resourceType: string; // ResourceType
  defaultWorkstationId?: string | null;
}

/** ips:master:MeasurementEquipment 测量设备 */
export interface MeasurementEquipment extends IpsBaseEntity {
  bizNo?: string | null;
  model?: string | null;
  serialNo?: string | null;
  status?: string | null; // MeasurementEquipmentStatus
  calibrationDate?: string | null;
  calibrationCycle?: number | null;
  /** 串口、地址等连接参数，JSON 文本 */
  connectionParams?: string | null;
}

// ═══════════════════════════════════════════
// process 工艺
// ═══════════════════════════════════════════

/** ips:process:ProcessOperation 工序定义 */
export interface ProcessOperation extends IpsBaseEntity {
  operationNo: string;
  version?: number;
  versionStatus?: string; // VersionStatus
  category?: string; // OperationCategory
  standardHours?: string | number | null;
  prepareHours?: string | number | null;
  assistHours?: string | number | null;
  kitRequired?: boolean;
  defaultWorkstationId?: string | null;
}

/** ips:process:ProcessStep 工步定义 */
export interface ProcessStep extends IpsBaseEntity {
  operationId: string;
  stepNo: string;
  sortOrder?: number;
  isInspectionPoint?: boolean;
  isMandatoryInspection?: boolean;
  inspectionSpec?: string | null;
  standardHours?: string | number | null;
}

/** ips:process:ProcessStepEdge 工步 DAG 边 */
export interface ProcessStepEdge extends IpsBaseEntity {
  fromStepId: string;
  toStepId: string;
  edgeType: string; // DagEdgeType
}

/** ips:process:ProcessOperationMaterial 工序物料 */
export interface ProcessOperationMaterial extends IpsBaseEntity {
  operationId: string;
  materialId: string;
  quantity?: string | number;
  isCollaboration?: boolean;
  kitCheck?: boolean;
}

// ═══════════════════════════════════════════
// inspection 测量检验
// ═══════════════════════════════════════════

/** ips:inspection:InspectionItem 检验项定义 */
export interface InspectionItem extends IpsBaseEntity {
  bizNo?: string | null;
  processStepId: string;
  inspectionType: string; // InspectionType: manual | tolerance
  sortOrder?: number;
  nominalValue?: number | null;
  upperTolerance?: number | null;
  lowerTolerance?: number | null;
  unit?: string | null;
  itemCode?: string | null;
  partCode?: string | null;
  wbsNodeId?: string | null;
  measureToolCode?: string | null;
  requirePhoto?: boolean | null;
  inspectionMethod?: string | null;
  qualityCriteria?: string | null;
}

/** ips:inspection:InspectionRecord 检验记录 */
export interface InspectionRecord extends IpsBaseEntity {
  bizNo?: string | null;
  stepInstanceId: string;
  inspectionItemId: string;
  measuredValue?: number | null;
  result?: string | null; // InspectionResult
  defectDescription?: string | null;
  /** 拍照图片地址（JSON 数组或对象） */
  imageUrls?: string[] | Record<string, unknown> | null;
  equipmentId?: string | null;
  inspector?: string | null;
  inspectedAt?: string | null;
  photoObjectId?: string | null;
  workCardId?: string | null;
}

/** ips:craft:ProcessTemplate 工艺路线模板（snake_case） */
export interface ProcessTemplate extends IpsBaseEntity {
  template_code?: string;
  template_name?: string;
  aircraft_model?: string | null;
  gear_model?: string | null;
  repair_type?: string | null;
  version?: number | string | null;
  total_standard_hours?: string | number | null;
  description?: string | null;
  is_active?: boolean;
  remark?: string | null;
}

/** ips:craft:WorkCardTemplate 工卡模板（snake_case） */
export interface WorkCardTemplate extends IpsBaseEntity {
  card_template_code?: string;
  card_template_name?: string;
  card_type?: string | null;
  description?: string | null;
  kit_check_dimensions?: string | null;
  required_staff_count?: number | null;
  skill_requirement?: string | null;
  sort_order?: number | null;
  standard_hours?: string | number | null;
  work_step_count?: number | null;
  /** 是否启用 */
  is_active?: boolean;
  remark?: string | null;
}

/** ips:process:BopScheme BOP 方案 */
export interface BopScheme extends IpsBaseEntity {
  productModel: string;
  batchSerial?: string | null;
  repairMethod: string; // RepairMethod
  version?: number;
  versionStatus?: string; // VersionStatus
  bomSchemeId?: string | null;
  clonedFromId?: string | null;
}

/** ips:process:BopOperationNode BOP 工序节点 */
export interface BopOperationNode extends IpsBaseEntity {
  bopSchemeId: string;
  nodeNo: string;
  operationId: string;
  materialId?: string | null;
  sortOrder?: number;
}

/** ips:process:BopOperationEdge BOP 工序边 */
export interface BopOperationEdge extends IpsBaseEntity {
  bopSchemeId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: string; // DagEdgeType
}

// ═══════════════════════════════════════════
// bom 物料清单
// ═══════════════════════════════════════════

/** ips:bom:BomScheme BOM 方案 */
export interface BomScheme extends IpsBaseEntity {
  productModel: string;
  version?: number;
  versionStatus?: string; // VersionStatus
}

/** ips:bom:BomSchemeNode BOM 方案节点 */
export interface BomSchemeNode extends IpsBaseEntity {
  bomSchemeId: string;
  materialId?: string | null;
  nodeType: string; // MaterialNodeType
  quantity?: string | number;
  parentId?: string | null;
}

// ═══════════════════════════════════════════
// production 生产实例
// ═══════════════════════════════════════════

/** ips:production:FactoryOrder 厂级指令 */
export interface FactoryOrder extends IpsBaseEntity {
  factoryOrderNo: string;
  aircraftRef?: string | null;
}

/** ips:production:WorkshopOrder 车间令号 */
export interface WorkshopOrder extends IpsBaseEntity {
  workshopOrderNo: string;
  factoryOrderId: string;
  productId: string;
  repairMethod: string; // RepairMethod
  bopSchemeId?: string | null;
  planStartDate?: string | null;
  planEndDate?: string | null;
  status?: string; // WorkshopOrderStatus
}

/** ips:production:BomInstance BOM 实例 */
export interface BomInstance extends IpsBaseEntity {
  workshopOrderId: string;
  bomSchemeId?: string | null;
  frozenSchemeVersion?: number | null;
}

/** ips:production:BomInstanceNode BOM 实例节点 */
export interface BomInstanceNode extends IpsBaseEntity {
  bomInstanceId: string;
  parentId?: string | null;
  materialId?: string | null;
  nodeType: string; // MaterialNodeType
  quantity?: string | number;
}

/** ips:production:BopInstance BOP 实例 */
export interface BopInstance extends IpsBaseEntity {
  workshopOrderId: string;
  bopSchemeId: string;
  frozenSchemeVersion: number;
  bomInstanceId?: string | null;
}

/** ips:production:OperationInstance 工序实例 */
export interface OperationInstance extends IpsBaseEntity {
  bopInstanceId: string;
  processOperationId: string;
  sourceNodeNo?: string | null;
  isRoutine?: boolean;
}

/** ips:production:StepInstance 工步实例 */
export interface StepInstance extends IpsBaseEntity {
  operationInstanceId: string;
  processStepId?: string | null;
  stepNo?: string | null;
  isInspectionPoint?: boolean;
  status?: string; // StepInstanceStatus
  inspectionResult?: string | null; // InspectionResult
}

/** ips:production:WorkCard 工卡 */
export interface WorkCard extends IpsBaseEntity {
  workCardNo: string;
  workshopOrderId: string;
  operationInstanceId: string;
  bopInstanceId?: string | null;
  status?: string; // WorkCardStatus
  isRoutine?: boolean;
  kitRequired?: boolean;
  priority?: string; // SchedulePriority
  workstationId?: string | null;
  pipelineOrder?: number | null;
  occupiesPipeline?: boolean;
  plannedDate?: string | null;
  plannedHalfDay?: string | null; // HalfDay
  standardHours?: string | number | null;
  selectedHours?: string | number | null;
  actualHours?: string | number | null;
  acceptedAt?: string | null;
  repairStartedAt?: string | null;
  repairFinishedAt?: string | null;
  progress?: number | null;
  qualifiedCount?: number | null;
  unqualifiedCount?: number | null;
  acceptOperatorName?: string | null;
  stationType?: string | null;
  wbsNodeId?: string | null;
}

/** ips:production:WorkCardEdge 工卡 DAG 边 */
export interface WorkCardEdge extends IpsBaseEntity {
  fromWorkCardId: string;
  toWorkCardId: string;
  edgeType: string; // DagEdgeType
  isMandatory?: boolean;
}

/** ips:production:WorkCardTask 工卡排产任务 */
export interface WorkCardTask extends IpsBaseEntity {
  workCardId: string;
  singleUnitPlanId: string;
  plannedDate?: string | null;
  plannedHalfDay?: string | null; // HalfDay
  wbsOrder?: number;
}

/** ips:production:SingleUnitPlan 单台排产计划 */
export interface SingleUnitPlan extends IpsBaseEntity {
  workshopOrderId: string;
}

/** ips:production:WorkCardOutsourcing 工卡委外记录 */
export interface WorkCardOutsourcing extends IpsBaseEntity {
  workCardId: string;
  materialId?: string | null;
  status?: string; // OutsourcingStatus
  issuedAt?: string | null;
  returnedAt?: string | null;
  acceptedAt?: string | null;
  orderNo?: string | null;
  partCode?: string | null;
  partName?: string | null;
  quantity?: number | null;
  operatorName?: string | null;
}

/** ips:production:WorkCardKitRequirement 工卡齐套需求 */
export interface WorkCardKitRequirement extends IpsBaseEntity {
  workCardId: string;
  dimension: string; // KitDimension
  materialId?: string | null;
  outsourcingId?: string | null;
  satisfied?: boolean;
}

// ═══════════════════════════════════════════
// schedule 排产基础
// ═══════════════════════════════════════════

/** ips:schedule:ScheduleConfig 排产配置 */
export interface ScheduleConfig extends IpsBaseEntity {
  configKey: string;
  includeSaturday?: boolean;
  includeSunday?: boolean;
  amStart?: string;
  amEnd?: string;
  pmStart?: string;
  pmEnd?: string;
  pipelineCapacityFactor?: string | number;
  effectiveLookaheadSlots?: number;
  preferHistoricalMedian?: boolean;
}

/** ips:schedule:WorkstationCapacity 工位产能记录 */
export interface WorkstationCapacity extends IpsBaseEntity {
  workstationId: string;
  effectiveFrom: string;
  dailyLoadHours: string | number;
  amHours?: string | number | null;
  pmHours?: string | number | null;
  pipelineCapacityFactor?: string | number | null;
}

/** ips:schedule:WorkHourMedian 工时中位数 */
export interface WorkHourMedian extends IpsBaseEntity {
  productModel: string;
  repairMethod: string; // RepairMethod
  processOperationId: string;
  medianHours: string | number;
  sampleCount?: number;
  lastCalculatedAt?: string | null;
}

/** ips:schedule:WorkCardPlanSlot 工卡计划时段 */
export interface WorkCardPlanSlot extends IpsBaseEntity {
  workCardId: string;
  workstationId?: string | null;
  slotDate: string;
  halfDay: string; // HalfDay
  hours?: string | number;
  seq?: number;
}

// ═══════════════════════════════════════════
// capacity 产能配置（字段 snake_case，与 apis.json 一致）
// ═══════════════════════════════════════════

/** ips:capacity:CapacityConfig 产能配置 */
export interface CapacityConfig {
  id?: string;
  config_code: string;
  workstation_id?: string | null;
  standard_half_day_hours?: string | number | null;
  standard_staff_count?: number | null;
  work_hour_conversion_factor?: string | number | null;
  auto_fill_threshold?: string | number | null;
  is_active?: boolean;
  remark?: string | null;
}

// ═══════════════════════════════════════════
// scheduling 排产版本/执行计划（字段 snake_case，与 apis.json 一致）
// ═══════════════════════════════════════════

/** ips:scheduling:PlanVersion 排产版本管理（snake_case 字段） */
export interface PlanVersion {
  id?: string;
  version_code: string;
  version_name: string;
  plan_type?: string | null;
  status?: string | null;
  planning_horizon_start?: string | null;
  planning_horizon_end?: string | null;
  adjustment_reason?: string | null;
  version_notes?: string | null;
  created_by?: string | null;
  created_at?: string;
}

/** ips:scheduling:SchedulePlan 排产计划执行级（snake_case 字段） */
export interface SchedulePlan {
  id?: string;
  plan_code: string;
  plan_name: string;
  plan_type?: string | null;
  status?: string | null;
  workstation_id?: string | null;
  time_slot?: string | null;
  total_hours_planned?: string | number | null;
  total_hours_actual?: string | number | null;
  load_rate?: string | number | null;
  is_conflict?: boolean;
  remark?: string | null;
}

// ═══════════════════════════════════════════
// analytics / monitor（字段 snake_case）
// ═══════════════════════════════════════════

/** ips:analytics:ActualHoursStats 实际工时统计 */
export interface ActualHoursStats {
  id?: string;
  stats_code: string;
  aircraft_model?: string | null;
  repair_type?: string | null;
  card_template_code?: string | null;
  standard_hours?: string | number | null;
  average_actual_hours?: string | number | null;
  min_actual_hours?: string | number | null;
  max_actual_hours?: string | number | null;
  sample_count?: number | null;
  variance?: string | number | null;
  suggested_standard?: string | number | null;
  remark?: string | null;
}

/** ips:monitor:AlertRecord 预警记录 */
export interface AlertRecord {
  id?: string;
  alert_code: string;
  alert_content: string;
  alert_type?: string | null;
  alert_level?: string | null;
  alert_time?: string | null;
  source_entity_code?: string | null;
  is_resolved?: boolean;
  resolution?: string | null;
  remark?: string | null;
}

/** ips:wbs:WbsNode WBS 节点 */
export interface WbsNode extends IpsBaseEntity {
  code: string;
  level: number;
  nodeType: string; // WbsNodeType
  parentId?: string | null;
  mpath?: string | null;
  sortOrder?: number;
  workshopOrderId: string;
  singleUnitPlanId?: string | null;
  workstationId?: string | null;
  workCardTaskId?: string | null;
  operationInstanceId?: string | null;
  isRoutine: boolean;
  isMaterialBundle?: boolean;
  status?: string; // WorkCardStatus
  processName?: string | null;
  processDescription?: string | null;
  estimatedMinutes?: number | null;
  workstationType?: string | null;
}

/** ips:production:WorkCardPart 工卡上的零件执行 */
export interface WorkCardPart extends IpsBaseEntity {
  workCardId: string;
  partCode: string;
  partName: string;
  quantity?: number | null;
  status?: string | null;
  disposalResult?: string | null;
  barcode?: string | null;
}

/** ips:logistics:LineStock 线边库 */
export interface LineStock extends IpsBaseEntity {
  stockCode: string;
  stockName: string;
  stockType?: string | null;
  location?: string | null;
  isActive?: boolean | null;
}

/** ips:logistics:LineStockItem 线边库物料 */
export interface LineStockItem extends IpsBaseEntity {
  stockId: string;
  partCode: string;
  partName?: string | null;
  quantity?: number | null;
}

/** ips:logistics:InventoryTransaction 出入库流水 */
export interface InventoryTransaction extends IpsBaseEntity {
  transactionNo: string;
  stockId?: string | null;
  transactionType: string;
  partCode: string;
  partName?: string | null;
  quantity: number;
  transactionTime?: string | null;
  operatorName?: string | null;
}

/** 示意图上的热区。x/y/w/h 相对图片宽高，范围 0–1；正方形和圆形在画面上边长相等 */
export interface TrayHotZone {
  shape?: 'rect' | 'square' | 'circle';
  x: number;
  y: number;
  w: number;
  h: number;
}

/** ips:logistics:TrayTemplate 形迹盘模版 */
export interface TrayTemplate extends IpsBaseEntity {
  templateCode: string;
  templateName?: string | null;
  workstationType?: string | null;
  photoObjectId?: string | null;
  bopSchemeId?: string | null;
  /** BOM 上作为物料分类的节点；空表示整单 */
  materialClassId?: string | null;
  /** draft | published */
  status?: string | null;
}

/** ips:logistics:TraySlot 形迹盘槽位。同一物料数量为 N 时有 N 条，一物一槽 */
export interface TraySlot extends IpsBaseEntity {
  templateId: string;
  partCode?: string | null;
  slotStatus?: string | null;
  sortOrder?: number | null;
  materialId?: string | null;
  instanceNo?: number | null;
  slotCode?: string | null;
  /** JSON 文本，内容为 TrayHotZone */
  hotZone?: string | null;
  required?: boolean | null;
}

/** ips:production:ScrapRecord 报废记录 */
export interface ScrapRecord extends IpsBaseEntity {
  scrapNo: string;
  workCardId?: string | null;
  partCode?: string | null;
  partName?: string | null;
  quantity: number;
  scrapReason?: string | null;
  scrapTime?: string | null;
}

/** ips:service:CallType 呼叫类型 */
export interface CallType extends IpsBaseEntity {
  typeCode: string;
  typeName: string;
  enabled?: boolean | null;
  soundEnabled?: boolean | null;
  soundKey?: string | null;
  /** JSON 数组，角色 id */
  roleIds?: string | null;
}

/** ips:service:NotificationLog 现场呼叫 */
export interface NotificationLog extends IpsBaseEntity {
  callType: string;
  callContent?: string | null;
  callTime?: string | null;
  isResponded?: boolean | null;
  workstationId?: string | null;
  /** sent | accepted | completed | cancelled */
  status?: string | null;
  callerName?: string | null;
  acceptedBy?: string | null;
  acceptedAt?: string | null;
  completedAt?: string | null;
}

/** ips:service:AgvTask AGV 任务 */
export interface AgvTask extends IpsBaseEntity {
  taskNo: string;
  fromStation: string;
  toStation: string;
  status: string;
  workCardId?: string | null;
}
