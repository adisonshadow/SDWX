/** BOM 方案列表列 */
import type { ProColumns } from '@ant-design/pro-components';
import { VERSION_STATUS_OPTIONS, VERSION_STATUS_VALUE_ENUM } from '@/constants/enums';
import { VersionStatusTag } from '@/components/craft/VersionStatusTag';

export const bomSchemeColumns: ProColumns<Record<string, any>>[] = [
  { title: '装备型号', dataIndex: 'productModel', width: 160, copyable: true },
  { title: '版本', dataIndex: 'version', width: 80, hideInSearch: true },
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
  { title: '创建时间', dataIndex: 'createdAt', valueType: 'dateTime', width: 170, hideInSearch: true },
];
