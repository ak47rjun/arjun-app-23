import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getPending2faUserId, createSession } from '@/lib/auth/session';
import { serializeSessionCookie, serializeClearPending2faCookie, serializeClearSessionCookie } from '@/lib/auth/cookies';
import { verifyTotp } from '@/lib/auth/totp';
import { audit } from '@/lib/audit';
import { json, parseBody, unauthorized, publicApi, getClientIp } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const schema = z.object({ code: z.string().min(6).max(8) });

export const POST = publicApi(
  async (req) => {
    const body = await parseBody(req, schema);
    const userId = await getPending2faUserId(req);
    if (!userId) throw unauthorized('Two-factor session expired. Please sign in again.');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpEnabled || !user.totpSecret) throw unauthorized('Two-factor authentication is not enabled');

    if (!verifyTotp(body.code, user.totpSecret)) {
      await audit(user.id, 'LOGIN_2FA_FAILED', { ip: getClientIp(req) });
      throw unauthorized('Invalid two-factor code');
    }

    const { token } = await createSession(user.id, {
      userAgent: req.headers.get('user-agent') ?? undefined,
      ip: getClientIp(req),
    });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(user.id, 'LOGIN', { ip: getClientIp(req), metadata: { via: 'totp' } });

    return json(
      { user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } },
      200,
      {
        'set-cookie': [serializeSessionCookie(token), serializeClearPending2faCookie(), serializeClearSessionCookie()].join(', '),
      },
    );
  },
  { rateLimit: { scope: 'auth:2fa', key: '', limit: 20, windowSec: 600 } },
);
