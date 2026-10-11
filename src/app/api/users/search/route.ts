import { prisma } from '@/lib/prisma';
import { json, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(async (req, _ctx, user) => {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (!q) return json({ users: [] });
  const users = await prisma.user.findMany({
    where: {
      isBanned: false,
      profile: { isPublic: true },
      OR: [{ displayName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }],
    },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      profile: { select: { verifiedBadge: true } },
      _count: { select: { followers: true } },
    },
    take: 20,
  });
  const following = await prisma.follow.findMany({
    where: { followerId: user.id, followingId: { in: users.map((u) => u.id) } },
    select: { followingId: true },
  });
  const followingSet = new Set(following.map((f) => f.followingId));
  return json({ users: users.map((u) => ({ ...u, isFollowing: followingSet.has(u.id) })) });
});
