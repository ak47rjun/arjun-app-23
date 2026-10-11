import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { json, notFound, parseBody, withApi } from '@/lib/api';
import { createNotification } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(async (_req, ctx, user) => {
  const comments = await prisma.comment.findMany({
    where: { postId: ctx.params.id, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  return json({ comments });
});

const schema = z.object({ content: z.string().min(1).max(2000), parentId: z.string().optional() });

export const POST = withApi(async (req, ctx, user) => {
  const post = await prisma.post.findUnique({ where: { id: ctx.params.id } });
  if (!post || post.deletedAt) throw notFound('Post not found');
  const body = await parseBody(req, schema);
  const comment = await prisma.comment.create({
    data: { postId: post.id, authorId: user.id, content: body.content, parentId: body.parentId },
    include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  if (post.authorId !== user.id) {
    await createNotification({
      userId: post.authorId,
      type: 'MENTION',
      title: 'New comment on your post',
      body: body.content.slice(0, 140),
      data: { postId: post.id, commentId: comment.id },
    });
  }
  return json({ comment }, 201);
});
