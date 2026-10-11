import { prisma } from '@/lib/prisma';
import { forbidden, json, notFound, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const DELETE = withApi(async (_req, ctx, user) => {
  const comment = await prisma.comment.findUnique({ where: { id: ctx.params.id } });
  if (!comment) throw notFound('Comment not found');
  const isMod = user.role === 'ADMIN' || user.role === 'MODERATOR';
  if (comment.authorId !== user.id && !isMod) throw forbidden('You can only delete your own comments');
  await prisma.comment.update({ where: { id: comment.id }, data: { deletedAt: new Date() } });
  return json({ deleted: true });
});
