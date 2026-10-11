import { prisma } from '@/lib/prisma';
import { json, withApi } from '@/lib/api';
import { getUnreadCount } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(async (_req, _ctx, user) => {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      profile: true,
      settings: true,
      _count: { select: { trades: true, posts: true, followers: true, following: true } },
    },
  });
  if (!dbUser) return json({ user: null });
  const unreadNotifications = await getUnreadCount(user.id);
  return json({
    user: {
      id: dbUser.id,
      email: dbUser.email,
      emailVerified: dbUser.emailVerified,
      role: dbUser.role,
      displayName: dbUser.displayName,
      name: dbUser.name,
      avatarUrl: dbUser.avatarUrl,
      bio: dbUser.bio,
      timezone: dbUser.timezone,
      totpEnabled: dbUser.totpEnabled,
      isBanned: dbUser.isBanned,
      createdAt: dbUser.createdAt,
      profile: dbUser.profile,
      settings: dbUser.settings,
      stats: dbUser._count,
      unreadNotifications,
    },
  });
});
