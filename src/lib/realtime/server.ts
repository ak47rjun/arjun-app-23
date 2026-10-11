/**
 * Server-side realtime fan-out.
 *
 * Why this exists
 * ───────────────
 * The app pushes events (new message, typing, presence, notifications) from
 * route handlers to connected browsers. Originally that could only be done with
 * the in-process Socket.IO server — which is fine on a Node host but impossible
 * on a serverless platform like Vercel, where there is no long-lived process to
 * hold the WebSocket server.
 *
 * This module hides the transport behind one interface and picks a provider:
 *
 *   socketio  – in-process Socket.IO (Node host: Railway/Render/Fly/local).
 *   supabase  – Supabase Realtime broadcast over HTTPS (works on Vercel).
 *   none      – no push; clients refetch instead.
 *
 * Every provider is best-effort: fan-out must NEVER break the request that
 * triggered it. A failed push degrades the experience, it does not 500 the API.
 */
import { env, supabaseRealtimeConfigured } from '../env';

export type RealtimeProviderName = 'socketio' | 'supabase' | 'none';

/** Room naming is shared by every provider so server and client stay in sync. */
export const userRoom = (userId: string) => `user:${userId}`;
export const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;

// ───────────────────────────── Socket.IO ─────────────────────────────
// The custom server (server.ts, via tsx) and the Next.js route handlers are
// compiled as SEPARATE module graphs in the same process, so the Socket.IO
// instance is mirrored on globalThis rather than imported directly.
const IO_GLOBAL = '__ARJUN_SOCKET_IO__';

type IO = {
  to(room: string): { emit(event: string, payload: unknown): void };
  in(room: string): { fetchSockets(): Promise<unknown[]> };
};

export function registerSocketIO(io: unknown): void {
  (globalThis as Record<string, unknown>)[IO_GLOBAL] = io;
}

function getIO(): IO | null {
  return ((globalThis as Record<string, unknown>)[IO_GLOBAL] as IO | undefined) ?? null;
}

function socketIORoomSize(room: string): number | null {
  const io = getIO();
  if (!io) return null;
  // Cheap membership probe: `of('/').adapter.rooms` is available in-process.
  const adapter = (io as unknown as { of?: (n: string) => { adapter?: { rooms?: Map<string, unknown> } } })
    .of?.('/')?.adapter;
  const rooms = adapter?.rooms;
  if (rooms instanceof Map) return rooms.get(room)?.valueOf() ? (rooms.get(room) as Set<unknown>).size : 0;
  return null;
}

const socketIOProvider = {
  name: 'socketio' as const,
  available(): boolean {
    return getIO() !== null;
  },
  async emit(room: string, event: string, payload: unknown): Promise<void> {
    getIO()?.to(room).emit(event, payload);
  },
  roomSize: socketIORoomSize,
};

// ───────────────────────────── Supabase ─────────────────────────────
/**
 * Supabase Realtime broadcast. The server POSTs to the REST broadcast endpoint
 * with the SERVICE ROLE key; browsers subscribe to the same topic with the anon
 * key. No persistent process required, so this works on Vercel.
 */
async function supabaseBroadcast(
  topic: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/realtime/v1/api/broadcast`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ messages: [{ topic, event, payload }] }),
    // Never let a push hang the request that triggered it.
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`Supabase broadcast ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

const supabaseProvider = {
  name: 'supabase' as const,
  available(): boolean {
    return supabaseRealtimeConfigured;
  },
  async emit(topic: string, event: string, payload: unknown): Promise<void> {
    await supabaseBroadcast(topic, event, payload);
  },
  roomSize: (): number | null => null,
};

const noneProvider = {
  name: 'none' as const,
  available(): boolean {
    return true;
  },
  async emit(): Promise<void> {
    /* intentionally no push */
  },
  roomSize: (): number | null => null,
};

type Provider = typeof socketIOProvider | typeof supabaseProvider | typeof noneProvider;

let override: Provider | null = null;

/** Force a provider (used by tests and by the custom server at boot). */
export function setRealtimeProvider(name: 'socketio' | 'supabase' | 'none' | null): void {
  override = name === null ? null : name === 'socketio' ? socketIOProvider : name === 'supabase' ? supabaseProvider : noneProvider;
}

function resolve(): Provider {
  if (override) return override;
  if (env.REALTIME_PROVIDER === 'socketio') return socketIOProvider;
  if (env.REALTIME_PROVIDER === 'supabase') return supabaseProvider;
  if (env.REALTIME_PROVIDER === 'none') return noneProvider;

  // auto: prefer Socket.IO when the custom server actually attached one,
  // otherwise fall back to Supabase, otherwise no push at all.
  if (socketIOProvider.available()) return socketIOProvider;
  if (supabaseProvider.available()) return supabaseProvider;
  return noneProvider;
}

export function activeRealtimeProvider(): RealtimeProviderName {
  return resolve().name;
}

async function emit(room: string, event: string, payload: unknown): Promise<void> {
  try {
    await resolve().emit(room, event, payload);
  } catch (e) {
    // Fan-out is best-effort by design — log and move on.
    console.error(`[realtime] ${resolve().name} push failed (${room} ${event})`, e);
  }
}

export function emitToUser(userId: string, event: string, payload: unknown): Promise<void> {
  return emit(userRoom(userId), event, payload);
}

export function emitToConversation(
  conversationId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  return emit(conversationRoom(conversationId), event, payload);
}

/** Non-throwing convenience for callers that do not want to await the push. */
export function emitToUserNow(userId: string, event: string, payload: unknown): void {
  void emitToUser(userId, event, payload);
}
export function emitToConversationNow(
  conversationId: string,
  event: string,
  payload: unknown,
): void {
  void emitToConversation(conversationId, event, payload);
}
