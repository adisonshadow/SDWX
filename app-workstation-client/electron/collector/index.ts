/**
 * 工位客户端不再自采测量数据。
 * 测量由工位上的无界面适配程序完成，结果 POST 到 BFF /api/collect/measurement。
 * 这里不再读取已废弃的 localStorage.fmms_token，也不再向 /api/op/ingest 推帧。
 */
export function startCollector(): void {
  // eslint-disable-next-line no-console
  console.log('[collector] 工位内采集已下线，测量结果由适配程序回调 /api/collect/measurement');
}

/** 列出可用串口（设备注册时仍可能用到） */
export async function listSerialPorts(): Promise<string[]> {
  try {
    const { SerialPort } = await import('serialport');
    const ports = await SerialPort.list();
    return ports.map((p: { path: string }) => p.path);
  } catch {
    return [];
  }
}
