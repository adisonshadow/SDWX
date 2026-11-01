/**
 * @ips/shared — IPS 枚举定义（纯运行时常量 + TS 字面量联合类型）
 *
 * 来源：docs/enums.ts + apis.json 内联枚举（x-adb-enum-code）。
 * 与 EADAF ADB 枚举一一对应，存库值与 code 一致（SCREAMING_SNAKE_CASE）。
 */

export type AdbEnumItem = { label: string; sort: number; description?: string };

export type AdbEnumDef = {
  code: string;
  label: string;
  values: Record<string, string>;
  items: Record<string, AdbEnumItem>;
};

function def(code: string, label: string, entries: Array<[key: string, labelZh: string]>): AdbEnumDef {
  const values: Record<string, string> = {};
  const items: Record<string, AdbEnumItem> = {};
  entries.forEach(([key, labelZh], i) => {
    values[key] = key;
    items[key] = { label: labelZh, sort: i + 1 };
  });
  return { code, label, values, items };
}

// ============ 版本状态 ============

export const VersionStatusEnum = def('ips:process:VersionStatus', '版本状态', [
  ['DRAFT', '编制中'],
  ['PUBLISHED', '已发布'],
  ['OBSOLETE', '已作废'],
]);
export type VersionStatus = keyof typeof VersionStatusEnum.values;

// ============ 修理方式 ============

export const RepairMethodEnum = def('ips:process:RepairMethod', '修理方式', [
  ['OVERHAUL', '大修'],
  ['CHECK', '检修'],
  ['DETECT', '检测'],
  ['OIL_SEAL', '油封'],
  ['TROUBLESHOOT', '排故'],
]);
export type RepairMethod = keyof typeof RepairMethodEnum.values;

// ============ 工序类别 ============

export const OperationCategoryEnum = def('ips:process:OperationCategory', '工序类别', [
  ['ROUTINE', '例行'],
  ['NON_ROUTINE', '非例行'],
  ['TEMPORARY', '临时'],
]);
export type OperationCategory = keyof typeof OperationCategoryEnum.values;

// ============ DAG 边类型 ============

export const DagEdgeTypeEnum = def('ips:process:DagEdgeType', 'DAG边类型', [
  ['NORMAL', '正常流转'],
  ['PASS', '检验合格'],
  ['FAIL', '检验不合格回流'],
  ['REWORK', '返工回流'],
]);
export type DagEdgeType = keyof typeof DagEdgeTypeEnum.values;

// ============ 物料节点类型 ============

export const MaterialNodeTypeEnum = def('ips:bom:MaterialNodeType', '物料节点类型', [
  ['LANDING_GEAR', '起落架/维修主体'],
  ['MAJOR_ASSEMBLY', '大部件'],
  ['PRIMARY_PART', '一级零件'],
  ['PART_LARGE', '大型零件'],
  ['PART_SMALL', '小型零件'],
  ['COLLABORATION', '协作件(委外)'],
]);
export type MaterialNodeType = keyof typeof MaterialNodeTypeEnum.values;

// ============ 区站类型 ============

export const WorkAreaTypeEnum = def('ips:master:WorkAreaType', '区站类型', [
  ['DISASSEMBLY', '分解线'],
  ['ROUGH_WASH', '粗洗站'],
  ['WASH', '清洗站'],
  ['FAULT_REPAIR', '故检修理线'],
  ['ASSEMBLY', '装配线'],
  ['TEST', '试验区'],
  ['EXCEPTION', '异常处理区'],
  ['STORAGE', '仓储区域'],
]);
export type WorkAreaType = keyof typeof WorkAreaTypeEnum.values;

// ============ 维修资源类型 ============

export const ResourceTypeEnum = def('ips:master:ResourceType', '维修资源类型', [
  ['TOOLING', '工装工具'],
  ['EQUIPMENT', '设备'],
  ['GAUGE', '量具'],
  ['CONSUMABLE', '辅料耗材'],
]);
export type ResourceType = keyof typeof ResourceTypeEnum.values;

// ============ 工卡状态 ============

export const WorkCardStatusEnum = def('ips:production:WorkCardStatus', '工卡状态', [
  ['PENDING_EFFECTIVE', '待生效'],
  ['PENDING_ACCEPT', '待接受'],
  ['PENDING_REPAIR', '待修理'],
  ['REPAIRING', '修理中'],
  ['KIT_SUSPENDED', '齐套挂起'],
  ['LOAD_SUSPENDED', '负荷挂起'],
  ['REPAIR_DONE', '修理结束'],
  ['CANCELLED', '已取消'],
]);
export type WorkCardStatus = keyof typeof WorkCardStatusEnum.values;

/** 工卡状态排序优先级（数字小者在前） */
export const WORK_CARD_STATUS_PRIORITY: Record<WorkCardStatus, number> = {
  PENDING_EFFECTIVE: 1,
  PENDING_ACCEPT: 2,
  PENDING_REPAIR: 3,
  REPAIRING: 4,
  KIT_SUSPENDED: 5,
  LOAD_SUSPENDED: 6,
  REPAIR_DONE: 7,
  CANCELLED: 8,
};

// ============ 半天时段 ============

export const HalfDayEnum = def('ips:schedule:HalfDay', '半天时段', [
  ['AM', '上午'],
  ['PM', '下午'],
]);
export type HalfDay = keyof typeof HalfDayEnum.values;

// ============ 排产优先级 ============

export const SchedulePriorityEnum = def('ips:schedule:SchedulePriority', '排产优先级', [
  ['ROUTINE', '例行'],
  ['NON_ROUTINE', '非例行'],
  ['URGENT', '紧急插单'],
]);
export type SchedulePriority = keyof typeof SchedulePriorityEnum.values;

