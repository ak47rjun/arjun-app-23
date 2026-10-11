import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { consumeVerificationToken } from '@/lib/auth/tokens';
import { destroyAllSessions } from '@/lib/auth/session';
import { audit } from '@/lib/audit';
import { badRequest, json, parseBody, publicApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(72),
});

export const POST = publicApi(
  async (req) => {
    const body = await parseBody(req, schema);
    const token = await consumeVerificationToken(body.token, 'PASSWORD_RESET');
    if (!token) throw badRequest('This reset link is invalid or has expired');

    const passwordHash = await hashPassword(body.password);
    await prisma.user.update({ where: { id: token.userId }, data: { passwordHash } });
    await destroyAllSessions(token.userId);
    await audit(token.userId, 'PASSWORD_RESET');
    return json({ reset: true });
  },
  { rateLimit: { scope: 'auth:reset', key: '', limit: 10, windowSec: 600 } },
);
