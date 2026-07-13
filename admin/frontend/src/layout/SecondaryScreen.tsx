/**
 * SecondaryScreen — 副屏
 *
 * 按工位类型渲染对应工作台；内容与主屏不同。
 * 未选工卡时提示先打开工卡。
 */
import { useEffect } from 'react';
import { Empty } from 'antd';
import { useOpContext } from './OPContext';
import { useOPHeader } from './OPHeaderContext';
import { useLocalConfig } from '../hooks/useLocalConfig';
import { WORKSTATION_TYPE_LABELS, type WorkstationType } from '@fmms/shared';
import SortingBoard from '../pages/op/secondary/SortingBoard';
import InspectionBoard from '../pages/op/secondary/InspectionBoard';
import RepairBoard from '../pages/op/secondary/RepairBoard';
import ReceiveBoard from '../pages/op/secondary/ReceiveBoard';

export function SecondaryScreen() {
  const ctx = useOpContext();
  const { config } = useLocalConfig();
  const workstationType = ctx.workstationType ?? config?.selected_station_type;
  const { selectedCardId } = ctx;

  useEffect(() => {
    if (!ctx.workstationType && config?.selected_station_type) {
      ctx.setWorkstationType(config.selected_station_type);
    }
  }, [ctx.workstationType, ctx.setWorkstationType, config?.selected_station_type]);

  const renderBoard = (type: WorkstationType, cardId: string) => {
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
        return <Empty description={`未支持的工位类型: ${type}`} />;
    }
  };

  if (!workstationType) {
    return <SecondaryWaiting title="等待主屏选择工位..." headerTitle="副屏" />;
  }

  if (!selectedCardId) {
    return (
      <SecondaryWaiting
        title="请先打开一个工卡"
        headerTitle={WORKSTATION_TYPE_LABELS[workstationType]}
      />
    );
  }

  return renderBoard(workstationType, selectedCardId);
}

function SecondaryWaiting({ title, headerTitle }: { title: string; headerTitle: string }) {
  useOPHeader({ title: headerTitle });

  return (
    <div
      className="op-body"
      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}
    >
      <Empty description={title} />
    </div>
  );
}
