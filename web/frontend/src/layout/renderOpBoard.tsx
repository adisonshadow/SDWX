/**
 * renderOpBoard — 按工位类型渲染对应作业看板
 *
 * 主屏「次屏区域」与副屏共用此分发逻辑，避免重复。
 */
import type { ReactNode } from 'react';
import { Empty } from 'antd';
import { WORKSTATION_TYPE_LABELS, type WorkstationType } from '@fmms/shared';
import { HeaderSuppressedProvider } from './OPHeaderContext';
import SortingBoard from '../pages/op/secondary/SortingBoard';
import InspectionBoard from '../pages/op/secondary/InspectionBoard';
import RepairBoard from '../pages/op/secondary/RepairBoard';
import ReceiveBoard from '../pages/op/secondary/ReceiveBoard';

function Board(type: WorkstationType | undefined, cardId: string): ReactNode {
  if (!type) return <Empty description="等待选择工位…" />;
  switch (type) {
    case 'sorting':
      return <SortingBoard cardId={cardId} />;
    case 'inspection_small':
    case 'inspection_large':
      return <InspectionBoard cardId={cardId} />;
    case 'repair':
      return <RepairBoard cardId={cardId} />;
    case 'receive_send':
      return <ReceiveBoard cardId={cardId} />;
    default:
      return <Empty description={`未支持的工位类型: ${WORKSTATION_TYPE_LABELS[type] ?? type}`} />;
  }
}

/**
 * 渲染工位作业看板。
 * embed=true（嵌入主屏次屏区域）时，用 HeaderSuppressedProvider 包裹，
 * 使看板内部的 useOPHeader 空操作，避免覆盖宿主页 header。
 */
export function renderOpBoard(
  type: WorkstationType | undefined,
  cardId: string,
  embed = false,
): ReactNode {
  const board = Board(type, cardId);
  return embed ? <HeaderSuppressedProvider value={true}>{board}</HeaderSuppressedProvider> : board;
}
