/** 测量设备列定义 */
import type { ProColumns } from '@ant-design/pro-components';
import { Tag } from 'antd';
import { MEASUREMENT_EQUIPMENT_STATUS_OPTIONS } from '@/constants/enums';

export const measurementEquipmentColumns: ProColumns<Record<string, any>>[] = [
  {
    title: '业务编号',
    dataIndex: 'bizNo',
    width: 140,
    copyable: true,
  },
  {
    title: '设备名称',
    dataIndex: 'name',
    ellipsis: true,
  },
  {
    title: '型号/规格',
    dataIndex: 'model',
    ellipsis: true,
    hideInSearch: true,
  },
  {
    title: '设备编号',
    dataIndex: 'serialNo',
    width: 140,
    copyable: true,
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 110,
    valueType: 'select',
    fieldProps: { options: MEASUREMENT_EQUIPMENT_STATUS_OPTIONS, allowClear: true },
    render: (_, r) => {
      const label =
        MEASUREMENT_EQUIPMENT_STATUS_OPTIONS.find((o) => o.value === r.status)?.label ??
        r.status;
      const color =
        r.status === 'ACTIVE' ? 'green' : r.status === 'IN_CALIBRATION' ? 'gold' : 'default';
      return <Tag color={color}>{label || '—'}</Tag>;
    },
  },
  {
    title: '最近校准',
    dataIndex: 'calibrationDate',
    width: 160,
    hideInSearch: true,
    valueType: 'dateTime',
  },
  {
    title: '校准周期(天)',
    dataIndex: 'calibrationCycle',
    width: 120,
    hideInSearch: true,
    render: (v) => v ?? '—',
  },
  {
    title: '备注',
    dataIndex: 'remark',
    ellipsis: true,
    hideInSearch: true,
    hideInTable: true,
  },
];
