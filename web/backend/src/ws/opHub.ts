/**
 * WebSocket Hub — 工位实时推送
 *
 * - 握手校验 BFF 会话 Cookie（未登录直接 4401 关闭），不接受 query 里的 token；
 * - 30s 心跳，两次没 pong 就断开；
 * - 订阅按 workstation_code 过滤：没订阅的客户端收不到工位定向消息。
 *
 * 事件见 @fmms/shared WS_EVENTS。
 */
import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'http';
import type { WsMessage } from '@fmms/shared';
import { SESSION_COOKIE, getSession, readCookieFromString } from '../auth/session.js';

const HEARTBEAT_MS = 30_000;

interface ClientMeta {
  ws: WebSocket;
  workstationCode?: string;
  userId?: string;
  alive: boolean;
}

class OpHub {
  private clients = new Set<ClientMeta>();
  private wss: WebSocketServer | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  attach(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws/op' });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));

    this.heartbeat = setInterval(() => this.sweep(), HEARTBEAT_MS);
    this.heartbeat.unref?.();

    this.wss.on('close', () => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
    });
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const sessionId = readCookieFromString(req.headers.cookie, SESSION_COOKIE);
    const session = getSession(sessionId);
    if (!session) {
      ws.close(4401, 'unauthorized');
      return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost');
    const meta: ClientMeta = {
      ws,
      alive: true,
      workstationCode: url.searchParams.get('workstation_code') ?? undefined,
      userId: session.user.user_id,
    };
    this.clients.add(meta);

    ws.on('pong', () => {
      meta.alive = true;
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; payload?: Record<string, unknown> };
        if (msg.type === 'subscribe' && msg.payload?.workstation_code) {
          meta.workstationCode = String(msg.payload.workstation_code);
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

  private sweep(): void {
    for (const client of this.clients) {
      if (!client.alive) {
        client.ws.terminate();
        this.clients.delete(client);
        continue;
      }
      client.alive = false;
      try {
        client.ws.ping();
      } catch {
        this.clients.delete(client);
      }
    }
  }

  /** 广播消息，可限定工位；定向消息只发给订阅了该工位的客户端 */
  broadcast(message: WsMessage, workstationCode?: string): void {
    const text = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      if (workstationCode && client.workstationCode !== workstationCode) continue;
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
