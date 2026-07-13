/**
 * Electron 主进程入口
 *
 * 双窗口策略：
 * - 主/副窗均加载 {OP_BASE}/OPWeb（同一 URL）
 * - 主/副屏由 webPreferences.additionalArguments (--fmms-screen=) 区分，不依赖 URL 路径
 * - 主/副屏全屏可独立控制（见 UserHabits / default_fullscreen）
 *
 * 若 OP_BASE 未配置 → 先打开内置配置页
 */
import { app, BrowserWindow, screen, shell, type WebPreferences } from 'electron';
import * as path from 'path';
import { getConfig, setConfig, getHabits, setHabits, isConfigured } from './config/store';
import { registerIpc } from './ipc';
import { startCollector } from './collector';

let mainWindow: BrowserWindow | null = null;
let secondaryWindow: BrowserWindow | null = null;
let configWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

type FmmsScreen = 'main' | 'secondary';

function buildOpUrl(): string {
  const cfg = getConfig();
  const base = cfg.op_base_url.replace(/\/$/, '');
  return `${base}/OPWeb`;
}

function resolveMainFullscreen(): boolean {
  const habits = getHabits();
  if (habits.main_fullscreen !== undefined) return habits.main_fullscreen;
  return getConfig().default_fullscreen ?? false;
}

function resolveSecondaryFullscreen(): boolean {
  const habits = getHabits();
  if (habits.secondary_fullscreen !== undefined) return habits.secondary_fullscreen;
  return getConfig().default_fullscreen ?? false;
}

function isWindowFullscreen(win: BrowserWindow): boolean {
  if (process.platform === 'darwin') return win.isSimpleFullScreen();
  return win.isFullScreen();
}

function applyWindowFullscreen(win: BrowserWindow, fullscreen: boolean): void {
  if (process.platform === 'darwin') {
    win.setSimpleFullScreen(fullscreen);
    return;
  }
  win.setFullScreen(fullscreen);
}

function initialFullscreenOptions(): Pick<Electron.BrowserWindowConstructorOptions, 'fullscreen' | 'simpleFullscreen'> {
  const enabled = resolveMainFullscreen();
  if (process.platform === 'darwin') {
    return { simpleFullscreen: enabled };
  }
  return { fullscreen: enabled };
}

function initialSecondaryFullscreenOptions(): Pick<
  Electron.BrowserWindowConstructorOptions,
  'fullscreen' | 'simpleFullscreen'
> {
  const enabled = resolveSecondaryFullscreen();
  if (process.platform === 'darwin') {
    return { simpleFullscreen: enabled };
  }
  return { fullscreen: enabled };
}

function getMainFullscreen(): boolean {
  if (mainWindow && !mainWindow.isDestroyed()) return isWindowFullscreen(mainWindow);
  return resolveMainFullscreen();
}

function getSecondaryFullscreen(): boolean {
  if (secondaryWindow && !secondaryWindow.isDestroyed()) return isWindowFullscreen(secondaryWindow);
  return resolveSecondaryFullscreen();
}

function setMainFullscreen(fullscreen: boolean): boolean {
  setHabits({ main_fullscreen: fullscreen });
  if (mainWindow && !mainWindow.isDestroyed()) {
    applyWindowFullscreen(mainWindow, fullscreen);
  }
  return fullscreen;
}

function setSecondaryFullscreen(fullscreen: boolean): boolean {
  setHabits({ secondary_fullscreen: fullscreen });
  if (secondaryWindow && !secondaryWindow.isDestroyed()) {
    applyWindowFullscreen(secondaryWindow, fullscreen);
  }
  return fullscreen;
}

function opWebPreferences(screen: FmmsScreen): WebPreferences {
  return {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    partition: 'persist:fmms',
    additionalArguments: [`--fmms-screen=${screen}`],
  };
}

/** 主窗口 */
async function createMainWindow(): Promise<BrowserWindow> {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    ...initialFullscreenOptions(),
    autoHideMenuBar: true,
    webPreferences: opWebPreferences('main'),
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    void openSecondaryWindow();
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (secondaryWindow && !secondaryWindow.isDestroyed()) {
      secondaryWindow.close();
    }
    secondaryWindow = null;
  });

  await mainWindow.loadURL(buildOpUrl());
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  return mainWindow;
}

/** 打开副窗口 */
async function openSecondaryWindow(): Promise<BrowserWindow> {
  const targetUrl = buildOpUrl();

  if (secondaryWindow && !secondaryWindow.isDestroyed()) {
    secondaryWindow.focus();
    await secondaryWindow.loadURL(targetUrl);
    return secondaryWindow;
  }

  const displays = screen.getAllDisplays();
  const targetDisplay = displays.length > 1 ? displays[1] : displays[0];
  const { x, y, width, height } = targetDisplay.bounds;

  secondaryWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    ...initialSecondaryFullscreenOptions(),
    frame: false,
    autoHideMenuBar: true,
    webPreferences: opWebPreferences('secondary'),
  });

  await secondaryWindow.loadURL(targetUrl);

  secondaryWindow.on('closed', () => {
    secondaryWindow = null;
    notifySecondaryChanged(false);
  });

  notifySecondaryChanged(true);
  return secondaryWindow;
}

function closeSecondaryWindow(): void {
  if (secondaryWindow && !secondaryWindow.isDestroyed()) {
    secondaryWindow.close();
  }
  secondaryWindow = null;
}

function isSecondaryOpen(): boolean {
  return secondaryWindow !== null && !secondaryWindow.isDestroyed();
}

async function toggleSecondaryWindow(): Promise<boolean> {
  if (isSecondaryOpen()) {
    closeSecondaryWindow();
    return false;
  }
  await openSecondaryWindow();
  return true;
}

function notifySecondaryChanged(open: boolean): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('fmms:secondaryChanged', open);
  }
}

/** 配置页窗口（内置 React 页） */
async function createConfigWindow(): Promise<BrowserWindow> {
  configWindow = new BrowserWindow({
    width: 600,
    height: 680,
    title: '工位客户端配置',
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const distPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html')
    : path.join(app.getAppPath(), 'dist', 'index.html');
  await configWindow.loadFile(distPath);

  configWindow.on('closed', () => {
    configWindow = null;
  });

  return configWindow;
}

/** 应用启动：根据配置决定开配置页还是双屏 */
async function bootstrap(): Promise<void> {
  registerIpc({
    getConfig,
    setConfig,
    openSecondary: () => openSecondaryWindow(),
    closeSecondary: () => closeSecondaryWindow(),
    getSecondaryOpen: () => isSecondaryOpen(),
    toggleSecondary: () => toggleSecondaryWindow(),
    getMainFullscreen,
    setMainFullscreen,
    getSecondaryFullscreen,
    setSecondaryFullscreen,
    onConfigSaved: () => restartApp(),
  });

  startCollector();

  if (isConfigured()) {
    await createMainWindow();
    if (getConfig().dual_screen) {
      await openSecondaryWindow();
    }
  } else {
    await createConfigWindow();
  }
}

/** 配置保存后重启到 OPWeb */
async function restartApp(): Promise<void> {
  if (configWindow && !configWindow.isDestroyed()) configWindow.close();
  if (!mainWindow) {
    await createMainWindow();
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(bootstrap);

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await bootstrap();
    }
  });
}

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
});

export { mainWindow, secondaryWindow };
