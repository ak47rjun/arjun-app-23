import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { consumeVerificationToken } from '@/lib/auth/tokens';
import { badRequest, json, parseBody, publicApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const schema = z.object({ token: z.string().min(10) });

export const POST = publicApi(async (req) => {
  const body = await parseBody(req, schema);
  const token = await consumeVerificationToken(body.token, 'EMAIL_VERIFY');
  if (!token) throw badRequest('This verification link is invalid or has expired');
  await prisma.user.update({ where: { id: token.userId }, data: { emailVerified: new Date() } });
  return json({ verified: true });
});
