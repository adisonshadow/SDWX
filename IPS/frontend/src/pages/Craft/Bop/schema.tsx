/** BOP 方案列表列 */
import type { ProColumns } from '@ant-design/pro-components';
import {
  REPAIR_METHOD_OPTIONS,
  REPAIR_METHOD_VALUE_ENUM,
  VERSION_STATUS_OPTIONS,
  VERSION_STATUS_VALUE_ENUM,
} from '@/constants/enums';
import { VersionStatusTag } from '@/components/craft/VersionStatusTag';

export const bopSchemeColumns: ProColumns<Record<string, any>>[] = [
  { title: '装备型号', dataIndex: 'productModel', width: 140, copyable: true },
  {
    title: '修理方式',
    dataIndex: 'repairMethod',
    width: 110,
    valueType: 'select',
    fieldProps: { options: REPAIR_METHOD_OPTIONS, allowClear: true },
    valueEnum: REPAIR_METHOD_VALUE_ENUM,
  },
  { title: '批架次', dataIndex: 'batchSerial', width: 100, hideInSearch: true },
  { title: '关联BOM', dataIndex: 'bomSchemeId', width: 140, ellipsis: true, hideInSearch: true },
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
  { title: '更新时间', dataIndex: 'updatedAt', valueType: 'dateTime', width: 170, hideInSearch: true },
];
