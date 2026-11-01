/** 预警类型中文标签（对齐 @ips/shared AlertTypeEnum） */
import { AlertTypeEnum } from '@ips/shared';

export const ALERT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(AlertTypeEnum.items).map(([k, v]) => [k, v.label]),
);
