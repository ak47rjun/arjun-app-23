import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { json, parseBody, withApi } from '@/lib/api';
import { createNotification } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const schema = z.object({ type: z.enum(['LIKE', 'LOVE', 'BULLISH', 'BEARISH']) });

export const POST = withApi(async (req, ctx, user) => {
  const body = await parseBody(req, schema);
  const post = await prisma.post.findUnique({ where: { id: ctx.params.id } });
  if (!post || post.deletedAt) return json({ error: 'NOT_FOUND', message: 'Post not found' }, 404);

  const existing = await prisma.reaction.findUnique({
    where: { userId_postId: { userId: user.id, postId: post.id } },
  });
  if (existing && existing.type === body.type) {
    await prisma.reaction.delete({ where: { id: existing.id } });
    return json({ reacted: false, type: body.type });
  }
  await prisma.reaction.upsert({
    where: { userId_postId: { userId: user.id, postId: post.id } },
    create: { userId: user.id, postId: post.id, type: body.type },
    update: { type: body.type },
  });
  if (post.authorId !== user.id) {
    await createNotification({
      userId: post.authorId,
      type: 'REACTION',
      title: 'New reaction on your post',
      body: `${user.displayName ?? 'Someone'} reacted ${body.type}`,
      data: { postId: post.id },
    });
  }
  return json({ reacted: true, type: body.type });
});
