/** 标准工序列表列 */
import type { ProColumns } from '@ant-design/pro-components';
import {
  OPERATION_CATEGORY_OPTIONS,
  OPERATION_CATEGORY_VALUE_ENUM,
  VERSION_STATUS_OPTIONS,
  VERSION_STATUS_VALUE_ENUM,
} from '@/constants/enums';
import { VersionStatusTag } from '@/components/craft/VersionStatusTag';
import { Tag } from 'antd';

export const processOperationColumns: ProColumns<Record<string, any>>[] = [
  { title: '工序编码', dataIndex: 'operationNo', width: 140, copyable: true },
  {
    title: '类别',
    dataIndex: 'category',
    width: 100,
    valueType: 'select',
    fieldProps: { options: OPERATION_CATEGORY_OPTIONS, allowClear: true },
    valueEnum: OPERATION_CATEGORY_VALUE_ENUM,
  },
  { title: '版本', dataIndex: 'version', width: 70, hideInSearch: true },
  {
    title: '状态',
    dataIndex: 'versionStatus',
    width: 110,
    valueType: 'select',
    fieldProps: { options: VERSION_STATUS_OPTIONS, allowClear: true },
    valueEnum: VERSION_STATUS_VALUE_ENUM,
    render: (_, r) => <VersionStatusTag status={r.versionStatus} />,
  },
  { title: '标准工时', dataIndex: 'standardHours', width: 100, hideInSearch: true },
  {
    title: '齐套性',
    dataIndex: 'kitRequired',
    width: 90,
    valueType: 'select',
    fieldProps: {
      options: [
        { label: '齐套性', value: 'true' },
        { label: '非齐套', value: 'false' },
      ],
      allowClear: true,
    },
    render: (_, r) =>
      r.kitRequired ? <Tag color="orange">齐套性</Tag> : <Tag>非齐套</Tag>,
  },
  {
    title: '目标工位',
    dataIndex: 'defaultWorkstationId',
    width: 160,
    ellipsis: true,
    hideInSearch: true,
  },
];
