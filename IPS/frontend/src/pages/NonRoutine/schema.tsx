/** 非例行工卡列表列 */
import type { ProColumns } from '@ant-design/pro-components';
import { Tag } from 'antd';
import { Link } from 'react-router-dom';
import {
  SCHEDULE_PRIORITY_OPTIONS,
  SCHEDULE_PRIORITY_VALUE_ENUM,
  WORK_CARD_STATUS_OPTIONS,
  WORK_CARD_STATUS_VALUE_ENUM,
} from '@/constants/enums';
import { listWorkstations } from '@/services/workstation';
import { parseApiListResponse } from '@/utils/apiResponse';

/** 非例行相关优先级 */
export const NON_ROUTINE_PRIORITY_OPTIONS = SCHEDULE_PRIORITY_OPTIONS.filter((o) =>
  ['NON_ROUTINE', 'URGENT'].includes(o.value),
);

export const nonRoutineColumns: ProColumns<Record<string, any>>[] = [
  {
    title: '工卡号',
    dataIndex: 'workCardNo',
    width: 170,
    copyable: true,
    render: (_, r) =>
      r.id ? <Link to={`/dispatch/workcards/${r.id}`}>{r.workCardNo}</Link> : r.workCardNo,
  },
  {
    title: '令号',
    dataIndex: 'workshopOrderId',
    width: 160,
    ellipsis: true,
    hideInSearch: true,
    render: (_, r) => {
      const label = r.workshopOrderNo || r.workshopOrderId;
      if (!r.workshopOrderId || !label) return '-';
      return <Link to={`/plan/orders/${r.workshopOrderId}`}>{label}</Link>;
    },
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 110,
    valueType: 'select',
    fieldProps: { options: WORK_CARD_STATUS_OPTIONS, allowClear: true },
    valueEnum: WORK_CARD_STATUS_VALUE_ENUM as any,
    render: (_, r) => {
      const e = WORK_CARD_STATUS_VALUE_ENUM[r.status];
      return e ? (
        <Tag
          color={
            e.status === 'Success'
              ? 'green'
              : e.status === 'Error'
                ? 'red'
                : e.status === 'Warning'
                  ? 'gold'
                  : 'blue'
          }
        >
          {e.text}
        </Tag>
      ) : (
        r.status
      );
    },
  },
  {
    title: '优先级',
    dataIndex: 'priority',
    width: 110,
    valueType: 'select',
    fieldProps: { options: NON_ROUTINE_PRIORITY_OPTIONS, allowClear: true },
    valueEnum: SCHEDULE_PRIORITY_VALUE_ENUM as any,
    render: (_, r) => {
      const e = SCHEDULE_PRIORITY_VALUE_ENUM[r.priority];
      return e ? (
        <Tag color={e.status === 'Error' ? 'red' : e.status === 'Warning' ? 'gold' : 'default'}>
          {e.text}
        </Tag>
      ) : (
        r.priority
      );
    },
  },
  {
    title: '目标工位',
    dataIndex: 'workstationId',
    width: 140,
    ellipsis: true,
    valueType: 'select',
    request: async () => {
      const res = await listWorkstations();
      const { items } = parseApiListResponse<{ id?: string; stationNo: string; name?: string }>(res);
      return items.map((i) => ({
        label: `${i.stationNo}${i.name ? `（${i.name}）` : ''}`,
        value: i.id,
      }));
    },
    fieldProps: { showSearch: true, optionFilterProp: 'label', allowClear: true },
  },
  {
    title: '管道位置',
    dataIndex: 'pipelineOrder',
    width: 90,
    hideInSearch: true,
    render: (v) => (v != null ? `#${v}` : '-'),
  },
  {
    title: '备注',
    dataIndex: 'remark',
    ellipsis: true,
    hideInSearch: true,
  },
];
