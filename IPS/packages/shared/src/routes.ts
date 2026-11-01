/**
 * @ips/shared — EADAF 业务数据 API routePath 集中管理
 *
 * routePath 格式：IPS/{module}/{Entity}（对齐 IPS apis.json）。
 * EADAF 操作后缀拼到 routePath 后：/api/v1/data/{routePath}{Op}。
 * Update/Delete 的 id 在 URL path：/Update/:id、/Delete/:id。
 */

/** EADAF 子 Scope（对齐 apis.json 中 IPS/{module}/ 路径段） */
export const EADAF_SCOPES = {
  master: 'IPS/master',
  process: 'IPS/process',
  craft: 'IPS/craft',
  bom: 'IPS/bom',
  production: 'IPS/production',
  inspection: 'IPS/inspection',
  wbs: 'IPS/wbs',
  schedule: 'IPS/schedule',
  scheduling: 'IPS/scheduling',
  capacity: 'IPS/capacity',
  analytics: 'IPS/analytics',
  monitor: 'IPS/monitor',
  logistics: 'IPS/logistics',
  service: 'IPS/service',
} as const;

/** EADAF 业务数据 API routePath（集中管理，routePath 变化时只改这里） */
export const EADAF_ROUTES = {
  // master
  product: `${EADAF_SCOPES.master}/Product`,
  material: `${EADAF_SCOPES.master}/Material`,
  workstation: `${EADAF_SCOPES.master}/Workstation`,
  repairResource: `${EADAF_SCOPES.master}/RepairResource`,
  measurementEquipment: `${EADAF_SCOPES.master}/MeasurementEquipment`,
  // process
  processOperation: `${EADAF_SCOPES.process}/ProcessOperation`,
  processStep: `${EADAF_SCOPES.process}/ProcessStep`,
  processStepEdge: `${EADAF_SCOPES.process}/ProcessStepEdge`,
  processOperationMaterial: `${EADAF_SCOPES.process}/ProcessOperationMaterial`,
  bopScheme: `${EADAF_SCOPES.process}/BopScheme`,
  bopOperationNode: `${EADAF_SCOPES.process}/BopOperationNode`,
  bopOperationEdge: `${EADAF_SCOPES.process}/BopOperationEdge`,
  // craft（模板）
  processTemplate: `${EADAF_SCOPES.craft}/ProcessTemplate`,
  workCardTemplate: `${EADAF_SCOPES.craft}/WorkCardTemplate`,
  // bom
  bomScheme: `${EADAF_SCOPES.bom}/BomScheme`,
  bomSchemeNode: `${EADAF_SCOPES.bom}/BomSchemeNode`,
  // inspection
  inspectionItem: `${EADAF_SCOPES.inspection}/InspectionItem`,
  inspectionRecord: `${EADAF_SCOPES.inspection}/InspectionRecord`,
  // production
  factoryOrder: `${EADAF_SCOPES.production}/FactoryOrder`,
  workshopOrder: `${EADAF_SCOPES.production}/WorkshopOrder`,
  bomInstance: `${EADAF_SCOPES.production}/BomInstance`,
  bomInstanceNode: `${EADAF_SCOPES.production}/BomInstanceNode`,
  bopInstance: `${EADAF_SCOPES.production}/BopInstance`,
  operationInstance: `${EADAF_SCOPES.production}/OperationInstance`,
  stepInstance: `${EADAF_SCOPES.production}/StepInstance`,
  workCard: `${EADAF_SCOPES.production}/WorkCard`,
  workCardEdge: `${EADAF_SCOPES.production}/WorkCardEdge`,
  workCardTask: `${EADAF_SCOPES.production}/WorkCardTask`,
  singleUnitPlan: `${EADAF_SCOPES.production}/SingleUnitPlan`,
  workCardOutsourcing: `${EADAF_SCOPES.production}/WorkCardOutsourcing`,
  workCardKitRequirement: `${EADAF_SCOPES.production}/WorkCardKitRequirement`,
  workCardPart: `${EADAF_SCOPES.production}/WorkCardPart`,
  scrapRecord: `${EADAF_SCOPES.production}/ScrapRecord`,
  // logistics（工位线边与形迹）
  lineStock: `${EADAF_SCOPES.logistics}/LineStock`,
  lineStockItem: `${EADAF_SCOPES.logistics}/LineStockItem`,
  inventoryTransaction: `${EADAF_SCOPES.logistics}/InventoryTransaction`,
  trayTemplate: `${EADAF_SCOPES.logistics}/TrayTemplate`,
  traySlot: `${EADAF_SCOPES.logistics}/TraySlot`,
  // service（现场呼叫、AGV）
  callType: `${EADAF_SCOPES.service}/CallType`,
  notificationLog: `${EADAF_SCOPES.service}/NotificationLog`,
  agvTask: `${EADAF_SCOPES.service}/AgvTask`,
  // schedule
  scheduleConfig: `${EADAF_SCOPES.schedule}/ScheduleConfig`,
  workstationCapacity: `${EADAF_SCOPES.schedule}/WorkstationCapacity`,
  workHourMedian: `${EADAF_SCOPES.schedule}/WorkHourMedian`,
  workCardPlanSlot: `${EADAF_SCOPES.schedule}/WorkCardPlanSlot`,
  // capacity（字段 snake_case）
  capacityConfig: `${EADAF_SCOPES.capacity}/CapacityConfig`,
  // wbs
  wbsNode: `${EADAF_SCOPES.wbs}/WbsNode`,
  // scheduling（字段 snake_case）
  planVersion: `${EADAF_SCOPES.scheduling}/PlanVersion`,
  schedulePlan: `${EADAF_SCOPES.scheduling}/SchedulePlan`,
  // analytics / monitor（字段 snake_case）
  actualHoursStats: `${EADAF_SCOPES.analytics}/ActualHoursStats`,
  alertRecord: `${EADAF_SCOPES.monitor}/AlertRecord`,
} as const;

/** EADAF 操作后缀（拼接到 routePath 后） */
export const EADAF_OPS = {
  FIND: 'Find',
  CREATE: 'Create',
  UPDATE: 'Update',
  DELETE: 'Delete',
} as const;

/** 采集管道 routePath（如需 ingest 时启用） */
export const INGEST_ROUTE = 'IPS/digital_measure';
