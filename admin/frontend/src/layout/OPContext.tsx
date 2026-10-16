/**
 * OPContext — 主副屏共享状态
 *
 * 持有：当前工位类型、选中工卡、选中零件、副屏标签页等。
 * 主屏修改后通过 BroadcastChannel 广播给副屏。
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { OP_SCREEN_CHANNEL } from '@fmms/shared';
import type { WorkstationType } from '@fmms/shared';

interface OPState {
  workstationType: WorkstationType | undefined;
  selectedCardId: string | undefined;
  selectedPartId: string | undefined;
  secondaryTab: string | undefined;
  /** 副屏窗口是否在线（主屏据此决定是否在「次屏区域」内嵌看板） */
  secondaryOnline: boolean;
  /** 进入设备注册页（由 MainScreen 注册，More 弹窗触发） */
  requestRegister?: () => void;
  setWorkstationType: (t: WorkstationType | undefined) => void;
  setSelectedCardId: (id: string | undefined) => void;
  setSelectedPartId: (id: string | undefined) => void;
  setSecondaryTab: (tab: string | undefined) => void;
  setSecondaryOnline: (online: boolean) => void;
  setRequestRegister: (fn: (() => void) | undefined) => void;
  /** 广播选中工卡 (主屏调用，副屏监听) */
  broadcastSelectCard: (workCardId: string, workstationType: WorkstationType) => void;
  /** 广播取消工卡选择 (主屏返回列表时) */
  broadcastDeselectCard: () => void;
  /** 广播切换工位类型（主屏切换后同步副屏） */
  broadcastSwitchStation: (workstationType: WorkstationType | undefined) => void;
  broadcastSelectPart: (partId: string) => void;
}

const Ctx = createContext<OPState | null>(null);

export function OPProvider({ children }: { children: ReactNode }) {
  const [workstationType, setWorkstationType] = useState<WorkstationType | undefined>(undefined);
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>(undefined);
  const [selectedPartId, setSelectedPartId] = useState<string | undefined>(undefined);
  const [secondaryTab, setSecondaryTab] = useState<string | undefined>(undefined);
  const [secondaryOnline, setSecondaryOnline] = useState(false);
  const [requestRegister, setRequestRegisterState] = useState<(() => void) | undefined>(undefined);

  // 包装 setter：避免把回调函数误当成 React 的 state updater
  const setRequestRegister = useCallback((fn: (() => void) | undefined) => {
    setRequestRegisterState(() => fn);
  }, []);

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

  const broadcastSwitchStation = useCallback(
    (wst: WorkstationType | undefined) => {
      broadcast('switchStation', { workstationType: wst });
    },
    [broadcast],
  );

  const broadcastSelectPart = useCallback(
    (partId: string) => {
      broadcast('selectPart', { partId });
    },
    [broadcast],
  );

  const value = useMemo<OPState>(
    () => ({
      workstationType,
      selectedCardId,
      selectedPartId,
      secondaryTab,
      secondaryOnline,
      requestRegister,
      setWorkstationType,
      setSelectedCardId,
      setSelectedPartId,
      setSecondaryTab,
      setSecondaryOnline,
      setRequestRegister,
      broadcastSelectCard,
      broadcastDeselectCard,
      broadcastSwitchStation,
      broadcastSelectPart,
    }),
    [
      workstationType,
      selectedCardId,
      selectedPartId,
      secondaryTab,
      secondaryOnline,
      requestRegister,
      setRequestRegister,
      broadcastSelectCard,
      broadcastDeselectCard,
      broadcastSwitchStation,
      broadcastSelectPart,
    ],
  );

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
