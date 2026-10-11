import { prisma } from '@/lib/prisma';
import { forbidden, json, notFound, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const POST = withApi(async (_req, ctx, user) => {
  const group = await prisma.group.findUnique({ where: { id: ctx.params.id }, include: { conversation: true } });
  if (!group) throw notFound('Group not found');
  if (group.visibility === 'PRIVATE') {
    const isAdmin = user.role === 'ADMIN';
    if (!isAdmin) throw forbidden('This group is private — ask a member to add you');
  }
  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId: group.id, userId: user.id } },
    create: { groupId: group.id, userId: user.id },
    update: {},
  });
  // join the group's chat conversation too
  if (group.conversation) {
    await prisma.conversationMember.upsert({
      where: { conversationId_userId: { conversationId: group.conversation.id, userId: user.id } },
      create: { conversationId: group.conversation.id, userId: user.id },
      update: {},
    });
  }
  return json({ joined: true });
});

export const DELETE = withApi(async (_req, ctx, user) => {
  const group = await prisma.group.findUnique({ where: { id: ctx.params.id }, include: { conversation: true } });
  if (!group) throw notFound('Group not found');
  await prisma.groupMember.deleteMany({ where: { groupId: group.id, userId: user.id } });
  if (group.conversation) {
    await prisma.conversationMember.deleteMany({
      where: { conversationId: group.conversation.id, userId: user.id },
    });
  }
  return json({ joined: false });
});
