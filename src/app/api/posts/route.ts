import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { badRequest, json, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** Create a post (optionally in a group). */
const createSchema = z.object({
  content: z.string().min(1).max(5000),
  mediaUrls: z.array(z.string().url()).max(6).default([]),
  visibility: z.enum(['PUBLIC', 'FOLLOWERS']).default('PUBLIC'),
  groupId: z.string().optional(),
});

export const POST = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, createSchema);
  if (body.groupId) {
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: body.groupId, userId: user.id } },
    });
    if (!membership) return json({ error: 'FORBIDDEN', message: 'You are not a member of this group' }, 403);
  }
  const post = await prisma.post.create({
    data: {
      authorId: user.id,
      content: body.content,
      mediaUrls: body.mediaUrls,
      visibility: body.visibility,
      groupId: body.groupId,
    },
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true, profile: { select: { verifiedBadge: true } } } },
      _count: { select: { comments: true, reactions: true } },
    },
  });
  return json({ post }, 201);
});

/** List posts (group feed or public feed). */
export const GET = withApi(async (req, _ctx, user) => {
  const url = new URL(req.url);
  const groupId = url.searchParams.get('groupId');
  const authorId = url.searchParams.get('authorId');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 50);
  const cursor = url.searchParams.get('cursor');

  const posts = await prisma.post.findMany({
    where: {
      deletedAt: null,
      ...(groupId
        ? { groupId }
        : authorId
          ? { authorId }
          : {
              OR: [
                { visibility: 'PUBLIC' },
                { visibility: 'FOLLOWERS', author: { followers: { some: { followerId: user.id } } } },
                { authorId: user.id },
              ],
            }),
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
