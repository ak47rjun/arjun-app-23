import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../env';

export interface SessionTokenPayload extends JWTPayload {
  sub: string; // user id
  sid: string; // session id (jti)
  role: string;
}

const secret = new TextEncoder().encode(env.AUTH_SECRET);

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function signSessionToken(payload: { userId: string; sessionId: string; role: string }): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setJti(payload.sessionId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    // signSessionToken stores the session id in the jti claim.
    const sid = typeof payload.jti === 'string' ? payload.jti : payload.sid;
    if (typeof payload.sub !== 'string' || typeof sid !== 'string') return null;
    return { ...payload, sid } as SessionTokenPayload;
  } catch {
    return null;
  }
}
