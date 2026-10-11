import { z } from 'zod';
import { json, parseBody, withApi } from '@/lib/api';
import { createMessage, listMessages } from '@/lib/messenger/service';
import { emitToConversation } from '@/server/realtime';
import { prisma } from '@/lib/prisma';
import { createNotifications } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(async (req, ctx, user) => {
  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const messages = await listMessages(ctx.params.id, user.id, { cursor, limit });
  return json({ messages });
});

const sendSchema = z.object({
  content: z.string().max(4000).optional(),
  type: z.enum(['TEXT', 'ATTACHMENT', 'CHART_SHARE']).optional(),
  attachmentId: z.string().optional(),
  chartShareId: z.string().optional(),
  replyToId: z.string().optional(),
  clientKey: z.string().max(80).optional(),
});

export const POST = withApi(async (req, ctx, user) => {
  const body = await parseBody(req, sendSchema);
  const message = await createMessage({ ...body, conversationId: ctx.params.id, senderId: user.id });

  // realtime fan-out (same payload the socket server produces)
  emitToConversation(message.conversationId, 'message:new', message);
  const members = await prisma.conversationMember.findMany({
    where: { conversationId: message.conversationId, userId: { not: user.id } },
  });
  await createNotifications(
    members.map((m) => ({
      userId: m.userId,
      type: 'MESSAGE' as const,
      title: 'New message',
      body: message.content ?? (message.type === 'CHART_SHARE' ? 'Shared a chart' : 'Sent an attachment'),
      data: { conversationId: message.conversationId, messageId: message.id },
    })),
  );

  return json({ message }, 201);
});
