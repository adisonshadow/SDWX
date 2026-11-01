/** 齐套工卡列表列 */
import type { ProColumns } from '@ant-design/pro-components';
import { Progress, Tag } from 'antd';
import { Link } from 'react-router-dom';
import {
  WORK_CARD_STATUS_OPTIONS,
  WORK_CARD_STATUS_VALUE_ENUM,
} from '@/constants/enums';
import { listWorkstations } from '@/services/workstation';
import { parseApiListResponse } from '@/utils/apiResponse';

export const kitCardColumns: ProColumns<Record<string, any>>[] = [
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
    width: 150,
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
    title: '工位',
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
    title: '齐套满足度',
    dataIndex: '_kitPercent',
    width: 160,
    hideInSearch: true,
    render: (_, r) => {
      if (r._kitTotal == null) return <Tag>未校验</Tag>;
      const pct = r._kitTotal > 0 ? Math.round((r._kitSatisfied / r._kitTotal) * 100) : 100;
      return (
        <Progress
          percent={pct}
          size="small"
          status={r._kitSatisfied === r._kitTotal ? 'success' : 'exception'}
          format={() => `${r._kitSatisfied}/${r._kitTotal}`}
        />
      );
    },
  },
  {
    title: '缺项',
    dataIndex: '_kitMissing',
    width: 70,
    hideInSearch: true,
    render: (_, r) =>
      r._kitMissing == null ? '-' : r._kitMissing > 0 ? <Tag color="red">{r._kitMissing}</Tag> : 0,
  },
];
