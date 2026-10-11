import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { json, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(async (_req, _ctx, user) => {
  const tags = await prisma.tag.findMany({
    where: { userId: user.id },
    orderBy: { name: 'asc' },
    include: { _count: { select: { trades: true } } },
  });
  return json({ tags });
});

const schema = z.object({
  name: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#34d399'),
});

export const POST = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, schema);
  const tag = await prisma.tag.upsert({
    where: { userId_name: { userId: user.id, name: body.name } },
    create: { userId: user.id, name: body.name, color: body.color },
    update: { color: body.color },
  });
  return json({ tag }, 201);
});
