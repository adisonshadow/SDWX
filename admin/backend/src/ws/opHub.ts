/**
 * WebSocket Hub — 工位实时推送
 *
 * 事件见 @fmms/shared WS_EVENTS。
 * 客户端连接时可订阅特定工位 (subscribe {workstation_code})。
 */
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { WsMessage } from '@fmms/shared';

interface ClientMeta {
  ws: WebSocket;
  workstationCode?: string;
  userId?: string;
}

class OpHub {
  private clients = new Set<ClientMeta>();
  private wss: WebSocketServer | null = null;

  attach(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws/op' });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req.url ?? ''));
  }

  private onConnection(ws: WebSocket, url: string): void {
    const meta: ClientMeta = { ws };
    // 从 URL query 解析 token & workstation_code
    try {
      const u = new URL(url, 'http://localhost');
      const token = u.searchParams.get('token');
      const wsCode = u.searchParams.get('workstation_code');
      if (token) {
        // 简单解析（不强制校验，WS 握手后由业务侧校验）
        meta.userId = token;
      }
      if (wsCode) meta.workstationCode = wsCode;
    } catch {
      // ignore
    }
    this.clients.add(meta);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; payload?: Record<string, unknown> };
        if (msg.type === 'subscribe' && msg.payload?.workstation_code) {
          meta.workstationCode = msg.payload.workstation_code as string;
        }
      } catch {
        // ignore malformed
      }
    });

    ws.on('close', () => {
      this.clients.delete(meta);
    });

    ws.on('error', () => {
      this.clients.delete(meta);
    });
  }

  /** 广播消息，可限定工位 */
  broadcast(message: WsMessage, workstationCode?: string): void {
    const text = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      if (workstationCode && client.workstationCode && client.workstationCode !== workstationCode) continue;
      client.ws.send(text);
    }
  }

  /** 广播给所有客户端 */
  broadcastAll(message: WsMessage): void {
    this.broadcast(message);
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

export const opHub = new OpHub();
