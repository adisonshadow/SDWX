/**
 * useLocalConfig — 读写 Electron 本地配置与习惯（全局共享）
 *
 * Electron 环境: window.electronAPI.* (preload 注入)
 * 纯浏览器环境: 降级到 localStorage
 *
 * 必须在 LocalConfigProvider 内使用，避免各组件各自一份 state 导致切换工位不刷新。
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { LocalConfig, UserHabits, WorkstationType } from '@fmms/shared';

const LS_CONFIG_KEY = 'fmms_local_config';
const LS_HABITS_KEY = 'fmms_user_habits';

// Electron preload 注入的 API 接口
interface ElectronAPI {
  getLocal(): Promise<{ config: LocalConfig; habits: UserHabits }>;
  setLocal(patch: { config?: Partial<LocalConfig>; habits?: Partial<UserHabits> }): Promise<void>;
  openSecondary?(url?: string): Promise<unknown>;
  screenMode?: 'main' | 'secondary';
  closeSecondary?(): Promise<boolean>;
  getSecondaryOpen?(): Promise<boolean>;
  toggleSecondary?(): Promise<boolean>;
  onSecondaryChanged?(callback: (open: boolean) => void): (() => void) | void;
  getMainFullscreen?(): Promise<boolean>;
  setMainFullscreen?(fullscreen: boolean): Promise<boolean>;
  getSecondaryFullscreen?(): Promise<boolean>;
  setSecondaryFullscreen?(fullscreen: boolean): Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

const isElectronEnv = (): boolean => Boolean(window.electronAPI);

const defaultHabits: UserHabits = {
  recent_card_ids: [],
  page_size: 20,
  sound_alarm: true,
  last_secondary_tab: undefined,
  font_scale: 'medium',
};

const defaultConfig: LocalConfig = {
  op_base_url: '',
  eadaf_frontend_url: '',
  sso_application_id: '',
  dual_screen: true,
  default_fullscreen: false,
};

interface LocalConfigContextValue {
  config: LocalConfig | null;
  habits: UserHabits;
  loading: boolean;
  updateConfig: (patch: Partial<LocalConfig>) => Promise<void>;
  updateHabits: (patch: Partial<UserHabits>) => Promise<void>;
  isElectron: boolean;
}

const LocalConfigContext = createContext<LocalConfigContextValue | null>(null);

export function LocalConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<LocalConfig | null>(null);
  const [habits, setHabits] = useState<UserHabits>(defaultHabits);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (isElectronEnv()) {
          const { config: c, habits: h } = await window.electronAPI!.getLocal();
          if (active) {
            setConfig(c);
            setHabits(h);
          }
        } else {
          const rawC = localStorage.getItem(LS_CONFIG_KEY);
          const rawH = localStorage.getItem(LS_HABITS_KEY);
          if (active) {
            setConfig(rawC ? (JSON.parse(rawC) as LocalConfig) : null);
            setHabits(rawH ? (JSON.parse(rawH) as UserHabits) : defaultHabits);
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // 浏览器多窗口：同步 localStorage 变更
  useEffect(() => {
    if (isElectronEnv()) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_CONFIG_KEY && e.newValue) {
        try {
          setConfig(JSON.parse(e.newValue) as LocalConfig);
        } catch {
          /* ignore */
        }
      }
      if (e.key === LS_HABITS_KEY && e.newValue) {
        try {
          setHabits(JSON.parse(e.newValue) as UserHabits);
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const updateConfig = useCallback(async (patch: Partial<LocalConfig>) => {
    setConfig((prev) => {
      const next = { ...(prev ?? defaultConfig), ...patch } as LocalConfig;
      if (isElectronEnv()) {
        window.electronAPI?.setLocal({ config: patch });
      } else {
        localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const updateHabits = useCallback(async (patch: Partial<UserHabits>) => {
    setHabits((prev) => {
      const next = { ...prev, ...patch };
      if (isElectronEnv()) {
        window.electronAPI?.setLocal({ habits: patch });
      } else {
        localStorage.setItem(LS_HABITS_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const value = useMemo<LocalConfigContextValue>(
    () => ({
      config,
      habits,
      loading,
      updateConfig,
      updateHabits,
      isElectron: isElectronEnv(),
    }),
    [config, habits, loading, updateConfig, updateHabits],
  );

  return createElement(LocalConfigContext.Provider, { value }, children);
}

export function useLocalConfig() {
  const ctx = useContext(LocalConfigContext);
  if (!ctx) {
    throw new Error('useLocalConfig 必须在 LocalConfigProvider 内使用');
  }
  return ctx;
}

/** 选择/切换工位（写本地） */
export function useSelectWorkstation() {
  const { config, updateConfig } = useLocalConfig();
  const select = useCallback(
    (code: string, type: WorkstationType) => {
      updateConfig({ selected_station_code: code, selected_station_type: type });
    },
    [updateConfig],
  );
  return { selectedCode: config?.selected_station_code, selectedType: config?.selected_station_type, select };
}
