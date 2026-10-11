import { z } from 'zod';
import { json, parseBody, withApi } from '@/lib/api';
import { addMember, removeMember, assertConversationMember } from '@/lib/messenger/service';
import { prisma } from '@/lib/prisma';
import { emitToUser } from '@/server/realtime';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const addSchema = z.object({ userId: z.string() });

export const POST = withApi(async (req, ctx, user) => {
  const body = await parseBody(req, addSchema);
  const conversation = await addMember(ctx.params.id, user.id, body.userId);
  emitToUser(body.userId, 'conversation:added', { conversationId: ctx.params.id });
  return json({ conversation });
});

export const DELETE = withApi(async (req, ctx, user) => {
  const url = new URL(req.url);
  const targetId = url.searchParams.get('userId') ?? user.id;
  const result = await removeMember(ctx.params.id, user.id, targetId);
  if (targetId !== user.id) {
    const membership = await prisma.conversationMember.findMany({
      where: { conversationId: ctx.params.id },
    });
    emitToUser(targetId, 'conversation:removed', { conversationId: ctx.params.id });
    return json({ result, members: membership.length });
  }
  return json({ result });
});

export const GET = withApi(async (_req, ctx, user) => {
  await assertConversationMember(ctx.params.id, user.id);
  const members = await prisma.conversationMember.findMany({
    where: { conversationId: ctx.params.id },
    include: { user: { select: { id: true, displayName: true, name: true, avatarUrl: true } } },
  });
  return json({ members });
});
