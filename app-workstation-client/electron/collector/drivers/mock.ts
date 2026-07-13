/**
 * MockDriver — 模拟采集驱动
 *
 * 无真实硬件时联调用。每 3 秒发送一个随机数值帧（模拟测量工具读数）。
 */
import type { CollectorDriver } from './types';
import type { DriverStatus } from './types';

export class MockDriver implements CollectorDriver {
  private timer: NodeJS.Timeout | null = null;
  private callback: ((raw: Buffer) => void) | null = null;
  private status: DriverStatus = { online: false };
  private counter = 0;

  async connect(): Promise<void> {
    this.status = { online: true };
    this.timer = setInterval(() => {
      if (!this.callback) return;
      this.counter++;
      // 模拟一条测量数据: 值 + 时间戳
      const value = (50 + (Math.random() - 0.5) * 0.05).toFixed(4);
      const raw = Buffer.from(`MOCK,${this.counter},${value},${Date.now()}\n`, 'utf-8');
      this.callback(raw);
    }, 3000);
  }

  onFrame(cb: (raw: Buffer) => void): void {
    this.callback = cb;
    if (this.status.online && !this.timer) {
      this.connect().catch(() => {
        /* ignore */
      });
    }
  }

  async disconnect(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status = { online: false };
    this.callback = null;
  }

  getStatus(): DriverStatus {
    return this.status;
  }
}
