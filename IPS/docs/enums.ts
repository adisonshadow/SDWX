/**
 * ADB 枚举定义（独立文件）
 * - code: ips:{scope}:{EnumName}
 * - values: 键值映射（存库值）
 * - items: UI 选项 { KEY: { label, sort } }
 *
 * 实体字段引用方式：@Column({ type: 'adb-enum', enumCode: '...' })
 */

export type AdbEnumItem = { label: string; sort: number; description?: string };

export type AdbEnumDef = {
  code: string;
  label: string;
  values: Record<string, string>;
  items: Record<string, AdbEnumItem>;
};

function def(
  code: string,
  label: string,
  entries: Array<[key: string, labelZh: string]>,
): AdbEnumDef {
  const values: Record<string, string> = {};
  const items: Record<string, AdbEnumItem> = {};
  entries.forEach(([key, labelZh], i) => {
    values[key] = key;
    items[key] = { label: labelZh, sort: i + 1 };
  });
  return { code, label, values, items };
}

/** 版本生命周期：编制中 / 已发布 / 已作废 */
export const VersionStatusEnum = def('ips:process:VersionStatus', '版本状态', [
  ['DRAFT', '编制中'],
  ['PUBLISHED', '已发布'],
  ['OBSOLETE', '已作废'],
]);

/** 修理方式 */
export const RepairMethodEnum = def('ips:process:RepairMethod', '修理方式', [
  ['OVERHAUL', '大修'],
  ['CHECK', '检修'],
  ['DETECT', '检测'],
  ['OIL_SEAL', '油封'],
  ['TROUBLESHOOT', '排故'],
]);

/** 工序类别：例行 / 非例行 / 临时 */
export const OperationCategoryEnum = def('ips:process:OperationCategory', '工序类别', [
  ['ROUTINE', '例行'],
  ['NON_ROUTINE', '非例行'],
  ['TEMPORARY', '临时'],
]);

/** DAG 边类型 */
export const DagEdgeTypeEnum = def('ips:process:DagEdgeType', 'DAG边类型', [
  ['NORMAL', '正常流转'],
  ['PASS', '检验合格'],
  ['FAIL', '检验不合格回流'],
  ['REWORK', '返工回流'],
]);

/** BOM / 物料节点类型 */
export const MaterialNodeTypeEnum = def('ips:bom:MaterialNodeType', '物料节点类型', [
  ['LANDING_GEAR', '起落架/维修主体'],
  ['MAJOR_ASSEMBLY', '大部件'],
  ['PRIMARY_PART', '一级零件'],
  ['PART_LARGE', '大型零件'],
  ['PART_SMALL', '小型零件'],
  ['COLLABORATION', '协作件(委外)'],
]);

/** 区站类型（对齐数字化修理线） */
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

/** 维修资源类型 */
export const ResourceTypeEnum = def('ips:master:ResourceType', '维修资源类型', [
  ['TOOLING', '工装工具'],
  ['EQUIPMENT', '设备'],
  ['GAUGE', '量具'],
  ['CONSUMABLE', '辅料耗材'],
]);

/** 工卡状态 */
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

/** 半天时段 */
export const HalfDayEnum = def('ips:schedule:HalfDay', '半天时段', [
  ['AM', '上午'],
  ['PM', '下午'],
]);

/** 排产优先级 */
export const SchedulePriorityEnum = def('ips:schedule:SchedulePriority', '排产优先级', [
  ['ROUTINE', '例行'],
  ['NON_ROUTINE', '非例行'],
  ['URGENT', '紧急插单'],
]);

/** 检验结果 */
export const InspectionResultEnum = def('ips:production:InspectionResult', '检验结果', [
  ['PENDING', '待检'],
  ['PASS', '合格'],
  ['FAIL', '不合格'],
]);

/** 委外状态（工卡内操作） */
export const OutsourcingStatusEnum = def('ips:production:OutsourcingStatus', '委外状态', [
  ['ISSUED', '已发出'],
  ['IN_PROGRESS', '委外中'],
  ['RETURNED', '已返回'],
  ['ACCEPTED', '已重新接受'],
  ['CANCELLED', '已取消'],
]);

/** 齐套维度 */
export const KitDimensionEnum = def('ips:production:KitDimension', '齐套维度', [
  ['PERSON', '人员'],
  ['EQUIPMENT', '设备/工装'],
  ['MATERIAL', '物料'],
]);

/** 车间令号投产状态 */
export const WorkshopOrderStatusEnum = def('ips:production:WorkshopOrderStatus', '车间令号状态', [
  ['CREATED', '已创建'],
  ['RELEASED', '已投产'],
  ['IN_PROGRESS', '生产中'],
  ['COMPLETED', '已完成'],
  ['CANCELLED', '已取消'],
]);

/** 实例工步执行状态 */
export const StepInstanceStatusEnum = def('ips:production:StepInstanceStatus', '实例工步状态', [
  ['PENDING', '未执行'],
  ['IN_PROGRESS', '执行中'],
  ['DONE', '已完成'],
  ['SKIPPED', '已跳过'],
]);

/** 全部枚举注册表（供 seed / bizdata_create_enum） */
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
  OutsourcingStatusEnum,
  KitDimensionEnum,
  WorkshopOrderStatusEnum,
  StepInstanceStatusEnum,
];
