/**
 * ARJUN environment — parsed and validated once on the server.
 * This module must only be imported from server code (never client components).
 */
import { z } from 'zod';

// NOTE: this module must stay edge-runtime safe (the middleware imports it).
// Never import Node-only modules (dotenv, fs, …) here. The custom server
// entrypoint loads .env via src/lib/env-bootstrap.ts instead; Next itself
// loads .env for route handlers and pages.

const envSchema = z.object({
  APP_URL: z.string().default('http://localhost:3000'),
  /** Comma-separated extra trusted origins for CSRF checks (e.g. preview proxies, custom domains). */
  ALLOWED_ORIGINS: z.string().default(''),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  AUTH_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(32),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),

  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('ARJUN <no-reply@arjun.local>'),

  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  S3_BUCKET: z.string().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().default(''),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  S3_PUBLIC_URL: z.string().default(''),

  MARKET_DATA_PROVIDER: z.enum(['demo', 'twelvedata', 'alphavantage']).default('demo'),
  TWELVE_DATA_API_KEY: z.string().default(''),
  ALPHA_VANTAGE_API_KEY: z.string().default(''),

  MT5_BRIDGE_URL: z.string().default(''),
  MT5_BRIDGE_API_KEY: z.string().default(''),

  LIVEKIT_URL: z.string().default(''),
  LIVEKIT_API_KEY: z.string().default(''),
  LIVEKIT_API_SECRET: z.string().default(''),

  /**
   * Which transport pushes realtime events (messenger, presence, notifications).
   *
   *  auto      – Socket.IO when the custom Node server is running, else Supabase
   *              when configured, else `none`. This is the safe default: the app
   *              always boots, it just degrades.
   *  socketio  – force the in-process Socket.IO server (Node host only).
   *  supabase  – force Supabase Realtime broadcast (works on serverless/Vercel).
   *  none      – no push at all; clients fall back to refetching.
   */
  REALTIME_PROVIDER: z.enum(['auto', 'socketio', 'supabase', 'none']).default('auto'),
  /** Browser-side hint for the same choice; read via src/lib/env-config.ts. */
  NEXT_PUBLIC_REALTIME_PROVIDER: z.enum(['auto', 'socketio', 'supabase', 'none']).default('auto'),

  /**
   * Supabase Realtime. NEXT_PUBLIC_* are safe to expose to the browser (the anon
   * key is protected by row-level security); the service role key is server-only.
   */
  NEXT_PUBLIC_SUPABASE_URL: z.string().default(''),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),

  /** Shared secret that authorises the scheduled-jobs endpoint (Vercel Cron). */
  CRON_SECRET: z.string().default(''),

  ADMIN_EMAIL: z.string().default('admin@arjun.local'),
  ADMIN_PASSWORD: z.string().default(''),
});

// During `next build`, Next imports route modules to collect page data — runtime
// secrets (DATABASE_URL, AUTH_SECRET, …) are not (and should not be) present in
// the build environment. Validate strictly at runtime; during the build phase,
// satisfy the schema with placeholders so page-data collection can proceed.
// The running server always gets the real, strictly-validated environment.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

export const env = envSchema.parse(
  isBuildPhase
    ? {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://build:build@localhost:5432/build',
        AUTH_SECRET: process.env.AUTH_SECRET ?? 'build-placeholder-auth-secret-0000',
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? 'build-placeholder-encryption-key-0000000000',
      }
    : process.env,
);

export const isProduction = env.NODE_ENV === 'production';

export const googleAuthConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const smtpConfigured = Boolean(env.SMTP_HOST);
export const mt5BridgeConfigured = Boolean(env.MT5_BRIDGE_URL);
export const livekitConfigured = Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
export const s3Configured = Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);

/** True when Supabase Realtime broadcast can be used (needs URL + service key). */
export const supabaseRealtimeConfigured = Boolean(
  env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY,
);

/** Client-safe snapshot of the Supabase public config (anon key + URL only). */
export const supabasePublicConfig = {
  url: env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

/** Absolute URL on this origin — used for OAuth redirects and links. */
export function appUrl(path = '/'): string {
  return new URL(path, env.APP_URL).toString();
}
