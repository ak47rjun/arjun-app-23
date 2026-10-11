import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { issueVerificationToken } from '@/lib/auth/tokens';
import { sendEmail } from '@/lib/email';
import { appUrl } from '@/lib/env';
import { json, parseBody, publicApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const schema = z.object({ email: z.string().email() });

export const POST = publicApi(
  async (req) => {
    const body = await parseBody(req, schema);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase().trim() } });
    if (user) {
      const token = await issueVerificationToken(user.id, user.email, 'PASSWORD_RESET', 1);
      await sendEmail({
        to: user.email,
        subject: 'Reset your ARJUN password',
        text: `Reset your password: ${appUrl(`/reset-password?token=${token}`)}\n\nThis link expires in 1 hour. If you did not request it, you can ignore this email.`,
      });
    }
    // always 200 — do not leak whether the account exists
    return json({ sent: true });
  },
  { rateLimit: { scope: 'auth:forgot', key: '', limit: 5, windowSec: 600 } },
);
