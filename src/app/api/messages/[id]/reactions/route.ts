import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { json, notFound, parseBody, withApi } from '@/lib/api';
import { toggleReaction } from '@/lib/messenger/service';
import { emitToConversation } from '@/server/realtime';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const schema = z.object({ emoji: z.string().min(1).max(12) });

export const POST = withApi(async (req, ctx, user) => {
  const body = await parseBody(req, schema);
  const result = await toggleReaction(ctx.params.id, user.id, body.emoji);
  const message = await prisma.message.findUnique({ where: { id: ctx.params.id } });
  if (message) {
    emitToConversation(message.conversationId, 'message:reaction', {
      messageId: ctx.params.id,
      ...result,
      userId: user.id,
    });
  }
  return json(result);
});
