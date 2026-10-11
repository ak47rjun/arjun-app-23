/**
 * Trusted-origin logic for CSRF protection and realtime CORS.
 *
 * A request is same-origin when its `Origin` header matches:
 *   1. APP_URL (the canonical deployment origin),
 *   2. any origin listed in ALLOWED_ORIGINS (preview proxies, custom domains), or
 *   3. the origin the request was actually addressed to — derived from the
 *      Host / X-Forwarded-Host + X-Forwarded-Proto headers. Reverse proxies and
 *      preview environments (e.g. https://<port>-<id>.e2b.app) forward requests
 *      with a different public origin; the browser still sets Host to the server
 *      it talked to, so a cross-site attacker on evil.com cannot forge this.
 *
 * Non-browser clients send no Origin header and pass (they are not subject to
 * CSRF — they cannot be tricked into sending credentialed cross-site requests).
 */
import { env } from '../env';

interface HeaderSource {
  headers: Headers;
}

/** Canonical + explicitly configured origins. */
export function getAllowedOrigins(): Set<string> {
  const set = new Set<string>();
  try {
    set.add(new URL(env.APP_URL).origin);
  } catch {
    /* invalid APP_URL — ignore */
  }
  for (const raw of env.ALLOWED_ORIGINS.split(',')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      set.add(new URL(trimmed).origin);
    } catch {
      /* ignore malformed entries */
    }
  }
  return set;
}

/** The origin this request was addressed to, derived from proxy/host headers. */
export function getRequestOrigin(req: HeaderSource): string | null {
  const fwdProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const fwdHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = fwdHost ?? req.headers.get('host');
  if (!host) return null;
  const proto = fwdProto ?? (/^(localhost|127\.|0\.0\.0\.0|\[::1\])(:|\b)/.test(host) ? 'http' : 'https');
  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return null;
  }
}

/** True when `origin` is trusted for credentialed (cookie-bearing) requests. */
export function isTrustedOrigin(origin: string | null | undefined, req?: HeaderSource): boolean {
  if (!origin) return true; // no Origin header — non-browser client
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  // Fetch Metadata: browsers label every request and forbid scripts from setting
  // these headers. A cross-site attack always arrives as "cross-site"; a genuine
  // same-origin request (including through preview/reverse proxies) is labeled
  // "same-origin" — this works no matter how the proxy rewrites Host headers.
  const secFetchSite = req?.headers.get('sec-fetch-site');
  if (secFetchSite) {
    if (secFetchSite === 'cross-site') return false;
    if (secFetchSite === 'same-origin' || secFetchSite === 'same-site' || secFetchSite === 'none') return true;
  }
  if (getAllowedOrigins().has(parsed.origin)) return true;
  if (req) {
    const self = getRequestOrigin(req);
    if (self && self === parsed.origin) return true;
  }
  return false;
}
