import { prisma } from '@/lib/prisma';
import { forbidden, json, notFound, withApi } from '@/lib/api';
import { createNotification } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const POST = withApi(async (req, ctx, user) => {
  const { id } = ctx.params;
  if (id === user.id) throw forbidden('You cannot follow yourself');
  const target = await prisma.user.findUnique({ where: { id }, include: { profile: true } });
  if (!target || target.isBanned) throw notFound('Trader not found');
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: user.id, followingId: id } },
    create: { followerId: user.id, followingId: id },
    update: {},
  });
  await createNotification({
    userId: id,
    type: 'FOLLOW',
    title: 'New follower',
    body: `${user.displayName ?? user.email} started following you`,
    data: { fromUserId: user.id },
  });
  return json({ following: true });
});

export const DELETE = withApi(async (req, ctx, user) => {
  const { id } = ctx.params;
  await prisma.follow.deleteMany({ where: { followerId: user.id, followingId: id } });
  return json({ following: false });
});
