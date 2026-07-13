/**
 * OPContext — 主副屏共享状态
 *
 * 持有：当前工位类型、选中工卡、选中零件、副屏标签页等。
 * 主屏修改后通过 BroadcastChannel 广播给副屏。
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { OP_SCREEN_CHANNEL } from '@fmms/shared';
import type { WorkstationType } from '@fmms/shared';

interface OPState {
  workstationType: WorkstationType | undefined;
  selectedCardId: string | undefined;
  selectedPartId: string | undefined;
  secondaryTab: string | undefined;
  setWorkstationType: (t: WorkstationType | undefined) => void;
  setSelectedCardId: (id: string | undefined) => void;
  setSelectedPartId: (id: string | undefined) => void;
  setSecondaryTab: (tab: string | undefined) => void;
  /** 广播选中工卡 (主屏调用，副屏监听) */
  broadcastSelectCard: (workCardId: string, workstationType: WorkstationType) => void;
  /** 广播取消工卡选择 (主屏返回列表时) */
  broadcastDeselectCard: () => void;
  broadcastSelectPart: (partId: string) => void;
}

const Ctx = createContext<OPState | null>(null);

export function OPProvider({ children }: { children: ReactNode }) {
  const [workstationType, setWorkstationType] = useState<WorkstationType | undefined>(undefined);
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>(undefined);
  const [selectedPartId, setSelectedPartId] = useState<string | undefined>(undefined);
  const [secondaryTab, setSecondaryTab] = useState<string | undefined>(undefined);

  const broadcast = useCallback((event: string, payload: Record<string, unknown>) => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(OP_SCREEN_CHANNEL);
    channel.postMessage({ event, payload });
    channel.close();
  }, []);

  const broadcastSelectCard = useCallback(
    (workCardId: string, wst: WorkstationType) => {
      broadcast('selectCard', { workCardId, workstationType: wst });
    },
    [broadcast],
  );

  const broadcastDeselectCard = useCallback(() => {
    broadcast('deselectCard', {});
  }, [broadcast]);

  const broadcastSelectPart = useCallback(
    (partId: string) => {
      broadcast('selectPart', { partId });
    },
    [broadcast],
  );

  const value: OPState = {
    workstationType,
    selectedCardId,
    selectedPartId,
    secondaryTab,
    setWorkstationType,
    setSelectedCardId,
    setSelectedPartId,
    setSecondaryTab,
    broadcastSelectCard,
    broadcastDeselectCard,
    broadcastSelectPart,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOpContext(): OPState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOpContext 必须在 OPProvider 内使用');
  return ctx;
}

/** 兼容 OPShell 直接调用 useOpContext 的导出 (Provider 包裹在内部) */
export function useOpContextSafe(): OPState {
  return useOpContext();
}
