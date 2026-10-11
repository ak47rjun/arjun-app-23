import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { issueVerificationToken } from '@/lib/auth/tokens';
import { sendEmail } from '@/lib/email';
import { appUrl } from '@/lib/env';
import { badRequest, json, parseBody, publicApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const schema = z.object({ email: z.string().email() });

export const POST = publicApi(
  async (req) => {
    const body = await parseBody(req, schema);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase().trim() } });
    if (!user) return json({ sent: true }); // do not leak account existence
    if (user.emailVerified) throw badRequest('Email is already verified');
    const token = await issueVerificationToken(user.id, user.email, 'EMAIL_VERIFY');
    await sendEmail({
      to: user.email,
      subject: 'Verify your ARJUN account',
      text: `Verify your email: ${appUrl(`/verify-email?token=${token}`)}`,
    });
    return json({ sent: true });
  },
  { rateLimit: { scope: 'auth:resend', key: '', limit: 5, windowSec: 600 } },
);
