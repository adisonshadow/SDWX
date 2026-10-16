/**
 * OPShell — 工位作业外壳
 *
 * 根据窗口标识 / 路由决定主屏/副屏渲染：
 * - Electron：preload 注入 fmmsScreenMode（主/副窗 URL 均为 /OPWeb）
 * - 浏览器调试：/OPWeb/secondary 或 ?fmms_screen=secondary
 *
 * 主副屏通过 BroadcastChannel 'fmms-op' 同步选中工卡与工位。
 */
import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { OP_SCREEN_CHANNEL } from '@fmms/shared';
import { OPProvider, useOpContext } from './OPContext';
import { OPHeaderProvider } from './OPHeaderContext';
import { MainScreen } from './MainScreen';
import { SecondaryScreen } from './SecondaryScreen';
import { useOpFontScale } from '../hooks/useOpFontScale';
import { LocalConfigProvider, useLocalConfig } from '../hooks/useLocalConfig';
import { isSecondaryScreen } from './opScreenMode';
import type { WorkstationType } from '@fmms/shared';

const SECONDARY_HEARTBEAT_MS = 3000;
const SECONDARY_HEARTBEAT_TIMEOUT_MS = 8000;

export default function OPShell() {
  return (
    <LocalConfigProvider>
      <OPProvider>
        <OPShellInner />
      </OPProvider>
    </LocalConfigProvider>
  );
}

function OPShellInner() {
  const location = useLocation();
  const {
    setSelectedCardId,
    setWorkstationType,
    setSelectedPartId,
    setSecondaryTab,
    setSecondaryOnline,
  } = useOpContext();
  const { updateConfig } = useLocalConfig();
  const fontScale = useOpFontScale();

  const isMain = !isSecondaryScreen(location.pathname, location.search);

  // 副屏窗口标题（覆盖 index.html 的 document.title，Electron Titlebar 会跟随后端）
  useEffect(() => {
    const prev = document.title;
    if (!isMain) document.title = '操作副屏';
    return () => {
      document.title = prev;
    };
  }, [isMain]);

  // 监听 BroadcastChannel（主副屏同步 + 副屏心跳）
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(OP_SCREEN_CHANNEL);

    // 主屏：副屏心跳超时判定（8s 未收到心跳 → 判定副屏离线）
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const armTimeout = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setSecondaryOnline(false), SECONDARY_HEARTBEAT_TIMEOUT_MS);
    };

    channel.onmessage = (e) => {
      const { event } = e.data ?? {};
      const payload = e.data?.payload;
      if (event === 'selectCard') {
        setSelectedCardId(payload?.workCardId);
        if (payload?.workstationType) {
          setWorkstationType(payload.workstationType);
        }
      } else if (event === 'deselectCard') {
        setSelectedCardId(undefined);
      } else if (event === 'switchStation') {
        const nextType = payload?.workstationType as WorkstationType | undefined;
        setWorkstationType(nextType);
        setSelectedCardId(undefined);
        setSelectedPartId(undefined);
        // 副屏（及主屏若收到自己广播）同步本地配置，避免旧 station_type 回写
        if (!isMain) {
          void updateConfig({
            selected_station_type: nextType,
            selected_station_code: undefined,
            selected_station_name: undefined,
          });
        }
      } else if (event === 'selectPart') {
        setSelectedPartId(payload?.partId);
      } else if (event === 'navigate') {
        setSecondaryTab(payload?.tab);
      } else if (event === 'secondaryOnline' || event === 'secondaryHeartbeat') {
        setSecondaryOnline(true);
        if (isMain) armTimeout();
      } else if (event === 'secondaryOffline') {
        setSecondaryOnline(false);
      }
    };
    return () => {
      channel.close();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [
    isMain,
    setSelectedCardId,
    setWorkstationType,
    setSelectedPartId,
    setSecondaryTab,
    setSecondaryOnline,
    updateConfig,
  ]);

  // 副屏：周期心跳广播 + 卸载/关闭时广播离线
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (isMain) return;
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(OP_SCREEN_CHANNEL);
    channelRef.current = channel;
    const beat = () => channel.postMessage({ event: 'secondaryHeartbeat', payload: {} });
    channel.postMessage({ event: 'secondaryOnline', payload: {} });
    const timer = setInterval(beat, SECONDARY_HEARTBEAT_MS);
    const goOffline = () => channel.postMessage({ event: 'secondaryOffline', payload: {} });
    window.addEventListener('beforeunload', goOffline);
    return () => {
      clearInterval(timer);
      window.removeEventListener('beforeunload', goOffline);
      goOffline();
      channel.close();
      channelRef.current = null;
    };
  }, [isMain]);

  const content = useMemo(
    () => (isMain ? <MainScreen /> : <SecondaryScreen />),
    [isMain],
  );

  return <OPHeaderProvider fontScale={fontScale}>{content}</OPHeaderProvider>;
}
