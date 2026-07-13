/**
 * SerialDriver — 串口采集驱动 (serialport)
 *
 * 串口 RS232/RS485 工具。动态 import serialport 避免无硬件环境打包问题。
 */
import type { CollectorDriver, DriverStatus } from './types';

type SerialPortLike = {
  on(event: string, cb: (data: Buffer) => void): void;
  close(): Promise<void>;
};

export class SerialDriver implements CollectorDriver {
  private port: SerialPortLike | null = null;
  private callback: ((raw: Buffer) => void) | null = null;
  private status: DriverStatus = { online: false };

  async connect(config: Record<string, unknown>): Promise<void> {
    const { SerialPort } = await import('serialport');
    const portPath = config.port as string;
    if (!portPath) throw new Error('缺少串口路径 port');

    this.port = new SerialPort({
      path: portPath,
      baudRate: (config.baud_rate as number) ?? 9600,
      dataBits: (config.data_bits as number) ?? 8,
      stopBits: (config.stop_bits as number) ?? 1,
      parity: (config.parity as 'none' | 'even' | 'odd') ?? 'none',
      autoOpen: true,
    }) as unknown as SerialPortLike;

    this.port!.on('data', (data: Buffer) => {
      if (this.callback) this.callback(data);
    });

    this.status = { online: true };
  }

  onFrame(cb: (raw: Buffer) => void): void {
    this.callback = cb;
  }

  async disconnect(): Promise<void> {
    if (this.port) {
      await this.port.close();
      this.port = null;
    }
    this.status = { online: false };
    this.callback = null;
  }

  getStatus(): DriverStatus {
    return this.status;
  }
}
