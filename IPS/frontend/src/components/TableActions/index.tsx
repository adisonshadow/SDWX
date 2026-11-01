import { Button, Space, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import type { ReactNode } from 'react';
import type { ProColumns } from '@ant-design/pro-components';

/** 操作列通用配置 [规范 1.3]：固定右侧、水平居中 */
export const TABLE_ACTION_COLUMN_BASE = {
  title: '操作',
  valueType: 'option' as const,
  fixed: 'right' as const,
  align: 'center' as const,
};

export function TableActions({ children }: { children: ReactNode }) {
  return (
    <Space size={0} style={{ width: '100%', justifyContent: 'center' }}>
      {children}
    </Space>
  );
}

type TableActionButtonProps = ButtonProps & {
  title: string;
};

export function TableActionButton({ title, onClick, ...rest }: TableActionButtonProps) {
  return (
    <Tooltip title={title}>
      <Button
        type="link"
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e);
        }}
        {...rest}
      />
    </Tooltip>
  );
}

/** ProTable 操作列基础类型 */
export type TableActionColumn<T> = ProColumns<T>;
