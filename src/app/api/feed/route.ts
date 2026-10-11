import { prisma } from '@/lib/prisma';
import { json, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** Personal feed: posts from followed traders + own posts + public group posts. */
export const GET = withApi(async (req, _ctx, user) => {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 50);
  const cursor = url.searchParams.get('cursor');

  const following = await prisma.follow.findMany({
    where: { followerId: user.id },
    select: { followingId: true },
  });
  const followingIds = following.map((f) => f.followingId);

  const groupMemberships = await prisma.groupMember.findMany({
    where: { userId: user.id },
    select: { groupId: true },
  });

  const posts = await prisma.post.findMany({
    where: {
      deletedAt: null,
      OR: [
        { authorId: { in: [...followingIds, user.id] } },
        { groupId: { in: groupMemberships.map((g) => g.groupId) } },
      ],
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true, profile: { select: { verifiedBadge: true } } } },
      group: { select: { id: true, name: true, slug: true } },
      _count: { select: { comments: true, reactions: true } },
      reactions: { where: { userId: user.id }, select: { type: true } },
    },
  });

  return json({
    posts: posts.map((p) => ({ ...p, myReaction: p.reactions[0]?.type ?? null })),
    nextCursor: posts.length === limit ? posts[posts.length - 1].createdAt.toISOString() : null,
  });
});
