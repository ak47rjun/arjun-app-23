/**
 * Integration test: revoking a user's sessions must also drop the cached
 * SessionUser.
 *
 * getSessionUser() returns straight from the Redis cache without re-checking the
 * session row, so deleting only the DB rows left the revoked session working
 * until the cache entry expired. That is exactly the window that matters after a
 * password reset, a ban, or an account deletion.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { createSession, destroyAllSessions, getSessionUser, invalidateSessionCaches } from '@/lib/auth/session';
import { SESSION_COOKIE } from '@/lib/auth/cookies';
import { redisGet } from '@/lib/redis';

const suffix = Math.random().toString(36).slice(2, 10);

function reqWithCookie(token: string): Request {
  return new Request('http://localhost/api/test', {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
}

let userId: string;
let token: string;
let sessionId: string;

describe('session revocation', () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `revoke-${suffix}@test.arjun`,
        passwordHash: await hashPassword('TestPassword#123'),
        displayName: `revoke-${suffix}`,
        profile: { create: {} },
        settings: { create: {} },
        notificationPrefs: { create: {} },
      },
    });
    userId = user.id;
    const session = await createSession(user.id);
    token = session.token;
    sessionId = session.session.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('authenticates normally before revocation', async () => {
    const user = await getSessionUser(reqWithCookie(token));
    expect(user?.id).toBe(userId);
    // the first call warms the cache — this is the entry that used to outlive it
    expect(await redisGet(`session:${sessionId}`)).not.toBeNull();
  });

  it('stops authenticating immediately after sign-out-everywhere', async () => {
    await destroyAllSessions(userId);

    // the cache entry has to go with the rows, or getSessionUser() keeps
    // serving the revoked session straight out of Redis
    expect(await redisGet(`session:${sessionId}`)).toBeNull();

    const sessions = await prisma.session.count({ where: { userId } });
    expect(sessions).toBe(0);
    expect(await getSessionUser(reqWithCookie(token))).toBeNull();
  });

  it('invalidateSessionCaches clears the cache without revoking the sessions', async () => {
    const session = await createSession(userId);
    // warm the cache for this new session
    expect((await getSessionUser(reqWithCookie(session.token)))?.id).toBe(userId);

    await invalidateSessionCaches(userId);
    expect(await redisGet(`session:${session.session.id}`)).toBeNull();

    // rows survive, so the next request simply re-reads from the DB
    expect(await prisma.session.count({ where: { userId } })).toBe(1);
    expect((await getSessionUser(reqWithCookie(session.token)))?.id).toBe(userId);
  });
});
