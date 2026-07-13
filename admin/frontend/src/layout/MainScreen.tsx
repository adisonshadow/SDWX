/**
 * MainScreen — 主屏
 *
 * 顶部 header 由 OPHeaderProvider 统一渲染。
 * 主体：根据状态渲染 工位选择 / 工卡列表 / 工卡详情 / 设备注册
 */
import { useState } from 'react';
import { useOpContext } from './OPContext';
import { useLocalConfig } from '../hooks/useLocalConfig';
import StationSelect from '../pages/op/StationSelect';
import WorkCardList from '../pages/op/WorkCardList';
import WorkCardDetail from '../pages/op/WorkCardDetail';
import DeviceRegister from '../pages/op/DeviceRegister';
import type { WorkstationType } from '@fmms/shared';

export function MainScreen() {
  const ctx = useOpContext();
  const { config, updateConfig } = useLocalConfig();
  const [view, setView] = useState<'list' | 'register'>('list');

  const selectedType = config?.selected_station_type ?? ctx.workstationType;

  const handleStationSelected = (code: string, type: WorkstationType, name: string) => {
    updateConfig({
      selected_station_code: code,
      selected_station_type: type,
      selected_station_name: name,
    });
    ctx.setWorkstationType(type);
  };

  if (!selectedType) {
    return <StationSelect onSelected={handleStationSelected} />;
  }

  if (view === 'register') {
    return <DeviceRegister onBack={() => setView('list')} />;
  }

  if (ctx.selectedCardId) {
    return (
      <WorkCardDetail
        cardId={ctx.selectedCardId}
        onBack={() => {
          ctx.setSelectedCardId(undefined);
          ctx.broadcastDeselectCard();
        }}
      />
    );
  }

  return (
    <WorkCardList
      stationType={selectedType}
      onSelectCard={(id) => {
        ctx.setSelectedCardId(id);
        ctx.broadcastSelectCard(id, selectedType);
      }}
      onRegister={() => setView('register')}
    />
  );
}
