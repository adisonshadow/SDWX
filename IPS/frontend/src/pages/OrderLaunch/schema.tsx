/** 车间令号列表列定义 */
import type { ProColumns } from '@ant-design/pro-components';
import { Tag } from 'antd';
import {
  REPAIR_METHOD_OPTIONS,
  WORKSHOP_ORDER_STATUS_OPTIONS,
} from '@/constants/enums';

const statusValueEnum = Object.fromEntries(
  WORKSHOP_ORDER_STATUS_OPTIONS.map((o) => [o.value, { text: o.label }]),
);

export const workshopOrderColumns: ProColumns<Record<string, any>>[] = [
  { title: '令号编号', dataIndex: 'workshopOrderNo', width: 140, copyable: true },
  { title: '名称', dataIndex: 'name', width: 180, ellipsis: true, hideInSearch: true },
  {
    title: '修理方式',
    dataIndex: 'repairMethod',
    width: 100,
    valueType: 'select',
    fieldProps: { options: REPAIR_METHOD_OPTIONS, allowClear: true },
    render: (_, r) => <Tag>{REPAIR_METHOD_OPTIONS.find((o) => o.value === r.repairMethod)?.label ?? r.repairMethod}</Tag>,
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 100,
    valueType: 'select',
    fieldProps: { options: WORKSHOP_ORDER_STATUS_OPTIONS, allowClear: true },
    valueEnum: statusValueEnum,
    render: (_, r) => <Tag color={r.status === 'RELEASED' ? 'blue' : r.status === 'COMPLETED' ? 'green' : 'default'}>{statusValueEnum[r.status]?.text ?? r.status}</Tag>,
  },
  { title: '计划开始', dataIndex: 'planStartDate', valueType: 'date', width: 120, hideInSearch: true },
  { title: '计划结束', dataIndex: 'planEndDate', valueType: 'date', width: 120, hideInSearch: true },
];
