import { prisma } from '@/lib/prisma';
import { json, notFound, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** Public profile — private data (email, journal, messages) is never exposed. */
export const GET = withApi(async (req, ctx, user) => {
  const { id } = ctx.params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      displayName: true,
      name: true,
      avatarUrl: true,
      bio: true,
      createdAt: true,
      isBanned: true,
      profile: true,
      _count: { select: { posts: true, followers: true, following: true } },
    },
  });
  if (!target) throw notFound('Trader not found');

  const isOwn = target.id === user.id;
  const canSee = isOwn || (target.profile?.isPublic && !target.isBanned);
  if (!canSee) throw notFound('Trader not found');

  const follow = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: user.id, followingId: target.id } },
  });

  // public, self-reported stats only when the trader opted in
  let stats: { trades: number; winRate: number | null; netPnl: number | null } | null = null;
  if (isOwn || target.profile?.showStats) {
    const trades = await prisma.trade.findMany({
      where: { userId: target.id, status: 'CLOSED', netPnl: { not: null } },
      select: { netPnl: true },
    });
    const wins = trades.filter((t) => Number(t.netPnl) > 0).length;
    stats = {
      trades: trades.length,
      winRate: trades.length ? wins / trades.length : null,
      netPnl: trades.length ? trades.reduce((s, t) => s + Number(t.netPnl), 0) : null,
    };
  }

  const posts = await prisma.post.findMany({
    where: { authorId: target.id, deletedAt: null, visibility: 'PUBLIC' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      content: true,
      mediaUrls: true,
      createdAt: true,
      _count: { select: { comments: true, reactions: true } },
    },
  });

  return json({
    profile: {
      ...target,
      isOwn,
      isFollowing: Boolean(follow),
      stats,
      posts,
    },
  });
});
