import type { WSConnectionStatus, WSMessage, WSSubscribeMessage } from "@/shared/types";
import { getWsUrl } from "@/lib/api-client";

type MessageHandler<T = unknown> = (payload: WSMessage<T>) => void;
type Unsubscribe = () => void;

class SonarWSClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler<unknown>>>();
  private statusListeners = new Set<(s: WSConnectionStatus) => void>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private readonly RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000];

  getStatus(): WSConnectionStatus {
    if (!this.ws) return "disconnected";
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return "connecting";
      case WebSocket.OPEN:
        return "connected";
      default:
        return "disconnected";
    }
  }

  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) return;

    this.intentionalClose = false;
    this.notifyStatus("connecting");

    try {
      const url = getWsUrl();
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.notifyStatus("connected");
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as WSMessage<unknown>;
          if (msg.type === "heartbeat") return;
          const handlers = this.handlers.get(msg.topic);
          if (handlers) {
            for (const h of handlers) h(msg);
          }
          // Also notify wildcard handlers
          const wildcardHandlers = this.handlers.get("*");
          if (wildcardHandlers) {
            for (const h of wildcardHandlers) h(msg);
          }
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onclose = () => {
        this.notifyStatus("disconnected");
        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        this.notifyStatus("error");
      };
    } catch {
      this.notifyStatus("error");
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  send(msg: WSSubscribeMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on<T>(topic: string, handler: MessageHandler<T>): Unsubscribe {
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, new Set());
    }
    const h = handler as MessageHandler<unknown>;
    this.handlers.get(topic)!.add(h);
    return () => {
      this.handlers.get(topic)?.delete(h);
    };
  }

  onStatusChange(cb: (s: WSConnectionStatus) => void): Unsubscribe {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  private notifyStatus(status: WSConnectionStatus): void {
    for (const cb of this.statusListeners) cb(status);
  }

  private scheduleReconnect(): void {
    const delay =
      this.RETRY_DELAYS[Math.min(this.reconnectAttempts, this.RETRY_DELAYS.length - 1)];
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalClose) {
        this.connect();
      }
    }, delay);
  }
}

// Global singleton
export const sonarWSClient = new SonarWSClient();
