'use client';

/**
 * Browser realtime client.
 *
 * One API, two transports:
 *
 *   socketio – talks to the in-process Socket.IO server (Node host). The server
 *             owns room membership, so the client simply stays connected.
 *   supabase – subscribes to Supabase Realtime broadcast channels (serverless).
 *             Here the CLIENT owns membership: it must subscribe to the same
 *             topic names the server broadcasts to (`user:<id>`,
 *             `conversation:<id>`).
 *   none     – nothing is configured; calls become no-ops and the UI relies on
 *             its own refetching. The app must never error in this mode.
 *
 * Both heavy SDKs are imported lazily so neither lands in the initial bundle.
 */
import { supabasePublicConfig, realtimePreference } from '../env-config';

export const REALTIME_EVENTS = [
  'message:new',
  'message:edited',
  'message:deleted',
  'message:reaction',
  'message:typing',
  'message:read',
  'presence:update',
  'conversation:added',
  'notification:new',
] as const;

export type RealtimeEvent = (typeof REALTIME_EVENTS)[number];
export type RealtimeHandler = (payload: any) => void;

export type RealtimeMode = 'socketio' | 'supabase' | 'none';

export const userRoom = (userId: string) => `user:${userId}`;
export const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;

interface StartOptions {
  userId: string;
  /** Probe for a Socket.IO endpoint before falling back. Default true. */
  trySocketIO?: boolean;
}

class RealtimeClient {
  private handlers = new Map<string, Set<RealtimeHandler>>();
  private socket: any = null;
  private supabase: any = null;
  private presenceChannel: any = null;
  private channels = new Map<string, any>();
  private userId: string | null = null;
  private mode: RealtimeMode | null = null;
  private starting: Promise<RealtimeMode> | null = null;
  private presenceOnline = new Set<string>();

  getMode(): RealtimeMode | null {
    return this.mode;
  }

  /** Idempotent. Safe to call from any component. */
  start(opts: StartOptions): Promise<RealtimeMode> {
    if (this.mode) return Promise.resolve(this.mode);
    if (this.starting) return this.starting;
    this.starting = this.doStart(opts)
      .then((m) => {
        this.mode = m;
        return m;
      })
      .catch(() => {
        // Realtime is an enhancement — never let it break the page.
        this.mode = 'none';
        return 'none' as RealtimeMode;
      });
    return this.starting;
  }

  private async doStart(opts: StartOptions): Promise<RealtimeMode> {
    this.userId = opts.userId;
    const prefer = realtimePreference;

    const wantSocketIO =
      prefer === 'socketio' || (prefer === 'auto' && opts.trySocketIO !== false);

    if (prefer !== 'supabase' && wantSocketIO && (await this.hasSocketServer())) {
      const { io } = await import('socket.io-client');
      const socket = io({ path: '/api/socket', withCredentials: true, transports: ['websocket', 'polling'] });
      this.socket = socket;
      // Fan Socket.IO events into the local handler registry.
      for (const ev of REALTIME_EVENTS) {
        socket.on(ev, (payload: any) => this.dispatch(ev, payload));
      }
      return 'socketio';
    }

    const { url, anonKey } = supabasePublicConfig;
    if (prefer !== 'socketio' && url && anonKey) {
      const { createClient } = await import('@supabase/supabase-js');
      this.supabase = createClient(url, anonKey, {
        realtime: { params: { eventsPerSecond: 10 } },
        auth: { persistSession: false },
      });
      await this.joinRoom(userRoom(opts.userId));
      await this.startPresence(opts.userId);
      return 'supabase';
    }

    return 'none';
  }

  /**
   * Is there actually a Socket.IO server behind /api/socket? On serverless
   * platforms that path does not exist, and connecting would just spam errors.
   */
  private async hasSocketServer(): Promise<boolean> {
    try {
      const res = await fetch('/api/socket/?EIO=4&transport=polling', {
        method: 'GET',
        signal: AbortSignal.timeout(2500),
      });
      // Socket.IO answers the handshake with a plain-text payload (or 200); a
      // Next 404 page means there is no server.
      return res.ok && !(res.headers.get('content-type') ?? '').includes('text/html');
    } catch {
      return false;
    }
  }

