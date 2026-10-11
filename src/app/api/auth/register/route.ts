import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { serializeSessionCookie } from '@/lib/auth/cookies';
import { issueVerificationToken } from '@/lib/auth/tokens';
import { sendEmail } from '@/lib/email';
import { audit } from '@/lib/audit';
import { appUrl } from '@/lib/env';
import { conflict, json, parseBody, publicApi, getClientIp } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(72),
  displayName: z.string().min(2).max(50).optional(),
});

export const POST = publicApi(
  async (req, _ctx, _user) => {
    const body = await parseBody(req, registerSchema);
    const email = body.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw conflict('An account with this email already exists');

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: body.displayName ?? email.split('@')[0],
        name: body.displayName ?? email.split('@')[0],
        profile: { create: {} },
        settings: { create: {} },
        notificationPrefs: { create: {} },
      },
    });

    const token = await issueVerificationToken(user.id, email, 'EMAIL_VERIFY');
    await sendEmail({
      to: email,
      subject: 'Verify your ARJUN account',
      text: `Welcome to ARJUN — The Real Trader's Hub.\n\nVerify your email: ${appUrl(`/verify-email?token=${token}`)}\n\nIf you did not create this account, you can ignore this email.`,
    });

    const { token: sessionToken } = await createSession(user.id, {
      userAgent: req.headers.get('user-agent') ?? undefined,
      ip: getClientIp(req),
    });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(user.id, 'REGISTER', { ip: getClientIp(req) });

    return json(
      {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
        },
        verificationEmailSent: true,
      },
      201,
      { 'set-cookie': serializeSessionCookie(sessionToken) },
    );
  },
  { rateLimit: { scope: 'auth:register', key: '', limit: 10, windowSec: 600 } },
);
