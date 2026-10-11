import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { json, parseBody, withApi } from '@/lib/api';
import { assertConversationMember, toggleMute } from '@/lib/messenger/service';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(async (_req, ctx, user) => {
  const membership = await assertConversationMember(ctx.params.id, user.id);
  const conversation = await prisma.conversation.findUnique({
    where: { id: ctx.params.id },
    include: {
      members: {
        include: { user: { select: { id: true, displayName: true, name: true, avatarUrl: true } } },
      },
      group: { select: { id: true, name: true, slug: true } },
    },
  });
  const pinned = await prisma.message.findMany({
    where: { conversationId: ctx.params.id, pinned: true, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  return json({ conversation, membership, pinned });
});

const patchSchema = z.object({
  mute: z.boolean().optional(),
  pinned: z.boolean().optional(),
  name: z.string().min(1).max(80).optional(),
});

export const PATCH = withApi(async (req, ctx, user) => {
  const membership = await assertConversationMember(ctx.params.id, user.id);
  const body = await parseBody(req, patchSchema);
  if (body.mute !== undefined) {
    await toggleMute(ctx.params.id, user.id, body.mute);
  }
  if (body.pinned !== undefined) {
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: ctx.params.id, userId: user.id } },
      data: { pinned: body.pinned },
    });
  }
  if (body.name !== undefined && membership.role !== 'MEMBER') {
    await prisma.conversation.update({ where: { id: ctx.params.id }, data: { name: body.name } });
  }
  return json({ updated: true });
});
