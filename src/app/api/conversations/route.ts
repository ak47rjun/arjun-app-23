import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { json, parseBody, withApi } from '@/lib/api';
import { getOrCreateDm, listConversationsWithUnread } from '@/lib/messenger/service';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(async (_req, _ctx, user) => {
  const conversations = await listConversationsWithUnread(user.id);
  return json({ conversations });
});

const createSchema = z.object({
  type: z.enum(['DM', 'GROUP']),
  userId: z.string().optional(), // for DM
  name: z.string().min(1).max(80).optional(), // for GROUP
  memberIds: z.array(z.string()).default([]), // for GROUP
});

export const POST = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, createSchema);
  if (body.type === 'DM') {
    if (!body.userId) return json({ error: 'VALIDATION', message: 'userId is required for DM' }, 400);
    const conversation = await getOrCreateDm(user.id, body.userId);
    return json({ conversation }, 201);
  }
  // group conversation
  if (!body.name) return json({ error: 'VALIDATION', message: 'name is required for groups' }, 400);
  const memberIds = [...new Set([...body.memberIds, user.id])];
  const users = await prisma.user.findMany({ where: { id: { in: memberIds } } });
  if (users.length !== memberIds.length) {
    return json({ error: 'VALIDATION', message: 'Some users were not found' }, 400);
  }
  const conversation = await prisma.conversation.create({
    data: {
      type: 'GROUP',
      name: body.name,
      createdById: user.id,
      members: {
        create: memberIds.map((id) => ({ userId: id, role: id === user.id ? 'OWNER' : 'MEMBER' })),
      },
    },
    include: { members: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } } },
  });
  return json({ conversation }, 201);
});
