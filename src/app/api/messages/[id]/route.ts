import { z } from 'zod';
import { json, parseBody, withApi } from '@/lib/api';
import { deleteMessage, editMessage } from '@/lib/messenger/service';
import { emitToConversation } from '@/server/realtime';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const patchSchema = z.object({ content: z.string().min(1).max(4000) });

export const PATCH = withApi(async (req, ctx, user) => {
  const body = await parseBody(req, patchSchema);
  const message = await editMessage(ctx.params.id, user.id, body.content);
  emitToConversation(message.conversationId, 'message:edited', message);
  return json({ message });
});

export const DELETE = withApi(async (_req, ctx, user) => {
  const isMod = user.role === 'ADMIN' || user.role === 'MODERATOR';
  const message = await deleteMessage(ctx.params.id, user.id, isMod);
  emitToConversation(message.conversationId, 'message:deleted', {
    messageId: message.id,
    conversationId: message.conversationId,
    deletedForEveryone: true,
  });
  return json({ deleted: true, deletedForEveryone: true });
});
