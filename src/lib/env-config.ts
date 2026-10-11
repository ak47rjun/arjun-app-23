/**
 * Client-safe environment access.
 *
 * src/lib/env.ts validates the SERVER environment (DATABASE_URL, AUTH_SECRET,
 * …) and must never be imported into a client bundle — those values are absent
 * in the browser and validation would throw. This module exposes only the
 * NEXT_PUBLIC_* values, which Next inlines at build time.
 */

export const supabasePublicConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

/**
 * Which realtime transport the browser should prefer.
 *  auto     – probe for a Socket.IO server, else Supabase, else nothing
 *  socketio – always use Socket.IO
 *  supabase – always use Supabase Realtime (typical on serverless/Vercel)
 *  none     – disable push entirely
 */
export type RealtimePreference = 'auto' | 'socketio' | 'supabase' | 'none';

export const realtimePreference: RealtimePreference = (() => {
  const v = process.env.NEXT_PUBLIC_REALTIME_PROVIDER;
  return v === 'socketio' || v === 'supabase' || v === 'none' ? v : 'auto';
})();
