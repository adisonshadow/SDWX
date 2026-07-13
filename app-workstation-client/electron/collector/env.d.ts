/**
 * 可选原生依赖的类型声明
 *
 * serialport / node-hid 为动态 import 的可选依赖（无硬件环境不安装），
 * 此处声明为 any 以通过类型检查。
 */
declare module 'serialport' {
  export class SerialPort {
    constructor(options: Record<string, unknown>);
    static list(): Promise<Array<{ path: string; manufacturer?: string }>>;
    on(event: string, cb: (data: Buffer) => void): void;
    close(): Promise<void>;
  }
}

declare module 'node-hid' {
  export const devices: () => Array<{ path?: string; vendorId: number; productId: number }>;
  export class HID {
    constructor(path: string);
    on(event: 'data', cb: (data: Buffer) => void): void;
    close(): void;
  }
}
