import { prisma } from '@/lib/prisma';
import { forbidden, json, notFound, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(async (_req, ctx, user) => {
  const group = await prisma.group.findUnique({
    where: { id: ctx.params.id },
    include: { members: { where: { userId: user.id } } },
  });
  if (!group) throw notFound('Group not found');
  const canSee = group.visibility === 'PUBLIC' || group.members.length > 0 || user.role === 'ADMIN';
  if (!canSee) throw forbidden('This group is private');
  const members = await prisma.groupMember.findMany({
    where: { groupId: group.id },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true, profile: { select: { verifiedBadge: true } } } } },
    orderBy: { joinedAt: 'asc' },
  });
  return json({ members });
});

export const DELETE = withApi(async (req, ctx, user) => {
  const targetId = new URL(req.url).searchParams.get('userId');
  const group = await prisma.group.findUnique({
    where: { id: ctx.params.id },
    include: { members: { where: { userId: user.id } } },
  });
  if (!group) throw notFound('Group not found');
  const myRole = group.members[0]?.role;
  const isSelf = targetId === user.id;
  const canRemove = isSelf || myRole === 'OWNER' || myRole === 'ADMIN' || user.role === 'ADMIN';
  if (!canRemove) throw forbidden('You cannot remove members');
  if (targetId) {
    await prisma.groupMember.deleteMany({ where: { groupId: group.id, userId: targetId } });
  }
  return json({ removed: true });
});
