/**
 * 订阅 IPS 排产 WebSocket（/ws/ips?token=...）
 */
import { useEffect, useRef, useState } from 'react';
import { getToken } from '@/auth/auth';
import type { WsMessage } from '@ips/shared';

export type IpsWsHandler = (msg: WsMessage) => void;

export function useIpsWebSocket(onMessage: IpsWsHandler, enabled = true) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }

    const token = getToken();
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    const url = `${proto}://${window.location.host}/ws/ips${qs}`;

    let ws: WebSocket | null = null;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryMs = 1500;

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(url);
      ws.onopen = () => {
        setConnected(true);
        retryMs = 1500;
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as WsMessage;
          handlerRef.current(msg);
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        retryTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 1.5, 15000);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
      setConnected(false);
    };
  }, [enabled]);

  return { connected };
}
