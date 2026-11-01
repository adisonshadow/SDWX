/**
 * useOpWs — WebSocket 连接 hook
 *
 * 连接 BFF /ws/op，按工位订阅，分发事件到回调。
 * - 断线指数退避重连（1s→2s→…→30s），不整页刷新；
 * - 握手未通过（4401）说明会话失效，跳登录页；
 * - stationCode 变化时重建连接。
 */
import { useEffect, useRef } from 'react';
import type { WsMessage } from '@fmms/shared';

export type WsHandler = (msg: WsMessage) => void;

const MAX_BACKOFF_MS = 30_000;

export function useOpWs(stationCode: string | undefined, onMessage: WsHandler): void {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!stationCode) return;

    let closed = false;
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws/op?workstation_code=${encodeURIComponent(stationCode)}`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        retry = 0;
        ws?.send(JSON.stringify({ type: 'subscribe', payload: { workstation_code: stationCode } }));
      };

      ws.onmessage = (e) => {
        try {
          handlerRef.current(JSON.parse(e.data) as WsMessage);
        } catch {
          // ignore malformed
        }
      };

      ws.onclose = (ev) => {
        if (closed) return;
        if (ev.code === 4401) {
          // 会话失效：交回登录流程，不再重连
          window.location.href = '/auth/login';
          return;
        }
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** retry);
        retry += 1;
        timer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // 错误后浏览器会触发 onclose，统一在 onclose 里重连
      };
    };

    connect();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [stationCode]);
}
