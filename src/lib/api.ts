/** API helpers: typed errors, origin (CSRF) checks, and a route wrapper with auth + rate limiting. */
import { ZodError } from 'zod';
import type { Role } from '@prisma/client';
import { env } from './env';
import { isTrustedOrigin } from './security/origins';
import { getSessionUser, type SessionUser } from './auth/session';
import { hasRole } from './rbac';
import { rateLimit, type RateLimitOpts } from './ratelimit';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class SetupRequiredError extends ApiError {
  constructor(feature: string, message: string) {
    super(503, 'SETUP_REQUIRED', `${feature}: ${message}`);
  }
}

export function badRequest(message: string, details?: unknown) {
  return new ApiError(400, 'BAD_REQUEST', message, details);
}
export function unauthorized(message = 'Authentication required') {
  return new ApiError(401, 'UNAUTHORIZED', message);
}
export function forbidden(message = 'You do not have permission to perform this action') {
  return new ApiError(403, 'FORBIDDEN', message);
}
export function notFound(message = 'Resource not found') {
  return new ApiError(404, 'NOT_FOUND', message);
}
export function conflict(message: string) {
  return new ApiError(409, 'CONFLICT', message);
}

export function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

/** CSRF: browsers send Origin on cross-site requests; reject untrusted origins. Non-browser clients (no Origin) pass. */
export function assertSameOrigin(req: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.get('origin');
  if (!origin) return;
  if (!isTrustedOrigin(origin, req)) {
    throw new ApiError(403, 'CSRF', 'Origin mismatch');
  }
}

type Handler<Ctx> = (req: Request, ctx: Ctx, user: SessionUser | null) => Promise<Response>;
type AuthedHandler<Ctx> = (req: Request, ctx: Ctx, user: SessionUser) => Promise<Response>;

interface WithApiOpts<Ctx = unknown> {
  roles?: Role[]; // any-of; user must hold at least one
  rateLimit?: RateLimitOpts & { scope: string };
  /** set false for pre-auth endpoints (login, register, …) */
  auth?: boolean;
  /** override context (e.g. route params) */
  ctx?: Ctx;
}

function wrap<Ctx>(handler: Handler<Ctx>, opts: WithApiOpts<Ctx>) {
  return async (req: Request, routeCtx?: Ctx): Promise<Response> => {
    try {
      assertSameOrigin(req);
      if (opts.rateLimit) {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        const result = await rateLimit({ ...opts.rateLimit, key: `${opts.rateLimit.scope}:${ip}` });
        if (!result.allowed) {
          return json(
            { error: 'RATE_LIMITED', message: 'Too many requests. Please try again later.', retryAfter: result.retryAfter },
            429,
            { 'retry-after': String(result.retryAfter) },
          );
        }
      }
      const user = await getSessionUser(req);
      if (opts.auth !== false) {
        if (!user) throw unauthorized();
        if (user.isBanned) throw new ApiError(403, 'ACCOUNT_BANNED', 'This account has been suspended.');
        if (opts.roles && opts.roles.length > 0 && !opts.roles.some((r) => hasRole(user.role, r))) {
          throw forbidden();
        }
      }
      return await handler(req, (routeCtx ?? opts.ctx ?? ({} as Ctx)), user);
    } catch (e) {
      if (e instanceof ZodError) {
        return json(
          { error: 'VALIDATION', message: 'Invalid request data', details: e.errors.map((i) => ({ path: i.path.join('.'), message: i.message })) },
          400,
        );
      }
      if (e instanceof ApiError) {
        return json({ error: e.code, message: e.message, details: e.details }, e.status);
      }
      console.error('[api] unhandled error', e);
      return json({ error: 'INTERNAL', message: 'An unexpected error occurred' }, 500);
    }
  };
}

/**
 * Wraps a route handler with: origin check, optional rate limiting, auth + role
 * authorization, and consistent JSON error responses. Never rely on frontend
 * hiding — every protected operation is authorized here on the server.
 */
export function withApi<Ctx = { params: Record<string, string> }>(
  handler: AuthedHandler<Ctx>,
  opts: WithApiOpts<Ctx> = {},
): (req: Request, routeCtx?: Ctx) => Promise<Response> {
  return wrap(handler as Handler<Ctx>, { ...opts, auth: opts.auth ?? true });
}

/** Same wrapper without the session requirement (login, register, OAuth callbacks…). */
export function publicApi<Ctx = { params: Record<string, string> }>(
  handler: Handler<Ctx>,
  opts: WithApiOpts<Ctx> = {},
): (req: Request, routeCtx?: Ctx) => Promise<Response> {
  return wrap(handler, { ...opts, auth: false });
}

/** Convenience: parse + validate a JSON body with a zod schema. */
export async function parseBody<T>(req: Request, schema: { parse: (d: unknown) => T }): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest('Request body must be valid JSON');
  }
  return schema.parse(raw);
}

export function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
