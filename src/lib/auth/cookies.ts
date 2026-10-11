import { isProduction } from '../env';
import { SESSION_TTL_SECONDS } from './jwt';

export const SESSION_COOKIE = 'arjun_session';
export const PENDING_2FA_COOKIE = 'arjun_2fa_pending';

function baseCookie(name: string, value: string, maxAge: number): string {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (isProduction) parts.push('Secure');
  return parts.join('; ');
}

export function serializeSessionCookie(token: string): string {
  return baseCookie(SESSION_COOKIE, token, SESSION_TTL_SECONDS);
}

export function serializeClearSessionCookie(): string {
  return baseCookie(SESSION_COOKIE, '', 0);
}

export function serializePending2faCookie(userId: string, maxAge = 300): string {
  // signed elsewhere; here we store a short-lived opaque marker verified server-side
  return baseCookie(PENDING_2FA_COOKIE, userId, maxAge);
}

export function serializeClearPending2faCookie(): string {
  return baseCookie(PENDING_2FA_COOKIE, '', 0);
}

export function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}
