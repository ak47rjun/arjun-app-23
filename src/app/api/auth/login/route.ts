import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { serializeSessionCookie, serializePending2faCookie } from '@/lib/auth/cookies';
import { audit } from '@/lib/audit';
import { json, parseBody, unauthorized, publicApi, getClientIp, forbidden } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(72),
});

export const POST = publicApi(
  async (req) => {
    const body = await parseBody(req, loginSchema);
    const email = body.email.toLowerCase().trim();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) throw unauthorized('Invalid email or password');
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      await audit(user.id, 'LOGIN_FAILED', { ip: getClientIp(req) });
      throw unauthorized('Invalid email or password');
    }
    if (user.isBanned) throw forbidden('This account has been suspended.');

    if (user.totpEnabled) {
      // password ok — require the second factor
      return json(
        { requires2fa: true, message: 'Two-factor authentication required' },
        200,
        { 'set-cookie': serializePending2faCookie(user.id) },
      );
    }

    const { token } = await createSession(user.id, {
      userAgent: req.headers.get('user-agent') ?? undefined,
      ip: getClientIp(req),
    });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(user.id, 'LOGIN', { ip: getClientIp(req) });

    return json(
      {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          totpEnabled: user.totpEnabled,
        },
      },
      200,
      { 'set-cookie': serializeSessionCookie(token) },
    );
  },
  { rateLimit: { scope: 'auth:login', key: '', limit: 20, windowSec: 600 } },
);
