/**
 * 实体注册表 — 驱动通用 CRUD 代理路由 (crud.routes.ts)
 *
 * 把 URL 段 (module/entity) 映射到合法 routePath，并记录每个实体的业务编号字段，
 * 便于 id 过滤被 EADAF 忽略时按 code 兜底匹配。
 *
 * routePath 与 @ips/shared EADAF_ROUTES 一一对应；此处保持单点维护。
 */
import { EADAF_ROUTES } from '@ips/shared';

export interface EntityMeta {
  /** 完整 routePath：IPS/{module}/{Entity} */
  routePath: string;
  /** 模块段 */
  module: string;
  /** 实体段 */
  entity: string;
  /** 业务编号字段（camelCase，供 findItemById code 兜底）。scheduling 模块为 snake_case */
  codeField?: string;
  /** 该实体字段是否为 snake_case（仅 scheduling 模块） */
  snakeCase?: boolean;
}

/** 以 `${module}/${entity}` 为键的注册表 */
export const ENTITY_REGISTRY: Record<string, EntityMeta> = {
  // master
  'master/Product': { routePath: EADAF_ROUTES.product, module: 'master', entity: 'Product', codeField: 'productNo' },
  'master/Material': { routePath: EADAF_ROUTES.material, module: 'master', entity: 'Material', codeField: 'materialNo' },
  'master/Workstation': { routePath: EADAF_ROUTES.workstation, module: 'master', entity: 'Workstation', codeField: 'stationNo' },
  'master/RepairResource': { routePath: EADAF_ROUTES.repairResource, module: 'master', entity: 'RepairResource', codeField: 'resourceNo' },
  'master/MeasurementEquipment': {
    routePath: EADAF_ROUTES.measurementEquipment,
    module: 'master',
    entity: 'MeasurementEquipment',
    codeField: 'bizNo',
  },
  // process
  'process/ProcessOperation': { routePath: EADAF_ROUTES.processOperation, module: 'process', entity: 'ProcessOperation', codeField: 'operationNo' },
  'process/ProcessStep': { routePath: EADAF_ROUTES.processStep, module: 'process', entity: 'ProcessStep' },
  'process/ProcessStepEdge': { routePath: EADAF_ROUTES.processStepEdge, module: 'process', entity: 'ProcessStepEdge' },
  'process/ProcessOperationMaterial': { routePath: EADAF_ROUTES.processOperationMaterial, module: 'process', entity: 'ProcessOperationMaterial' },
  'process/BopScheme': { routePath: EADAF_ROUTES.bopScheme, module: 'process', entity: 'BopScheme' },
  'process/BopOperationNode': { routePath: EADAF_ROUTES.bopOperationNode, module: 'process', entity: 'BopOperationNode', codeField: 'nodeNo' },
  'process/BopOperationEdge': { routePath: EADAF_ROUTES.bopOperationEdge, module: 'process', entity: 'BopOperationEdge' },
  // inspection
  'inspection/InspectionItem': {
    routePath: EADAF_ROUTES.inspectionItem,
    module: 'inspection',
    entity: 'InspectionItem',
    codeField: 'bizNo',
  },
  'inspection/InspectionRecord': {
    routePath: EADAF_ROUTES.inspectionRecord,
    module: 'inspection',
    entity: 'InspectionRecord',
    codeField: 'bizNo',
  },
  // craft（字段 snake_case）
  'craft/ProcessTemplate': {
    routePath: EADAF_ROUTES.processTemplate,
    module: 'craft',
    entity: 'ProcessTemplate',
    codeField: 'template_code',
    snakeCase: true,
  },
  'craft/WorkCardTemplate': {
    routePath: EADAF_ROUTES.workCardTemplate,
    module: 'craft',
    entity: 'WorkCardTemplate',
    codeField: 'card_template_code',
    snakeCase: true,
  },
  // bom
  'bom/BomScheme': { routePath: EADAF_ROUTES.bomScheme, module: 'bom', entity: 'BomScheme' },
  'bom/BomSchemeNode': { routePath: EADAF_ROUTES.bomSchemeNode, module: 'bom', entity: 'BomSchemeNode' },
  // production
  'production/FactoryOrder': { routePath: EADAF_ROUTES.factoryOrder, module: 'production', entity: 'FactoryOrder', codeField: 'factoryOrderNo' },
  'production/WorkshopOrder': { routePath: EADAF_ROUTES.workshopOrder, module: 'production', entity: 'WorkshopOrder', codeField: 'workshopOrderNo' },
  'production/BomInstance': { routePath: EADAF_ROUTES.bomInstance, module: 'production', entity: 'BomInstance' },
  'production/BomInstanceNode': { routePath: EADAF_ROUTES.bomInstanceNode, module: 'production', entity: 'BomInstanceNode' },
  'production/BopInstance': { routePath: EADAF_ROUTES.bopInstance, module: 'production', entity: 'BopInstance' },
  'production/OperationInstance': { routePath: EADAF_ROUTES.operationInstance, module: 'production', entity: 'OperationInstance' },
  'production/StepInstance': { routePath: EADAF_ROUTES.stepInstance, module: 'production', entity: 'StepInstance' },
  'production/WorkCard': { routePath: EADAF_ROUTES.workCard, module: 'production', entity: 'WorkCard', codeField: 'workCardNo' },
  'production/WorkCardEdge': { routePath: EADAF_ROUTES.workCardEdge, module: 'production', entity: 'WorkCardEdge' },
  'production/WorkCardTask': { routePath: EADAF_ROUTES.workCardTask, module: 'production', entity: 'WorkCardTask' },
  'production/SingleUnitPlan': { routePath: EADAF_ROUTES.singleUnitPlan, module: 'production', entity: 'SingleUnitPlan' },
  'production/WorkCardOutsourcing': { routePath: EADAF_ROUTES.workCardOutsourcing, module: 'production', entity: 'WorkCardOutsourcing' },
  'production/WorkCardKitRequirement': { routePath: EADAF_ROUTES.workCardKitRequirement, module: 'production', entity: 'WorkCardKitRequirement' },
  // schedule
  'schedule/ScheduleConfig': { routePath: EADAF_ROUTES.scheduleConfig, module: 'schedule', entity: 'ScheduleConfig', codeField: 'configKey' },
  'schedule/WorkstationCapacity': { routePath: EADAF_ROUTES.workstationCapacity, module: 'schedule', entity: 'WorkstationCapacity' },
  'schedule/WorkHourMedian': { routePath: EADAF_ROUTES.workHourMedian, module: 'schedule', entity: 'WorkHourMedian' },
  'schedule/WorkCardPlanSlot': { routePath: EADAF_ROUTES.workCardPlanSlot, module: 'schedule', entity: 'WorkCardPlanSlot' },
  // capacity（字段 snake_case）
  'capacity/CapacityConfig': {
    routePath: EADAF_ROUTES.capacityConfig,
    module: 'capacity',
    entity: 'CapacityConfig',
    codeField: 'config_code',
    snakeCase: true,
  },
  // wbs
  'wbs/WbsNode': { routePath: EADAF_ROUTES.wbsNode, module: 'wbs', entity: 'WbsNode', codeField: 'code' },
  // scheduling（字段 snake_case）
  'scheduling/PlanVersion': { routePath: EADAF_ROUTES.planVersion, module: 'scheduling', entity: 'PlanVersion', codeField: 'version_code', snakeCase: true },
  'scheduling/SchedulePlan': { routePath: EADAF_ROUTES.schedulePlan, module: 'scheduling', entity: 'SchedulePlan', codeField: 'plan_code', snakeCase: true },
  // analytics / monitor（字段 snake_case）
  'analytics/ActualHoursStats': {
    routePath: EADAF_ROUTES.actualHoursStats,
    module: 'analytics',
    entity: 'ActualHoursStats',
    codeField: 'stats_code',
    snakeCase: true,
  },
  // logistics（工位线边与形迹）
  'logistics/TrayTemplate': {
    routePath: EADAF_ROUTES.trayTemplate,
    module: 'logistics',
    entity: 'TrayTemplate',
    codeField: 'templateCode',
  },
  'logistics/TraySlot': {
    routePath: EADAF_ROUTES.traySlot,
    module: 'logistics',
    entity: 'TraySlot',
  },
  'service/CallType': {
    routePath: EADAF_ROUTES.callType,
    module: 'service',
    entity: 'CallType',
    codeField: 'typeCode',
  },
  'service/NotificationLog': {
    routePath: EADAF_ROUTES.notificationLog,
    module: 'service',
    entity: 'NotificationLog',
  },
  'monitor/AlertRecord': {
    routePath: EADAF_ROUTES.alertRecord,
    module: 'monitor',
    entity: 'AlertRecord',
    codeField: 'alert_code',
    snakeCase: true,
  },
};

/** 解析 URL 段为实体元数据；未知实体返回 null（供通用代理 404） */
export function resolveEntity(module: string, entity: string): EntityMeta | null {
  return ENTITY_REGISTRY[`${module}/${entity}`] ?? null;
}
