import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { destroyAllSessions } from '@/lib/auth/session';
import { serializeClearSessionCookie } from '@/lib/auth/cookies';
import { audit } from '@/lib/audit';
import { badRequest, json, parseBody, unauthorized, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const schema = z.object({
  password: z.string().min(1),
  confirmation: z.literal('DELETE MY ACCOUNT'),
});

/** Account deletion: verifies password, audits, then deletes (cascades per schema). */
export const POST = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, schema);
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser?.passwordHash || !(await verifyPassword(body.password, dbUser.passwordHash))) {
    throw unauthorized('Password is incorrect');
  }
  await audit(user.id, 'ACCOUNT_DELETE');
  await prisma.user.delete({ where: { id: user.id } });
  await destroyAllSessions(user.id);
  return json({ deleted: true }, 200, { 'set-cookie': serializeClearSessionCookie() });
});
