/**
 * useOpFontScale — 读取用户字体档位偏好
 */
import { useLocalConfig } from './useLocalConfig';
import type { OpFontScale } from '@fmms/shared';

export const OP_FONT_SCALES: OpFontScale[] = ['small', 'medium', 'large'];

export const OP_FONT_SCALE_LABELS: Record<OpFontScale, string> = {
  small: '小',
  medium: '中',
  large: '大',
};

export function useOpFontScale(): OpFontScale {
  const { habits } = useLocalConfig();
  return habits.font_scale ?? 'medium';
}
