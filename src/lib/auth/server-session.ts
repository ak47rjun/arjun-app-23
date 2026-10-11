/** Server-component helper: load the current session user from cookies. */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '../prisma';
import { verifySessionToken } from './jwt';
import { SESSION_COOKIE } from './cookies';
import type { SessionUser } from './session';

export async function getServerSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  const session = await prisma.session.findUnique({ where: { id: payload.sid } });
  if (!session || session.userId !== payload.sub || session.expiresAt < new Date()) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      profile: { select: { onboardingDone: true, verifiedBadge: true, isPublic: true } },
      settings: { select: { theme: true, dashboardLayout: true } },
    },
  });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role,
    isBanned: user.isBanned,
    displayName: user.displayName,
    name: user.name,
    avatarUrl: user.avatarUrl,
    timezone: user.timezone,
    totpEnabled: user.totpEnabled,
    profile: user.profile,
    settings: user.settings,
  };
}

/** Require a session in a server component; redirects to /login otherwise. */
export async function requireServerSession(): Promise<SessionUser> {
  const user = await getServerSessionUser();
  if (!user) redirect('/login');
  return user;
}
