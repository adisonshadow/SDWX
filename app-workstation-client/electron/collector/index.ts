/**
 * 采集服务 — 测量数据采集与转发
 *
 * 设计原则：
 * - Electron 读原始帧 → 组装 CollectFrame → POST BFF /api/op/ingest
 * - 不做协议解析（结构化在 BFF/EADAF ingest）
 * - 可插拔驱动：mock / serial / usbHid / modbus(预留)
 * - 主窗口登录后从 webview session 取用户 token 做认证
 */
import { BrowserWindow } from 'electron';
import { getConfig } from '../config/store';
import { MockDriver } from './drivers/mock';
import type { CollectorDriver } from './drivers/types';
import { pipeline } from './pipeline';

const USE_MOCK = process.env.USE_MOCK_DRIVER !== 'false'; // 默认 mock

let activeDriver: CollectorDriver | null = null;
let userToken: string | null = null;

/** 启动采集服务 */
export function startCollector(): void {
  // 默认启动 mock 驱动（无真实硬件时联调用）
  if (USE_MOCK) {
    startMockDriver();
  }
  // 真实硬件驱动按 EADAF MeasuringTool 配置动态加载（TODO: 读工具配置后连接）
}

function startMockDriver(): void {
  activeDriver = new MockDriver();
  activeDriver.onFrame((raw: Buffer) => {
    handleFrame(raw, 'MOCK-TOOL');
  });
  // mock 驱动自动定时发数据
  // eslint-disable-next-line no-console
  console.log('[collector] mock 驱动已启动');
}

/** 处理一帧原始数据 */
async function handleFrame(raw: Buffer, toolCode: string): Promise<void> {
  const cfg = getConfig();
  if (!cfg.op_base_url) return;

  // 获取用户 token（从主窗口 webview）
  if (!userToken) {
    userToken = await fetchUserToken();
  }

  const frame = {
    tool_code: toolCode,
    station_code: cfg.selected_station_code ?? '',
    operator_id: undefined,
    raw: raw.toString('base64'),
    ts: new Date().toISOString(),
  };

  // 转发到 BFF
  const base = cfg.op_base_url.replace(/\/$/, '');
  pipeline(base, frame, userToken).catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[collector] 转发失败:', (e as Error).message);
  });

  // 回显给渲染进程（副屏可监听）
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('fmms:collectFrame', {
      tool_code: toolCode,
      raw: frame.raw,
      ts: frame.ts,
    });
  }
}

/** 从主窗口 webview 读取用户 token (localStorage) */
async function fetchUserToken(): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!win) return null;
  try {
    const token = await win.webContents.executeJavaScript(
      `localStorage.getItem('fmms_token')`,
      true,
    );
    return token as string | null;
  } catch {
    return null;
  }
}

/** 列出可用串口 */
export async function listSerialPorts(): Promise<string[]> {
  // 动态 import serialport 避免无硬件环境加载失败
  try {
    const { SerialPort } = await import('serialport');
    const ports = await SerialPort.list();
    return ports.map((p: { path: string }) => p.path);
  } catch {
    return [];
  }
}