  // ── Supabase channel management ────────────────────────────────────────
  private async joinRoom(room: string): Promise<void> {
    if (!this.supabase) return;
    if (this.channels.has(room)) return;
    const channel = this.supabase.channel(room);
    for (const ev of REALTIME_EVENTS) {
      channel.on('broadcast', { event: ev }, ({ payload }: { payload: any }) => {
        this.dispatch(ev, payload);
      });
    }
    await new Promise<void>((resolve) => {
      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve();
      });
    });
    this.channels.set(room, channel);
  }

  private async startPresence(userId: string): Promise<void> {
    if (!this.supabase) return;
    const channel = this.supabase.channel('arjun-presence', {
      config: { presence: { key: userId } },
    });
    channel.on('presence', { event: 'sync' }, () => {
      const state = (channel.presenceState() ?? {}) as Record<string, { userId?: string }[]>;
      const online = new Set(Object.keys(state));
      // Diff against the previous snapshot so the UI sees enter/leave events.
      for (const id of online) {
        if (!this.presenceOnline.has(id)) this.dispatch('presence:update', { userId: id, online: true });
      }
      for (const id of this.presenceOnline) {
        if (!online.has(id)) this.dispatch('presence:update', { userId: id, online: false });
      }
      this.presenceOnline = online;
    });
    await new Promise<void>((resolve) => {
      channel.subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId, online_at: new Date().toISOString() });
        }
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve();
      });
    });
    this.presenceChannel = channel;
  }

  // ── public API ─────────────────────────────────────────────────────────
  on(event: string, handler: RealtimeHandler): void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
  }

  off(event: string, handler: RealtimeHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  /** Subscribe to a conversation's events (Socket.IO join / Supabase channel). */
  joinConversation(conversationId: string): void {
    if (this.socket) {
      this.socket.emit('conversation:join', conversationId);
      return;
    }
    if (this.supabase) void this.joinRoom(conversationRoom(conversationId));
  }

  setTyping(conversationId: string, isTyping: boolean): void {
    const payload = { conversationId, isTyping };
    if (this.socket) {
      this.socket.emit('message:typing', payload);
      return;
    }
    const channel = this.supabase?.getChannel(conversationRoom(conversationId));
    if (channel) {
      void channel.send({ type: 'broadcast', event: 'message:typing', payload });
    }
  }

  /** Which of `userIds` are currently online. */
  watchPresence(userIds: string[], cb: (online: string[]) => void): void {
    if (this.socket) {
      this.socket.emit('presence:watch', userIds, (res: { online?: string[] }) => cb(res?.online ?? []));
      return;
    }
    if (this.supabase && this.presenceChannel) {
      const state = this.presenceChannel.presenceState() ?? {};
      cb(userIds.filter((id) => Object.prototype.hasOwnProperty.call(state, id)));
      return;
    }
    cb([]);
  }

  close(): void {
    try {
      this.socket?.disconnect();
    } catch {
      /* ignore */
    }
    this.socket = null;
    for (const ch of this.channels.values()) {
      try {
        this.supabase?.removeChannel(ch);
      } catch {
        /* ignore */
      }
    }
    this.channels.clear();
    try {
      if (this.presenceChannel) this.supabase?.removeChannel(this.presenceChannel);
    } catch {
      /* ignore */
    }
    this.presenceChannel = null;
    this.supabase = null;
    this.handlers.clear();
    this.mode = null;
    this.starting = null;
  }

  private dispatch(event: string, payload: any): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of [...set]) {
      try {
        h(payload);
      } catch (e) {
        console.error(`[realtime] handler for ${event} threw`, e);
      }
    }
  }
}

export const realtime = new RealtimeClient();
