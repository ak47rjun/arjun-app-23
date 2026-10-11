import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { json, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(async (_req, _ctx, user) => {
  const blocks = await prisma.block.findMany({
    where: { blockerId: user.id },
    include: { blocked: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  return json({ blocks });
});

const schema = z.object({ userId: z.string() });

export const POST = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, schema);
  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: user.id, blockedId: body.userId } },
    create: { blockerId: user.id, blockedId: body.userId },
    update: {},
  });
  // a block also severs existing DMs
  const memberships = await prisma.conversationMember.findMany({
    where: { userId: user.id, conversation: { type: 'DM', members: { some: { userId: body.userId } } } },
    select: { conversationId: true },
  });
  for (const m of memberships) {
    await prisma.conversationMember.deleteMany({
      where: { conversationId: m.conversationId, userId: { in: [user.id, body.userId] } },
    });
  }
  return json({ blocked: true });
});

export const DELETE = withApi(async (req, _ctx, user) => {
  const userId = new URL(req.url).searchParams.get('userId');
  if (userId) await prisma.block.deleteMany({ where: { blockerId: user.id, blockedId: userId } });
  return json({ blocked: false });
});
