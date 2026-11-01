/**
 * @ips/shared — WebSocket 事件类型
 *
 * 由 backend opHub 广播，frontend 订阅 /ws/ips 接收。
 * 命名约定：{域}.{动作}（点分小写）。
 */
export const WS_EVENTS = {
  WORKCARD_STATUS_CHANGED: 'workcard.status.changed',
  WORKCARD_PROGRESS: 'workcard.progress',
  WORKCARD_EFFECTED: 'workcard.effected',
  WORKCARD_CANCELLED: 'workcard.cancelled',
  PIPELINE_CHANGED: 'pipeline.changed',
  KIT_CHANGED: 'kit.changed',
  ENGINE_LOG: 'engine.log',
  ENGINE_STATUS: 'engine.status',
  ORDER_LAUNCHED: 'order.launched',
  ALERT: 'monitor.alert',
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
