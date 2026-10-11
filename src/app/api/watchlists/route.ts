import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { json, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(async (_req, _ctx, user) => {
  let watchlists = await prisma.watchlist.findMany({
    where: { userId: user.id },
    include: { items: { include: { instrument: true }, orderBy: { sortOrder: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  // first user gets a default watchlist
  if (watchlists.length === 0) {
    const wl = await prisma.watchlist.create({
      data: { userId: user.id, name: 'My Watchlist', isDefault: true },
      include: { items: { include: { instrument: true } } },
    });
    watchlists = [wl];
  }
  return json({ watchlists });
});

const schema = z.object({ name: z.string().min(1).max(60) });

export const POST = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, schema);
  const watchlist = await prisma.watchlist.create({
    data: { userId: user.id, name: body.name },
    include: { items: true },
  });
  return json({ watchlist }, 201);
});
