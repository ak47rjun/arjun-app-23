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

  ADMIN_EMAIL: z.string().default('admin@arjun.local'),
  ADMIN_PASSWORD: z.string().default(''),
});

export const env = envSchema.parse(process.env);

export const isProduction = env.NODE_ENV === 'production';

export const googleAuthConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const smtpConfigured = Boolean(env.SMTP_HOST);
export const mt5BridgeConfigured = Boolean(env.MT5_BRIDGE_URL);
export const livekitConfigured = Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
export const s3Configured = Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);

/** Absolute URL on this origin — used for OAuth redirects and links. */
export function appUrl(path = '/'): string {
  return new URL(path, env.APP_URL).toString();
}
