/**
 * 业务枚举 → Select options / ProTable valueEnum
 * 从 @ips/shared 枚举（运行时常量）生成前端可用的 label/options。
 */
import type { ProSchemaValueEnumType } from '@ant-design/pro-components';
import {
  WorkCardStatusEnum,
  WorkshopOrderStatusEnum,
  RepairMethodEnum,
  SchedulePriorityEnum,
  WorkAreaTypeEnum,
  HalfDayEnum,
  OutsourcingStatusEnum,
  InspectionResultEnum,
  InspectionTypeEnum,
  MeasurementEquipmentStatusEnum,
  OperationCategoryEnum,
  KitDimensionEnum,
  WbsNodeTypeEnum,
  VersionStatusEnum,
  MaterialNodeTypeEnum,
  DagEdgeTypeEnum,
  type AdbEnumDef,
} from '@ips/shared';

export interface LabelValueOption {
  label: string;
  value: string;
}

/** AdbEnumDef → {label,value}[] options */
function toOptions(def: AdbEnumDef): LabelValueOption[] {
  return Object.entries(def.items)
    .sort((a, b) => a[1].sort - b[1].sort)
    .map(([value, item]) => ({ value, label: item.label }));
}

/** AdbEnumDef → ProTable valueEnum（含 status 配色） */
function toValueEnum(def: AdbEnumDef, statusMap?: Record<string, string>): Record<string, ProSchemaValueEnumType> {
  const result: Record<string, ProSchemaValueEnumType> = {};
  for (const [value, item] of Object.entries(def.items)) {
    result[value] = statusMap?.[value]
      ? { text: item.label, status: statusMap[value] as ProSchemaValueEnumType['status'] }
      : { text: item.label };
  }
  return result;
}

export const WORK_CARD_STATUS_OPTIONS = toOptions(WorkCardStatusEnum);
export const WORK_CARD_STATUS_VALUE_ENUM = toValueEnum(WorkCardStatusEnum, {
  PENDING_EFFECTIVE: 'Default',
  PENDING_ACCEPT: 'Warning',
  PENDING_REPAIR: 'Processing',
  REPAIRING: 'Processing',
  KIT_SUSPENDED: 'Error',
  LOAD_SUSPENDED: 'Error',
  REPAIR_DONE: 'Success',
  CANCELLED: 'Default',
});

export const WORKSHOP_ORDER_STATUS_OPTIONS = toOptions(WorkshopOrderStatusEnum);
export const REPAIR_METHOD_OPTIONS = toOptions(RepairMethodEnum);
export const SCHEDULE_PRIORITY_OPTIONS = toOptions(SchedulePriorityEnum);
export const SCHEDULE_PRIORITY_VALUE_ENUM = toValueEnum(SchedulePriorityEnum, {
  ROUTINE: 'Default',
  NON_ROUTINE: 'Warning',
  URGENT: 'Error',
});
export const WORK_AREA_TYPE_OPTIONS = toOptions(WorkAreaTypeEnum);
export const HALF_DAY_OPTIONS = toOptions(HalfDayEnum);
export const OUTSOURCING_STATUS_OPTIONS = toOptions(OutsourcingStatusEnum);
export const OUTSOURCING_STATUS_VALUE_ENUM = toValueEnum(OutsourcingStatusEnum, {
  ISSUED: 'Processing',
  IN_PROGRESS: 'Processing',
  RETURNED: 'Warning',
  ACCEPTED: 'Success',
  CANCELLED: 'Default',
});
export const KIT_DIMENSION_OPTIONS = toOptions(KitDimensionEnum);
export const INSPECTION_RESULT_OPTIONS = toOptions(InspectionResultEnum);
export const INSPECTION_RESULT_VALUE_ENUM = toValueEnum(InspectionResultEnum, {
  PENDING: 'Default',
  PASS: 'Success',
  FAIL: 'Error',
});
export const INSPECTION_TYPE_OPTIONS = toOptions(InspectionTypeEnum);
export const INSPECTION_TYPE_VALUE_ENUM = toValueEnum(InspectionTypeEnum);
export const MEASUREMENT_EQUIPMENT_STATUS_OPTIONS = toOptions(MeasurementEquipmentStatusEnum);
export const MEASUREMENT_EQUIPMENT_STATUS_VALUE_ENUM = toValueEnum(MeasurementEquipmentStatusEnum, {
  ACTIVE: 'Success',
  IN_CALIBRATION: 'Warning',
  DISABLED: 'Default',
});
export const OPERATION_CATEGORY_OPTIONS = toOptions(OperationCategoryEnum);
export const WBS_NODE_TYPE_OPTIONS = toOptions(WbsNodeTypeEnum);

export const VERSION_STATUS_OPTIONS = toOptions(VersionStatusEnum);
export const VERSION_STATUS_VALUE_ENUM = toValueEnum(VersionStatusEnum, {
  DRAFT: 'Processing',
  PUBLISHED: 'Success',
  OBSOLETE: 'Default',
});

export const MATERIAL_NODE_TYPE_OPTIONS = toOptions(MaterialNodeTypeEnum);
export const MATERIAL_NODE_TYPE_VALUE_ENUM = toValueEnum(MaterialNodeTypeEnum);

export const DAG_EDGE_TYPE_OPTIONS = toOptions(DagEdgeTypeEnum);
export const DAG_EDGE_TYPE_VALUE_ENUM = toValueEnum(DagEdgeTypeEnum, {
  NORMAL: 'Default',
  PASS: 'Success',
  FAIL: 'Error',
  REWORK: 'Warning',
});

export const REPAIR_METHOD_VALUE_ENUM = toValueEnum(RepairMethodEnum);
export const OPERATION_CATEGORY_VALUE_ENUM = toValueEnum(OperationCategoryEnum);
