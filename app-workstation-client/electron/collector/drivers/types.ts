/**
 * CollectorDriver — 采集驱动接口
 *
 * 各协议驱动实现此接口。采集服务通过统一接口管理连接/数据/断开。
 */
export interface DriverStatus {
  online: boolean;
  lastError?: string;
}

export interface CollectorDriver {
  /** 连接设备 */
  connect(config: Record<string, unknown>): Promise<void>;
  /** 注册原始帧回调 */
  onFrame(cb: (raw: Buffer) => void): void;
  /** 断开 */
  disconnect(): Promise<void>;
  /** 当前状态 */
  getStatus(): DriverStatus;
}
