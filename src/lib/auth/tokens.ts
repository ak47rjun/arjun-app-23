/** One-time tokens (email verification, password reset) — stored hashed, single-use. */
import { prisma } from '../prisma';
import { randomToken, sha256Hex } from '../crypto';

export type TokenType = 'EMAIL_VERIFY' | 'PASSWORD_RESET';

export async function issueVerificationToken(userId: string, identifier: string, type: TokenType, ttlHours = 24): Promise<string> {
  const raw = randomToken(32);
  await prisma.verificationToken.create({
    data: {
      userId,
      identifier,
      type,
      tokenHash: sha256Hex(raw),
      expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
    },
  });
  return raw;
}

export async function consumeVerificationToken(raw: string, type: TokenType) {
  const token = await prisma.verificationToken.findUnique({
    where: { tokenHash: sha256Hex(raw) },
  });
  if (!token || token.type !== type) return null;
  if (token.consumedAt || token.expiresAt < new Date()) return null;
  await prisma.verificationToken.update({
    where: { id: token.id },
    data: { consumedAt: new Date() },
  });
  return token;
}
