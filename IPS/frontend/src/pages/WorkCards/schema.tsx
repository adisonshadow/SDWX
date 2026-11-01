/** 工卡列表列定义 */
import type { ProColumns } from '@ant-design/pro-components';
import { Tag } from 'antd';
import {
  SCHEDULE_PRIORITY_OPTIONS,
  SCHEDULE_PRIORITY_VALUE_ENUM,
  WORK_CARD_STATUS_OPTIONS,
  WORK_CARD_STATUS_VALUE_ENUM,
} from '@/constants/enums';
import { listWorkstations } from '@/services/workstation';
import { parseApiListResponse } from '@/utils/apiResponse';

export const workCardColumns: ProColumns<Record<string, any>>[] = [
  { title: '工卡号', dataIndex: 'workCardNo', width: 170, copyable: true },
  {
    title: '令号 ID',
    dataIndex: 'workshopOrderId',
    width: 160,
    ellipsis: true,
    hideInTable: true,
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
    width: 100,
    valueType: 'select',
    fieldProps: { options: SCHEDULE_PRIORITY_OPTIONS, allowClear: true },
    valueEnum: SCHEDULE_PRIORITY_VALUE_ENUM as any,
  },
  {
    title: '工位',
    dataIndex: 'workstationId',
    width: 150,
    ellipsis: true,
    valueType: 'select',
    request: async () => {
      const res = await listWorkstations();
      const { items } = parseApiListResponse<{
        id?: string;
        stationNo: string;
        name?: string;
      }>(res);
      return items.map((i) => ({
        label: `${i.stationNo}${i.name ? `（${i.name}）` : ''}`,
        value: i.id,
      }));
    },
    fieldProps: { showSearch: true, optionFilterProp: 'label', allowClear: true },
  },
  { title: '计划日期', dataIndex: 'plannedDate', valueType: 'date', width: 120, hideInSearch: true },
  { title: '标准工时', dataIndex: 'standardHours', width: 90, hideInSearch: true },
];
