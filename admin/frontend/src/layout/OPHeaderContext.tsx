/**
 * OPHeaderContext — 全局唯一 header 配置
 *
 * 各页面通过 useOPHeader 注册标题、返回、右侧操作区；
 * OPShell 顶层渲染 OPHeaderBar，保证全站只有一个 header。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import OPHeader, { type OPHeaderButton } from '../components/OPHeader';
import OPMoreModal from '../components/OPMoreModal';
import SecondaryScreenToggle from '../components/SecondaryScreenToggle';
import { useLocalConfig } from '../hooks/useLocalConfig';
import { isSecondaryScreen } from './opScreenMode';
import type { OpFontScale } from '@fmms/shared';

export interface OPHeaderConfig {
  title: string;
  onBack?: () => void;
  rightButtons?: OPHeaderButton[];
  rightSlot?: ReactNode;
  /** 当前页刷新回调；未注册时「更多」内刷新将 reload 页面 */
  onRefresh?: () => void;
}

interface OPHeaderContextValue {
  setHeader: (config: OPHeaderConfig | null) => void;
}

const Ctx = createContext<OPHeaderContextValue | null>(null);

export function OPHeaderProvider({
  children,
  fontScale,
}: {
  children: ReactNode;
  fontScale?: OpFontScale;
}) {
  const [config, setConfigState] = useState<OPHeaderConfig | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const { config: localConfig } = useLocalConfig();
  const location = useLocation();
  const isMainScreen = !isSecondaryScreen(location.pathname, location.search);

  const setHeader = useCallback((next: OPHeaderConfig | null) => {
    setConfigState(next);
  }, []);

  const value = useMemo(() => ({ setHeader }), [setHeader]);

  return (
    <Ctx.Provider value={value}>
      <div
        className="op-app"
        data-font-scale={fontScale ?? 'medium'}
        style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {config && (
          <OPHeader
            title={config.title}
            onBack={config.onBack}
            rightButtons={config.rightButtons}
            rightSlot={config.rightSlot}
            trailingSlot={isMainScreen ? <SecondaryScreenToggle /> : undefined}
            onMore={() => setMoreOpen(true)}
          />
        )}
        <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
      </div>
      <OPMoreModal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        stationCode={localConfig?.selected_station_code}
        onRefresh={config?.onRefresh}
      />
    </Ctx.Provider>
  );
}

/** 页面内注册 header；卸载时自动清除 */
export function useOPHeader(config: OPHeaderConfig) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOPHeader 必须在 OPHeaderProvider 内使用');

  const { title, onBack, rightButtons, rightSlot, onRefresh } = config;

  useEffect(() => {
    ctx.setHeader({ title, onBack, rightButtons, rightSlot, onRefresh });
    return () => ctx.setHeader(null);
  }, [ctx, title, onBack, rightButtons, rightSlot, onRefresh]);
}
