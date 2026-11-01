/** 检验记录列表列定义 */
import type { ProColumns } from '@ant-design/pro-components';
import { Tag } from 'antd';
import { INSPECTION_RESULT_OPTIONS, INSPECTION_RESULT_VALUE_ENUM } from '@/constants/enums';

export type NameLookup = Record<string, string>;

export function buildInspectionRecordColumns(opts: {
  stepNameById: NameLookup;
  itemNameById: NameLookup;
  equipNameById: NameLookup;
}): ProColumns<Record<string, any>>[] {
  const { stepNameById, itemNameById, equipNameById } = opts;
  return [
    {
      title: '业务编号',
      dataIndex: 'bizNo',
      hideInTable: true,
      hideInSearch: true,
    },
    {
      title: '工步实例',
      dataIndex: 'stepInstanceId',
      width: 180,
      ellipsis: true,
      hideInSearch: true,
      render: (_, r) => {
        const id = r.stepInstanceId as string | undefined;
        if (!id) return '—';
        return stepNameById[id] || '—';
      },
    },
    {
      title: '检验项',
      dataIndex: 'inspectionItemId',
      width: 180,
      ellipsis: true,
      hideInSearch: true,
      render: (_, r) => {
        const id = r.inspectionItemId as string | undefined;
        if (!id) return '—';
        return itemNameById[id] || '—';
      },
    },
    {
      title: '测量值',
      dataIndex: 'measuredValue',
      width: 100,
      hideInSearch: true,
      render: (v) => (v != null ? String(v) : '—'),
    },
    {
      title: '结果',
      dataIndex: 'result',
      width: 100,
      valueType: 'select',
      fieldProps: { options: INSPECTION_RESULT_OPTIONS, allowClear: true },
      render: (_, r) => {
        const e = INSPECTION_RESULT_VALUE_ENUM[r.result];
        if (!e) return r.result || '—';
        const color =
          e.status === 'Success' ? 'green' : e.status === 'Error' ? 'red' : 'default';
        return <Tag color={color}>{e.text}</Tag>;
      },
    },
    {
      title: '检验人',
      dataIndex: 'inspector',
      width: 120,
    },
    {
      title: '检验时间',
      dataIndex: 'inspectedAt',
      width: 170,
      hideInSearch: true,
      valueType: 'dateTime',
    },
    {
      title: '不合格描述',
      dataIndex: 'defectDescription',
      ellipsis: true,
      hideInSearch: true,
    },
    {
      title: '测量设备',
      dataIndex: 'equipmentId',
      ellipsis: true,
      hideInSearch: true,
      render: (_, r) => {
        const id = r.equipmentId as string | undefined;
        if (!id) return '—';
        return equipNameById[id] || '—';
      },
    },
  ];
}
