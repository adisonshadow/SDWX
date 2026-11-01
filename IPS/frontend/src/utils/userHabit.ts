const STORAGE_PREFIX = 'ips.userHabit.v1';

function readStorage(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeStorage(data: Record<string, unknown>) {
  try {
    localStorage.setItem(STORAGE_PREFIX, JSON.stringify(data));
  } catch {
    // ignore quota / private mode errors
  }
}

/** 读取浏览器中保存的用户操作习惯 */
export function getUserHabit<T>(key: string, defaultValue: T): T {
  const store = readStorage();
  if (!(key in store)) return defaultValue;
  return store[key] as T;
}

/** 写入用户操作习惯到浏览器 */
export function setUserHabit<T>(key: string, value: T): void {
  const store = readStorage();
  store[key] = value;
  writeStorage(store);
}

/** ProTable 查询区折叠状态 key */
export function proTableSearchCollapseKey(pageId: string) {
  return `proTable.searchCollapsed.${pageId}`;
}

/** 侧栏 / 面板折叠状态 key */
export function panelCollapseKey(panelId: string) {
  return `panel.collapsed.${panelId}`;
}
