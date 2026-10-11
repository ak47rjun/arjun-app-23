import { z } from 'zod';
import { json, parseBody, withApi } from '@/lib/api';
import { togglePin } from '@/lib/messenger/service';
import { emitToConversation } from '@/server/realtime';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const schema = z.object({ pinned: z.boolean() });

export const POST = withApi(async (req, ctx, user) => {
  const body = await parseBody(req, schema);
  const isMod = user.role === 'ADMIN' || user.role === 'MODERATOR';
  const message = await togglePin(ctx.params.id, user.id, body.pinned, isMod);
  const full = await prisma.message.findUnique({ where: { id: message.id } });
  if (full) {
    emitToConversation(full.conversationId, 'message:pinned', {
      messageId: full.id,
      conversationId: full.conversationId,
      pinned: body.pinned,
    });
  }
  return json({ pinned: message.pinned });
});
