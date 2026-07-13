/**
 * useLocalConfig — 读写 Electron 本地配置与习惯
 *
 * Electron 环境: window.electronAPI.* (preload 注入)
 * 纯浏览器环境: 降级到 localStorage
 */
import { useCallback, useEffect, useState } from 'react';
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

const isElectron = (): boolean => Boolean(window.electronAPI);

const defaultHabits: UserHabits = {
  recent_card_ids: [],
  page_size: 20,
  sound_alarm: true,
  last_secondary_tab: undefined,
  font_scale: 'medium',
};

export function useLocalConfig() {
  const [config, setConfig] = useState<LocalConfig | null>(null);
  const [habits, setHabits] = useState<UserHabits>(defaultHabits);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (isElectron()) {
          const { config: c, habits: h } = await window.electronAPI!.getLocal();
          if (active) {
            setConfig(c);
            setHabits(h);
          }
        } else {
          const rawC = localStorage.getItem(LS_CONFIG_KEY);
          const rawH = localStorage.getItem(LS_HABITS_KEY);
          if (active) {
            setConfig(
              rawC
                ? (JSON.parse(rawC) as LocalConfig)
                : null,
            );
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

  const updateConfig = useCallback(
    async (patch: Partial<LocalConfig>) => {
      setConfig((prev) => {
        const next = { ...(prev ?? defaultConfig), ...patch } as LocalConfig;
        if (isElectron()) {
          window.electronAPI?.setLocal({ config: patch });
        } else {
          localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(next));
        }
        return next;
      });
    },
    [],
  );

  const updateHabits = useCallback(async (patch: Partial<UserHabits>) => {
    setHabits((prev) => {
      const next = { ...prev, ...patch };
      if (isElectron()) {
        window.electronAPI?.setLocal({ habits: patch });
      } else {
        localStorage.setItem(LS_HABITS_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  return { config, habits, loading, updateConfig, updateHabits, isElectron: isElectron() };
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

const defaultConfig: LocalConfig = {
  op_base_url: '',
  eadaf_frontend_url: '',
  sso_application_id: '',
  dual_screen: true,
  default_fullscreen: false,
};
