/** Session management: create/verify/destroy sessions, load the current user, and guard helpers. */
import { prisma } from '../prisma';
import { sha256Hex } from '../crypto';
import { signSessionToken, verifySessionToken, SESSION_TTL_SECONDS } from './jwt';
import { getCookie, SESSION_COOKIE, PENDING_2FA_COOKIE } from './cookies';
import { redisGet, redisSet, redisDel } from '../redis';
import { unauthorized, forbidden } from '../api';
import { hasRole } from '../rbac';
import type { Role } from '@prisma/client';

export interface SessionUser {
  id: string;
  email: string;
  emailVerified: Date | null;
  role: Role;
  isBanned: boolean;
  displayName: string | null;
  name: string | null;
  avatarUrl: string | null;
  timezone: string;
  totpEnabled: boolean;
  profile: { onboardingDone: boolean; verifiedBadge: boolean; isPublic: boolean } | null;
  settings: { theme: string; dashboardLayout: unknown } | null;
}

function cacheKey(sid: string) {
  return `session:${sid}`;
}

export async function createSession(userId: string, meta: { userAgent?: string; ip?: string } = {}) {
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256Hex(crypto.randomUUID()),
      userAgent: meta.userAgent?.slice(0, 255),
      ip: meta.ip,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
    },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const token = await signSessionToken({ userId, sessionId: session.id, role: user.role });
  return { token, session };
}

/** Verify the session cookie and load the user. Returns null when unauthenticated. */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const cached = await redisGet(cacheKey(payload.sid));
  if (cached) {
    try {
      return JSON.parse(cached) as SessionUser;
    } catch {
      /* fall through to DB */
    }
  }

  const session = await prisma.session.findUnique({ where: { id: payload.sid } });
  if (!session || session.userId !== payload.sub || session.expiresAt < new Date()) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      profile: { select: { onboardingDone: true, verifiedBadge: true, isPublic: true } },
      settings: { select: { theme: true, dashboardLayout: true } },
    },
  });
  if (!user) return null;

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role,
    isBanned: user.isBanned,
    displayName: user.displayName,
    name: user.name,
    avatarUrl: user.avatarUrl,
    timezone: user.timezone,
    totpEnabled: user.totpEnabled,
    profile: user.profile,
    settings: user.settings,
  };

  await redisSet(cacheKey(payload.sid), JSON.stringify(sessionUser), 60);
  return sessionUser;
}

export async function destroySession(req: Request): Promise<void> {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return;
  const payload = await verifySessionToken(token);
  if (payload) {
    await prisma.session.deleteMany({ where: { id: payload.sid } });
    await redisDel(cacheKey(payload.sid));
  }
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function getPending2faUserId(req: Request): Promise<string | null> {
  const raw = getCookie(req, PENDING_2FA_COOKIE);
  if (!raw) return null;
  // The pending cookie only carries the user id; the server issued it after a
  // successful password check and it is short-lived (5 minutes).
  const session = await prisma.session.findFirst({
    where: { userId: raw, createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } },
    orderBy: { createdAt: 'desc' },
  });
  return session ? raw : null;
}

/** Guard: require an authenticated user or throw 401. */
export async function requireUser(req: Request): Promise<SessionUser> {
  const user = await getSessionUser(req);
  if (!user) throw unauthorized();
  if (user.isBanned) throw forbidden('This account has been suspended.');
  return user;
}

/** Guard: require the user to hold one of the given roles or throw 403. */
export function requireRole(user: SessionUser, roles: Role | Role[]): void {
  const list = Array.isArray(roles) ? roles : [roles];
  if (!list.some((r) => hasRole(user.role, r))) throw forbidden();
}