// ============ 检验结果 ============

export const InspectionResultEnum = def('ips:production:InspectionResult', '检验结果', [
  ['PENDING', '待检'],
  ['PASS', '合格'],
  ['FAIL', '不合格'],
]);
export type InspectionResult = keyof typeof InspectionResultEnum.values;

// ============ 检验类型（检验项定义）============

export const InspectionTypeEnum = def('ips:inspection:InspectionType', '检验类型', [
  ['manual', '人工判定'],
  ['tolerance', '公差测量'],
]);
export type InspectionType = keyof typeof InspectionTypeEnum.values;

// ============ 测量设备状态 ============

export const MeasurementEquipmentStatusEnum = def(
  'ips:master:MeasurementEquipmentStatus',
  '测量设备状态',
  [
    ['ACTIVE', '在用'],
    ['IN_CALIBRATION', '校准中'],
    ['DISABLED', '停用'],
  ],
);
export type MeasurementEquipmentStatus = keyof typeof MeasurementEquipmentStatusEnum.values;

// ============ 委外状态 ============

export const OutsourcingStatusEnum = def('ips:production:Outsourcing', '委外状态', [
  ['ISSUED', '已发出'],
  ['IN_PROGRESS', '委外中'],
  ['RETURNED', '已返回'],
  ['ACCEPTED', '已重新接受'],
  ['CANCELLED', '已取消'],
]);
export type OutsourcingStatus = keyof typeof OutsourcingStatusEnum.values;

// ============ 齐套维度 ============

export const KitDimensionEnum = def('ips:production:KitDimension', '齐套维度', [
  ['PERSON', '人员'],
  ['EQUIPMENT', '设备/工装'],
  ['MATERIAL', '物料'],
]);
export type KitDimension = keyof typeof KitDimensionEnum.values;

// ============ 车间令号状态 ============

export const WorkshopOrderStatusEnum = def('ips:production:WorkshopOrderStatus', '车间令号状态', [
  ['CREATED', '已创建'],
  ['RELEASED', '已投产'],
  ['IN_PROGRESS', '生产中'],
  ['COMPLETED', '已完成'],
  ['CANCELLED', '已取消'],
]);
export type WorkshopOrderStatus = keyof typeof WorkshopOrderStatusEnum.values;

// ============ 实例工步状态 ============

export const StepInstanceStatusEnum = def('ips:production:StepInstanceStatus', '实例工步状态', [
  ['PENDING', '未执行'],
  ['IN_PROGRESS', '执行中'],
  ['DONE', '已完成'],
  ['SKIPPED', '已跳过'],
]);
export type StepInstanceStatus = keyof typeof StepInstanceStatusEnum.values;

// ============ WBS 节点类型（来自 apis.json）============

export const WbsNodeTypeEnum = def('ips:wbs:WbsNodeType', 'WBS节点类型', [
  ['ROOT', '根节点'],
  ['TASK', '任务'],
  ['GROUP', '分组'],
  ['PHASE', '阶段'],
  ['PACKAGE', '作业包'],
]);
export type WbsNodeType = keyof typeof WbsNodeTypeEnum.values;

// ============ 排产计划状态/类型（来自 apis.json）============

export const SchedulePlanStatusEnum = def('ips:SchedulePlanStatus', '排产计划状态', [
  ['DRAFT', '草稿'],
  ['PUBLISHED', '已发布'],
  ['EXECUTING', '执行中'],
  ['COMPLETED', '已完成'],
  ['SUPERSEDED', '已替代'],
]);
export type SchedulePlanStatus = keyof typeof SchedulePlanStatusEnum.values;

export const SchedulePlanTypeEnum = def('ips:SchedulePlanType', '排产计划类型', [
  ['EXECUTION', '执行'],
  ['INSERTION', '插单'],
  ['RESCHEDULE', '重排'],
  ['PRE_SCHEDULE', '预排产'],
]);
export type SchedulePlanType = keyof typeof SchedulePlanTypeEnum.values;

// ============ 预警类型/优先级（来自 apis.json）============

export const AlertTypeEnum = def('ips:AlertType', '预警类型', [
  ['OVERLOAD', '超负荷'],
  ['BOTTLENECK', '瓶颈'],
  ['DELAY_RISK', '延期风险'],
  ['KIT_SHORTAGE', '齐套缺料'],
  ['RESOURCE_CONFLICT', '资源冲突'],
]);
export type AlertType = keyof typeof AlertTypeEnum.values;

export const PriorityLevelEnum = def('ips:PriorityLevel', '优先级', [
  ['LOW', '低'],
  ['NORMAL', '正常'],
  ['HIGH', '高'],
  ['URGENT', '紧急'],
]);
export type PriorityLevel = keyof typeof PriorityLevelEnum.values;

/** 全部枚举注册表（供 seed / 文档生成） */
export const IPS_ADB_ENUMS: AdbEnumDef[] = [
  VersionStatusEnum,
  RepairMethodEnum,
  OperationCategoryEnum,
  DagEdgeTypeEnum,
  MaterialNodeTypeEnum,
  WorkAreaTypeEnum,
  ResourceTypeEnum,
  WorkCardStatusEnum,
  HalfDayEnum,
  SchedulePriorityEnum,
  InspectionResultEnum,
  InspectionTypeEnum,
  MeasurementEquipmentStatusEnum,
  OutsourcingStatusEnum,
  KitDimensionEnum,
  WorkshopOrderStatusEnum,
  StepInstanceStatusEnum,
  WbsNodeTypeEnum,
  SchedulePlanStatusEnum,
  SchedulePlanTypeEnum,
  AlertTypeEnum,
  PriorityLevelEnum,
];
