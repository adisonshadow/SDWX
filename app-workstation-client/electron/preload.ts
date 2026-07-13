/**
 * preload — 通过 contextBridge 受控暴露 electronAPI 给渲染进程
 *
 * 主/副屏通过 additionalArguments (--fmms-screen=) 注入，与 URL 无关。
 */
import { contextBridge, ipcRenderer } from 'electron';

function readScreenMode(): 'main' | 'secondary' {
  const arg = process.argv.find((item) => item.startsWith('--fmms-screen='));
  return arg?.endsWith('secondary') ? 'secondary' : 'main';
}

const screenMode = readScreenMode();

const electronAPI = {
  /** 当前窗口主/副屏标识 */
  screenMode,
  getLocal: () => ipcRenderer.invoke('fmms:getLocal'),
  setLocal: (patch: { config?: Record<string, unknown>; habits?: Record<string, unknown> }) =>
    ipcRenderer.invoke('fmms:setLocal', patch),
  openSecondary: () => ipcRenderer.invoke('fmms:openSecondary'),
  closeSecondary: () => ipcRenderer.invoke('fmms:closeSecondary'),
  getSecondaryOpen: () => ipcRenderer.invoke('fmms:getSecondaryOpen'),
  toggleSecondary: () => ipcRenderer.invoke('fmms:toggleSecondary'),
  getMainFullscreen: () => ipcRenderer.invoke('fmms:getMainFullscreen') as Promise<boolean>,
  setMainFullscreen: (fullscreen: boolean) =>
    ipcRenderer.invoke('fmms:setMainFullscreen', fullscreen) as Promise<boolean>,
  getSecondaryFullscreen: () => ipcRenderer.invoke('fmms:getSecondaryFullscreen') as Promise<boolean>,
  setSecondaryFullscreen: (fullscreen: boolean) =>
    ipcRenderer.invoke('fmms:setSecondaryFullscreen', fullscreen) as Promise<boolean>,
  onSecondaryChanged: (callback: (open: boolean) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, open: boolean) => callback(open);
    ipcRenderer.on('fmms:secondaryChanged', handler);
    return () => ipcRenderer.removeListener('fmms:secondaryChanged', handler);
  },
  saveConfig: (config: Record<string, unknown>) => ipcRenderer.invoke('fmms:saveConfig', config),
  testConnection: (baseUrl: string) => ipcRenderer.invoke('fmms:testConnection', baseUrl),
  collector: {
    listPorts: () => ipcRenderer.invoke('fmms:collector:listPorts'),
    connect: (toolId: string) => ipcRenderer.invoke('fmms:collector:connect', toolId),
    disconnect: (toolId: string) => ipcRenderer.invoke('fmms:collector:disconnect', toolId),
    status: () => ipcRenderer.invoke('fmms:collector:status'),
  },
  onCollectFrame: (callback: (data: unknown) => void) =>
    ipcRenderer.on('fmms:collectFrame', (_e, data) => callback(data)),
  onConfigChanged: (callback: (config: unknown) => void) =>
    ipcRenderer.on('fmms:configChanged', (_e, config) => callback(config)),
  isElectron: true,
};

contextBridge.exposeInMainWorld('fmmsScreenMode', screenMode);
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
