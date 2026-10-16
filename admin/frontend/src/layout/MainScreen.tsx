/**
 * MainScreen — 主屏
 *
 * 顶部 header 由 OPHeaderProvider 统一渲染。
 * 主体：根据状态渲染 工位选择 / 工卡列表 / 工卡详情 / 设备注册
 */
import { useEffect, useState } from 'react';
import { useOpContext } from './OPContext';
import { useLocalConfig } from '../hooks/useLocalConfig';
import StationSelect from '../pages/op/StationSelect';
import WorkCardList from '../pages/op/WorkCardList';
import WorkCardDetail from '../pages/op/WorkCardDetail';
import DeviceRegister from '../pages/op/DeviceRegister';
import type { WorkstationType } from '@fmms/shared';

export function MainScreen() {
  const ctx = useOpContext();
  const { setRequestRegister } = ctx;
  const { config, updateConfig } = useLocalConfig();
  const [view, setView] = useState<'list' | 'register'>('list');

  const selectedType = config?.selected_station_type ?? ctx.workstationType;
  const selectedCode = config?.selected_station_code;

  // 把「进入设备注册」回调挂到 context，供 More 弹窗触发
  // 依赖必须用稳定的 setter：依赖整个 ctx 会在 setRequestRegister 后重建 value → 死循环
  useEffect(() => {
    setRequestRegister(() => setView('register'));
    return () => setRequestRegister(undefined);
  }, [setRequestRegister]);

  const handleStationSelected = (code: string, type: WorkstationType, name: string) => {
    updateConfig({
      selected_station_code: code,
      selected_station_type: type,
      selected_station_name: name,
    });
    ctx.setWorkstationType(type);
    ctx.broadcastSwitchStation(type);
  };

  // 未选类型，或切换类型后尚未选定具体工位 → 工位选择
  if (!selectedType || !selectedCode) {
    return <StationSelect initialType={selectedType} onSelected={handleStationSelected} />;
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
    />
  );
}
