/**
 * IPC 处理 — 主进程响应渲染进程的请求
 */
import { ipcMain, BrowserWindow } from 'electron';
import { getConfig, setConfig, getHabits, setHabits } from './config/store';
import type { LocalConfig, UserHabits } from '@fmms/shared';

export interface IpcDeps {
  getConfig: typeof getConfig;
  setConfig: typeof setConfig;
  openSecondary: () => Promise<unknown>;
  closeSecondary: () => void;
  getSecondaryOpen: () => boolean;
  toggleSecondary: () => Promise<boolean>;
  getMainFullscreen: () => boolean;
  setMainFullscreen: (fullscreen: boolean) => boolean;
  getSecondaryFullscreen: () => boolean;
  setSecondaryFullscreen: (fullscreen: boolean) => boolean;
  onConfigSaved: () => void | Promise<void>;
}

export function registerIpc(deps: IpcDeps): void {
  for (const channel of [
    'fmms:getMainFullscreen',
    'fmms:setMainFullscreen',
    'fmms:getSecondaryFullscreen',
    'fmms:setSecondaryFullscreen',
  ]) {
    ipcMain.removeHandler(channel);
  }

  // 读本地配置+习惯
  ipcMain.handle('fmms:getLocal', () => {
    return { config: getConfig(), habits: getHabits() };
  });

  // 更新配置/习惯
  ipcMain.handle('fmms:setLocal', (_e, patch: { config?: Partial<LocalConfig>; habits?: Partial<UserHabits> }) => {
    if (patch.config) setConfig(patch.config);
    if (patch.habits) setHabits(patch.habits);
    return { config: getConfig(), habits: getHabits() };
  });

  // 打开副窗口
  ipcMain.handle('fmms:openSecondary', () => deps.openSecondary());

  // 关闭副窗口
  ipcMain.handle('fmms:closeSecondary', () => {
    deps.closeSecondary();
    return false;
  });

  // 副窗口是否已打开
  ipcMain.handle('fmms:getSecondaryOpen', () => deps.getSecondaryOpen());

  // 切换副窗口
  ipcMain.handle('fmms:toggleSecondary', () => deps.toggleSecondary());

  ipcMain.handle('fmms:getMainFullscreen', () => deps.getMainFullscreen());
  ipcMain.handle('fmms:setMainFullscreen', (_e, fullscreen: boolean) => deps.setMainFullscreen(fullscreen));
  ipcMain.handle('fmms:getSecondaryFullscreen', () => deps.getSecondaryFullscreen());
  ipcMain.handle('fmms:setSecondaryFullscreen', (_e, fullscreen: boolean) =>
    deps.setSecondaryFullscreen(fullscreen),
  );

  // 配置页保存
  ipcMain.handle('fmms:saveConfig', async (_e, config: Partial<LocalConfig>) => {
    const next = setConfig(config);
    // 通知所有窗口配置已变更
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('fmms:configChanged', next);
    }
    await deps.onConfigSaved();
    return next;
  });

  // 测试连接 (ping OP_BASE)
  ipcMain.handle('fmms:testConnection', async (_e, baseUrl: string) => {
    try {
      const url = baseUrl.replace(/\/$/, '') + '/auth/check';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return { ok: res.ok, status: res.status };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
}
