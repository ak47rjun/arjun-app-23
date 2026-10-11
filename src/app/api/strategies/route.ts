import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { json, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(async (_req, _ctx, user) => {
  const strategies = await prisma.strategy.findMany({
    where: { userId: user.id },
    orderBy: { name: 'asc' },
    include: { _count: { select: { trades: true } } },
  });
  return json({ strategies });
});

const schema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(1000).optional(),
});

export const POST = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, schema);
  const strategy = await prisma.strategy.create({
    data: { userId: user.id, name: body.name, description: body.description },
  });
  return json({ strategy }, 201);
});
