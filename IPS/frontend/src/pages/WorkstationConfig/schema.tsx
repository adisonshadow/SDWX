/** 工位配置列定义 */
import type { ProColumns } from '@ant-design/pro-components';
import { Tag } from 'antd';
import { WORK_AREA_TYPE_OPTIONS } from '@/constants/enums';

export const workstationColumns: ProColumns<Record<string, any>>[] = [
  {
    title: '工位编号',
    dataIndex: 'stationNo',
    width: 140,
    copyable: true,
  },
  {
    title: '名称',
    dataIndex: 'name',
    ellipsis: true,
  },
  {
    title: '区站分类',
    dataIndex: 'areaType',
    width: 130,
    valueType: 'select',
    fieldProps: { options: WORK_AREA_TYPE_OPTIONS, allowClear: true },
    render: (_, r) =>
      WORK_AREA_TYPE_OPTIONS.find((o) => o.value === r.areaType)?.label ?? r.areaType,
  },
  {
    title: '日负荷(h)',
    dataIndex: 'dailyLoadHours',
    width: 100,
    hideInSearch: true,
    render: (v) => v ?? '-',
  },
  {
    title: '管道系数',
    dataIndex: 'pipelineCapacityFactor',
    width: 100,
    hideInSearch: true,
    render: (v) => v ?? '-',
  },
  {
    title: '状态',
    dataIndex: 'enabled',
    width: 90,
    valueType: 'select',
    fieldProps: {
      options: [
        { label: '启用', value: 'true' },
        { label: '禁用', value: 'false' },
      ],
      allowClear: true,
    },
    render: (_, r) =>
      r.enabled === false ? <Tag color="default">禁用</Tag> : <Tag color="green">启用</Tag>,
  },
  {
    title: '备注',
    dataIndex: 'remark',
    ellipsis: true,
    hideInSearch: true,
    hideInTable: true,
  },
];
