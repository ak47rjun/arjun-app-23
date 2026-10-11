import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateTotpSecret, totpUri, totpQrDataUrl, verifyTotp, encryptTotpSecret } from '@/lib/auth/totp';
import { badRequest, json, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** GET: create a pending TOTP secret + QR (not enabled until verified). */
export const GET = withApi(async (_req, _ctx, user) => {
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (dbUser?.totpEnabled) throw badRequest('Two-factor authentication is already enabled');
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: encryptTotpSecret(secret) },
  });
  return json({
    secret,
    otpauthUrl: totpUri(secret, user.email),
    qrDataUrl: await totpQrDataUrl(secret, user.email),
  });
});

/** POST: verify a code and enable 2FA. */
const enableSchema = z.object({ code: z.string().min(6).max(8) });

export const POST = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, enableSchema);
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser?.totpSecret) throw badRequest('Generate a secret first (GET this endpoint)');
  if (dbUser.totpEnabled) throw badRequest('Two-factor authentication is already enabled');
  if (!verifyTotp(body.code, dbUser.totpSecret)) throw badRequest('Invalid code — check your authenticator app');
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  return json({ enabled: true });
});
