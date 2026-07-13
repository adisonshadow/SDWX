/**
 * OPShell — 工位作业外壳
 *
 * 根据窗口标识 / 路由决定主屏/副屏渲染：
 * - Electron：preload 注入 fmmsScreenMode（主/副窗 URL 均为 /OPWeb）
 * - 浏览器调试：/OPWeb/secondary 或 ?fmms_screen=secondary
 *
 * 主副屏通过 BroadcastChannel 'fmms-op' 同步选中工卡与工位。
 */
import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { OP_SCREEN_CHANNEL } from '@fmms/shared';
import { OPProvider, useOpContext } from './OPContext';
import { OPHeaderProvider } from './OPHeaderContext';
import { MainScreen } from './MainScreen';
import { SecondaryScreen } from './SecondaryScreen';
import { useOpFontScale } from '../hooks/useOpFontScale';
import { isSecondaryScreen } from './opScreenMode';

export default function OPShell() {
  return (
    <OPProvider>
      <OPShellInner />
    </OPProvider>
  );
}

function OPShellInner() {
  const location = useLocation();
  const ctx = useOpContext();
  const fontScale = useOpFontScale();

  const isMain = !isSecondaryScreen(location.pathname, location.search);

  // 监听 BroadcastChannel（主副屏同步）
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(OP_SCREEN_CHANNEL);
    channel.onmessage = (e) => {
      const { event, payload } = e.data ?? {};
      if (event === 'selectCard') {
        ctx.setSelectedCardId(payload?.workCardId);
        if (payload?.workstationType) {
          ctx.setWorkstationType(payload.workstationType);
        }
      } else if (event === 'deselectCard') {
        ctx.setSelectedCardId(undefined);
      } else if (event === 'selectPart') {
        ctx.setSelectedPartId(payload?.partId);
      } else if (event === 'navigate') {
        ctx.setSecondaryTab(payload?.tab);
      }
    };
    return () => channel.close();
  }, [ctx]);

  const content = useMemo(
    () => (isMain ? <MainScreen /> : <SecondaryScreen />),
    [isMain],
  );

  return <OPHeaderProvider fontScale={fontScale}>{content}</OPHeaderProvider>;
}
