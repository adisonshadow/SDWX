import type { ProTableProps } from '@ant-design/pro-components';

/**
 * ProTable 默认 options [规范 1.4]
 * density: false（antd 6 下 DensityIcon 有 ref 警告）
 */
export const DEFAULT_PRO_TABLE_OPTIONS: NonNullable<ProTableProps<any, any>['options']> = {
  density: false,
  fullScreen: true,
  reload: true,
  setting: true,
};
