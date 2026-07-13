/**
 * 本地配置存储 — electron-store 封装
 *
 * 存储: OP_BASE 地址、SSO 配置、上次选择工位、双屏模式、用户操作习惯
 */
import Store from 'electron-store';
import type { LocalConfig, UserHabits } from '@fmms/shared';

interface StoreSchema {
  config: LocalConfig;
  habits: UserHabits;
}

const DEFAULT_CONFIG: LocalConfig = {
  op_base_url: '',
  eadaf_frontend_url: 'http://localhost:9527',
  sso_application_id: '10000000-0001-4000-8000-000000000006',
  selected_station_code: undefined,
  selected_station_type: undefined,
  dual_screen: true,
  default_fullscreen: false,
};

const DEFAULT_HABITS: UserHabits = {
  recent_card_ids: [],
  page_size: 20,
  sound_alarm: true,
  last_secondary_tab: undefined,
};

/** 内部使用的存储接口（规避 conf 泛型推断的版本差异） */
interface StoreLike {
  get(key: 'config'): LocalConfig;
  get(key: 'habits'): UserHabits;
  set(key: 'config', value: LocalConfig): void;
  set(key: 'habits', value: UserHabits): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rawStore = new Store<StoreSchema>({ name: 'fmms-workstation', defaults: { config: DEFAULT_CONFIG, habits: DEFAULT_HABITS } } as any);
export const store = rawStore as unknown as StoreLike;

export function getConfig(): LocalConfig {
  return store.get('config');
}

export function setConfig(patch: Partial<LocalConfig>): LocalConfig {
  const next = { ...store.get('config'), ...patch };
  store.set('config', next);
  return next;
}

export function getHabits(): UserHabits {
  return store.get('habits');
}

export function setHabits(patch: Partial<UserHabits>): UserHabits {
  const next = { ...store.get('habits'), ...patch };
  store.set('habits', next);
  return next;
}

export function isConfigured(): boolean {
  return Boolean(getConfig().op_base_url);
}
