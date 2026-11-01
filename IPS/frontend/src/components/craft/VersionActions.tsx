import { Button, Space } from 'antd';
import { getApiErrorMessage } from '@/utils/apiResponse';
import { message, modal } from '@/utils/antdAppApis';

export type VersionActionsProps = {
  status?: string | null;
  readonly?: boolean;
  onPublish?: () => void | Promise<void>;
  onObsolete?: () => void | Promise<void>;
  onRevise?: () => void | Promise<void>;
  loading?: boolean;
  /** 列表操作列用紧凑 link；页头用默认按钮 */
  compact?: boolean;
};

async function runAction(
  fn: () => void | Promise<void>,
  fallbackError: string,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    message.error(getApiErrorMessage(e, fallbackError));
    // 不向上抛：避免确认框卡住；错误已提示
  }
}

/** 版本生命周期按钮：编制中可发布；已发布可作废/升版 */
export function VersionActions({
  status,
  readonly,
  onPublish,
  onObsolete,
  onRevise,
  loading,
  compact = false,
}: VersionActionsProps) {
  if (readonly) return null;

  const btnProps = compact
    ? ({ type: 'link' as const, size: 'small' as const })
    : ({ size: 'middle' as const });

  return (
    <Space size={compact ? 0 : undefined} wrap>
      {status === 'DRAFT' && onPublish && (
        <Button
          {...btnProps}
          type={compact ? 'link' : 'primary'}
          loading={loading}
          onClick={(e) => {
            e.stopPropagation();
            modal.confirm({
              title: '确认发布？',
              content: '发布后不可直接修改，变更须升版。',
              onOk: () => runAction(onPublish, '发布失败'),
            });
          }}
        >
          发布
        </Button>
      )}
      {status === 'PUBLISHED' && onRevise && (
        <Button
          {...btnProps}
          loading={loading}
          onClick={(e) => {
            e.stopPropagation();
            modal.confirm({
              title: '确认升版？',
              content: '将基于当前已发布版本复制生成新的编制中版本，可继续修改后发布。',
              onOk: () => runAction(onRevise, '升版失败'),
            });
          }}
        >
          升版
        </Button>
      )}
      {status === 'PUBLISHED' && onObsolete && (
        <Button
          {...btnProps}
          danger
          loading={loading}
          onClick={(e) => {
            e.stopPropagation();
            modal.confirm({
              title: '确认作废？',
              content: '作废后不可再被新投产引用。',
              onOk: () => runAction(onObsolete, '作废失败'),
            });
          }}
        >
          作废
        </Button>
      )}
    </Space>
  );
}
