import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyTotp } from '@/lib/auth/totp';
import { badRequest, json, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const schema = z.object({ code: z.string().min(6).max(8) });

export const POST = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, schema);
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser?.totpEnabled || !dbUser.totpSecret) throw badRequest('Two-factor authentication is not enabled');
  if (!verifyTotp(body.code, dbUser.totpSecret)) throw badRequest('Invalid code');
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });
  return json({ disabled: true });
});
