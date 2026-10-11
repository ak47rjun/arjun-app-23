import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { forbidden, json, notFound, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(async (_req, ctx, user) => {
  const group = await prisma.group.findUnique({
    where: { id: ctx.params.id },
    include: {
      owner: { select: { id: true, displayName: true, avatarUrl: true } },
      _count: { select: { members: true, posts: true } },
    },
  });
  if (!group) throw notFound('Group not found');
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: user.id } },
  });
  const canSee = group.visibility === 'PUBLIC' || Boolean(membership) || user.role === 'ADMIN';
  if (!canSee) throw forbidden('This group is private');
  return json({ group: { ...group, isMember: Boolean(membership), myRole: membership?.role ?? null } });
});

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(1000).nullable().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
});

export const PATCH = withApi(async (req, ctx, user) => {
  const group = await prisma.group.findUnique({
    where: { id: ctx.params.id },
    include: { members: { where: { userId: user.id } } },
  });
  if (!group) throw notFound('Group not found');
  const isOwner = group.ownerId === user.id || group.members[0]?.role === 'OWNER' || user.role === 'ADMIN';
  if (!isOwner) throw forbidden('Only the group owner can edit the group');
  const body = await parseBody(req, patchSchema);
  const updated = await prisma.group.update({ where: { id: group.id }, data: body });
  return json({ group: updated });
});
