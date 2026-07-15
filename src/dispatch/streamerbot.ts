import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

export interface StreamerbotOptions {
  host: string;
  port: number;
  endpoint: string;
}

export interface SbAction {
  id: string;
  name: string;
  group?: string;
  enabled?: boolean;
}

interface QueuedMessage {
  payload: Record<string, unknown>;
  queuedAt: number;
}

const OUTBOX_LIMIT = 100;
/** Queued alerts older than this are dropped on reconnect — a "you docked" alert from 10 minutes ago is noise, not news. */
const OUTBOX_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * WebSocket client for the Streamer.bot server (Servers/Clients -> WebSocket Server).
 * Auto-reconnects with backoff, queues DoAction requests while disconnected,
 * and caches the remote action list for the UI.
 *
 * Emits: 'connected', 'disconnected', 'actions' (SbAction[]).
 */
export class StreamerbotClient extends EventEmitter {
  private opts: StreamerbotOptions;
  private ws: WebSocket | null = null;
  private outbox: QueuedMessage[] = [];
  /** DoAction request ids awaiting a response, so rejections can be surfaced. */
  private pending = new Map<string, string>();
  private reconnectDelay = 1000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  public connected = false;
  public actions: SbAction[] = [];
  public lastError: string | null = null;

  constructor(opts: StreamerbotOptions) {
    super();
    this.opts = opts;
  }

  get url(): string {
    const ep = this.opts.endpoint.startsWith('/') ? this.opts.endpoint : `/${this.opts.endpoint}`;
    return `ws://${this.opts.host}:${this.opts.port}${ep}`;
  }

  get queuedCount(): number {
    return this.outbox.length;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  private connect(): void {
    if (this.stopped) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on('open', () => {
      this.connected = true;
      this.reconnectDelay = 1000;
      this.lastError = null;
      console.log(`[streamerbot] Connected to ${this.url}`);
      this.emit('connected');
      this.requestActions();
      this.flushOutbox();
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg?.id && this.pending.has(msg.id)) {
          const actionName = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.status === 'error') {
            const error = String(msg.error ?? `Streamer.bot rejected the request — does an action named "${actionName}" exist?`);
            console.warn(`[streamerbot] DoAction "${actionName}" failed: ${error}`);
            this.emit('requestError', { id: msg.id, error });
          }
        }
        if (msg?.actions && Array.isArray(msg.actions)) {
          this.actions = msg.actions.map((a: Record<string, unknown>) => ({
            id: String(a.id ?? ''),
            name: String(a.name ?? ''),
            group: a.group ? String(a.group) : undefined,
            enabled: a.enabled !== false,
          }));
          this.emit('actions', this.actions);
        }
      } catch {
        /* ignore non-JSON frames */
      }
    });

    ws.on('error', (err) => {
      this.lastError = err.message;
    });

    ws.on('close', () => {
      if (this.ws !== ws) return; // stale socket from before an updateOptions() restart
      const wasConnected = this.connected;
      this.connected = false;
      this.ws = null;
      if (wasConnected) {
        console.warn('[streamerbot] Disconnected');
        this.emit('disconnected');
      }
      if (!this.stopped) {
        this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10_000);
      }
    });
  }

  /** Reconnect with new host/port/endpoint (settings UI). Keeps the outbox. */
  updateOptions(opts: StreamerbotOptions): void {
    this.stop();
    this.opts = opts;
    this.actions = [];
    this.lastError = null;
    this.reconnectDelay = 1000;
    this.start();
  }

  requestActions(): void {
    this.sendRaw({ request: 'GetActions', id: randomUUID() });
  }

  private trackPending(id: string, actionName: string): void {
    this.pending.set(id, actionName);
    // Responses normally arrive immediately; anything older is abandoned.
    if (this.pending.size > 200) {
      const oldest = this.pending.keys().next().value;
      if (oldest !== undefined) this.pending.delete(oldest);
    }
  }

  /**
   * Invoke a Streamer.bot action by name with args. Args surface inside the
   * action as variables (%argName%). Returns the delivery status and the
   * request id ('requestError' is emitted with this id if Streamer.bot
   * rejects the request later).
   */
  doAction(actionName: string, args: Record<string, string>): { status: 'sent' | 'queued'; id: string } {
    const id = randomUUID();
    const payload = {
      request: 'DoAction',
      action: { name: actionName },
      args,
      id,
    };
    if (this.sendRaw(payload)) {
      this.trackPending(id, actionName);
      return { status: 'sent', id };
    }
    this.outbox.push({ payload, queuedAt: Date.now() });
    if (this.outbox.length > OUTBOX_LIMIT) this.outbox.shift();
    return { status: 'queued', id };
  }

  private sendRaw(payload: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  private flushOutbox(): void {
    const now = Date.now();
    const pending = this.outbox.filter((m) => now - m.queuedAt <= OUTBOX_MAX_AGE_MS);
    const dropped = this.outbox.length - pending.length;
    if (dropped > 0) console.log(`[streamerbot] Dropped ${dropped} stale queued alert(s)`);
    this.outbox = [];
    for (const msg of pending) {
      if (this.sendRaw(msg.payload)) {
        const p = msg.payload as { id?: string; action?: { name?: string } };
        if (p.id && p.action?.name) this.trackPending(p.id, p.action.name);
      } else {
        this.outbox.push(msg);
      }
    }
    if (pending.length > 0) {
      console.log(`[streamerbot] Flushed ${pending.length - this.outbox.length} queued alert(s)`);
    }
  }
}
