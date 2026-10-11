import { z } from 'zod';
import { json, parseBody, withApi } from '@/lib/api';
import { markConversationRead } from '@/lib/messenger/service';
import { emitToConversation } from '@/server/realtime';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const schema = z.object({ messageId: z.string().optional() });

export const POST = withApi(async (req, ctx, user) => {
  const body = await parseBody(req, schema);
  await markConversationRead(ctx.params.id, user.id, body.messageId);
  emitToConversation(ctx.params.id, 'message:read', {
    conversationId: ctx.params.id,
    userId: user.id,
    messageId: body.messageId,
  });
  return json({ read: true });
});
