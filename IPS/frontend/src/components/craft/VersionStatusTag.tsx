import { Tag } from 'antd';
import { VERSION_STATUS_VALUE_ENUM } from '@/constants/enums';

const COLOR: Record<string, string> = {
  DRAFT: 'processing',
  PUBLISHED: 'success',
  OBSOLETE: 'default',
};

export function VersionStatusTag({ status }: { status?: string | null }) {
  if (!status) return <Tag>—</Tag>;
  const meta = VERSION_STATUS_VALUE_ENUM[status];
  const text = typeof meta === 'object' && meta && 'text' in meta ? String(meta.text) : status;
  return <Tag color={COLOR[status] ?? 'default'}>{text}</Tag>;
}
