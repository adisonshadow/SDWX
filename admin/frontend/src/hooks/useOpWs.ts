/**
 * useOpWs — WebSocket 连接 hook
 * 连接 BFF /ws/op，按工位订阅，分发事件到回调
 */
import { useEffect, useRef } from 'react';
import { getToken } from '../auth/auth';
import type { WsMessage } from '@fmms/shared';

export type WsHandler = (msg: WsMessage) => void;

export function useOpWs(workstationCode: string | undefined, onMessage: WsHandler): void {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    const token = getToken();
    if (!token || !workstationCode) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws/op?token=${encodeURIComponent(token)}&workstation_code=${encodeURIComponent(workstationCode)}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', payload: { workstation_code: workstationCode } }));
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WsMessage;
        handlerRef.current(msg);
      } catch {
        // ignore
      }
    };
    // 斥地重连：5s 后重试
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const originalOnClose = ws.onclose;
    ws.onclose = (ev) => {
      originalOnClose?.call(ws, ev);
      if (!closed) {
        retryTimer = setTimeout(() => location.reload(), 5000);
      }
    };

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws.close();
    };
  }, [workstationCode]);
}
