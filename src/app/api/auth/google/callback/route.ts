import { prisma } from '@/lib/prisma';
import { exchangeGoogleCode, GOOGLE_STATE_COOKIE, GOOGLE_NONCE_COOKIE, GOOGLE_VERIFIER_COOKIE } from '@/lib/auth/google';
import { createSession } from '@/lib/auth/session';
import { serializeSessionCookie } from '@/lib/auth/cookies';
import { encryptSecret } from '@/lib/crypto';
import { audit } from '@/lib/audit';
import { appUrl } from '@/lib/env';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  const part = header
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

const clearCookies = [
  `${GOOGLE_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  `${GOOGLE_NONCE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  `${GOOGLE_VERIFIER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
].join(', ');

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const error = url.searchParams.get('error');
  if (error) return Response.redirect(appUrl(`/login?error=${encodeURIComponent(error)}`), 302);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieHeader = req.headers.get('cookie');
  const stateCookie = cookieValue(cookieHeader, GOOGLE_STATE_COOKIE);
  const verifier = cookieValue(cookieHeader, GOOGLE_VERIFIER_COOKIE);

  if (!code || !state || !stateCookie || state !== stateCookie || !verifier) {
    return Response.redirect(appUrl('/login?error=oauth_state_mismatch'), 302);
  }

  try {
    const profile = await exchangeGoogleCode(code, appUrl('/api/auth/google/callback'), verifier);
    if (!profile.email) throw new Error('Google did not return an email');

    // upsert identity + user
    const identity = await prisma.identity.findUnique({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: profile.sub } },
      include: { user: true },
    });

    let user = identity?.user;
    if (!user) {
      const email = profile.email.toLowerCase().trim();
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        // link the Google identity to the existing email account
        await prisma.identity.create({
          data: {
            userId: existing.id,
            provider: 'google',
            providerAccountId: profile.sub,
            email,
            name: profile.name,
            avatarUrl: profile.picture,
          },
        });
        if (!existing.emailVerified && profile.emailVerified) {
          await prisma.user.update({ where: { id: existing.id }, data: { emailVerified: new Date() } });
        }
        user = existing;
      } else {
        user = await prisma.user.create({
          data: {
            email,
            emailVerified: profile.emailVerified ? new Date() : null,
            displayName: profile.name ?? email.split('@')[0],
            name: profile.name ?? email.split('@')[0],
            avatarUrl: profile.picture,
            lastLoginAt: new Date(),
            profile: { create: {} },
            settings: { create: {} },
            notificationPrefs: { create: {} },
            identities: {
              create: {
                provider: 'google',
                providerAccountId: profile.sub,
                email,
                name: profile.name,
                avatarUrl: profile.picture,
                accessTokenEnc: encryptSecret(''), // tokens are not retained by default
              },
            },
          },
        });
      }
    }

    if (!user) throw new Error('Failed to resolve user');
    if (user.isBanned) return Response.redirect(appUrl('/login?error=account_suspended'), 302);

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const { token } = await createSession(user.id, {
      userAgent: req.headers.get('user-agent') ?? undefined,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
    });
    await audit(user.id, 'LOGIN', { metadata: { via: 'google' } });

    const onboardingNeeded = !(await prisma.profile.findUnique({ where: { userId: user.id } }))?.onboardingDone;
    const target = onboardingNeeded ? '/onboarding' : '/dashboard';
    return new Response(null, {
      status: 302,
      headers: {
        location: appUrl(target),
        'set-cookie': [serializeSessionCookie(token), clearCookies].join(', '),
      },
    });
  } catch (e) {
    console.error('[auth/google/callback]', e);
    return Response.redirect(appUrl('/login?error=oauth_failed'), 302);
  }
}
