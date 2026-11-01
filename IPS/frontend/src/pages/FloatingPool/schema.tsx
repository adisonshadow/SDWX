/** 游离工卡池列定义（待生效工卡） */
import type { ProColumns } from '@ant-design/pro-components';
import { Tag } from 'antd';
import { Link } from 'react-router-dom';
import {
  HALF_DAY_OPTIONS,
  SCHEDULE_PRIORITY_OPTIONS,
  SCHEDULE_PRIORITY_VALUE_ENUM,
} from '@/constants/enums';
import { listWorkstations } from '@/services/workstation';
import { parseApiListResponse } from '@/utils/apiResponse';
import TitleWithHelp from '@/components/TitleWithHelp';

const halfDayLabel = (v?: string | null) =>
  HALF_DAY_OPTIONS.find((o) => o.value === v)?.label ?? v ?? '';

export const floatingCardColumns: ProColumns<Record<string, any>>[] = [
  {
    title: '工卡号',
    dataIndex: 'workCardNo',
    width: 170,
    copyable: true,
    render: (_, r) =>
      r.id ? <Link to={`/dispatch/workcards/${r.id}`}>{r.workCardNo}</Link> : r.workCardNo,
  },
  {
    title: '齐套要求',
    dataIndex: 'kitRequired',
    width: 100,
    valueType: 'select',
    fieldProps: {
      options: [
        { label: '需要齐套', value: 'true' },
        { label: '无需齐套', value: 'false' },
      ],
      allowClear: true,
    },
    render: (_, r) =>
      r.kitRequired ? <Tag color="orange">需齐套</Tag> : <Tag>无需</Tag>,
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
    title: '标准工时',
    dataIndex: 'standardHours',
    width: 90,
    hideInSearch: true,
  },
  
  {
    title: '目标工位',
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
    render: (_, r) =>
      r.workstationName ||
      (r.workstationId ? String(r.workstationId) : '-'),
  },
  {
    title: '计划时段',
    dataIndex: 'plannedDate',
    width: 150,
    hideInSearch: true,
    sorter: (a, b) => String(a.plannedDate ?? '').localeCompare(String(b.plannedDate ?? '')),
    render: (_, r) => {
      if (!r.plannedDate) return '-';
      const half = halfDayLabel(r.plannedHalfDay);
      return half ? `${r.plannedDate} ${half}` : r.plannedDate;
    },
  },
  {
    title: (
      <TitleWithHelp
        title="DAG Head"
        help="管道序为 1 或未分配时视为队首候选（引擎精确判定待后续接入）。"
      />
    ),
    dataIndex: 'pipelineOrder',
    width: 100,
    hideInSearch: true,
    render: (_, r) => {
      const isHead = r.pipelineOrder == null || Number(r.pipelineOrder) === 1;
      return isHead ? <Tag color="blue">Head</Tag> : <Tag>{r.pipelineOrder}</Tag>;
    },
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
    title: '工序名',
    dataIndex: 'operationName',
    width: 160,
    ellipsis: true,
    hideInSearch: true,
    render: (_, r) => r.operationName || r.name || '-',
  },
];
