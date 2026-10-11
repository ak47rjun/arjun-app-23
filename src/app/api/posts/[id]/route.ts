import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { forbidden, json, notFound, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

async function getVisiblePost(id: string, userId: string) {
  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true, profile: { select: { verifiedBadge: true } } } },
      _count: { select: { comments: true, reactions: true } },
    },
  });
  if (!post || post.deletedAt) throw notFound('Post not found');
  const isAuthor = post.authorId === userId;
  const isMod = false; // role check done by caller when needed
  if (!isAuthor && post.visibility === 'FOLLOWERS') {
    const follow = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: post.authorId } },
    });
    if (!follow) throw forbidden('This post is only visible to followers');
  }
  return { post, isAuthor, isMod };
}

export const GET = withApi(async (_req, ctx, user) => {
  const { post } = await getVisiblePost(ctx.params.id, user.id);
  const comments = await prisma.comment.findMany({
    where: { postId: post.id, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  const reactions = await prisma.reaction.findMany({ where: { postId: post.id } });
  return json({ post, comments, reactions });
});

const patchSchema = z.object({ content: z.string().min(1).max(5000) });

export const PATCH = withApi(async (req, ctx, user) => {
  const { post, isAuthor } = await getVisiblePost(ctx.params.id, user.id);
  if (!isAuthor) throw forbidden('You can only edit your own posts');
  const body = await parseBody(req, patchSchema);
  const updated = await prisma.post.update({
    where: { id: post.id },
    data: { content: body.content, editedAt: new Date() },
  });
  return json({ post: updated });
});

export const DELETE = withApi(async (_req, ctx, user) => {
  const { post, isAuthor } = await getVisiblePost(ctx.params.id, user.id);
  const isMod = user.role === 'ADMIN' || user.role === 'MODERATOR';
  if (!isAuthor && !isMod) throw forbidden('You can only delete your own posts');
  if (isMod && !isAuthor) {
    await prisma.moderationAction.create({
      data: { moderatorId: user.id, action: 'DELETE_CONTENT', targetUserId: post.authorId, details: { postId: post.id } },
    });
  }
  await prisma.post.update({ where: { id: post.id }, data: { deletedAt: new Date() } });
  return json({ deleted: true });
});
