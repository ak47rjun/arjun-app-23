import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { badRequest, forbidden, json, notFound, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

async function assertOwned(watchlistId: string, userId: string) {
  const wl = await prisma.watchlist.findUnique({ where: { id: watchlistId } });
  if (!wl) throw notFound('Watchlist not found');
  if (wl.userId !== userId) throw forbidden('This watchlist belongs to another user');
  return wl;
}

const addSchema = z.object({ instrumentId: z.string() });

export const POST = withApi(async (req, ctx, user) => {
  const wl = await assertOwned(ctx.params.id, user.id);
  const body = await parseBody(req, addSchema);
  const instrument = await prisma.instrument.findUnique({ where: { id: body.instrumentId } });
  if (!instrument) throw notFound('Instrument not found');

  const count = await prisma.watchlistItem.count({ where: { watchlistId: wl.id } });
  const item = await prisma.watchlistItem.upsert({
    where: { watchlistId_instrumentId: { watchlistId: wl.id, instrumentId: instrument.id } },
    create: { watchlistId: wl.id, instrumentId: instrument.id, sortOrder: count },
    update: {},
    include: { instrument: true },
  });
  return json({ item }, 201);
});

export const DELETE = withApi(async (req, ctx, user) => {
  const wl = await assertOwned(ctx.params.id, user.id);
  const instrumentId = new URL(req.url).searchParams.get('instrumentId');
  if (!instrumentId) throw badRequest('instrumentId is required');
  await prisma.watchlistItem.deleteMany({ where: { watchlistId: wl.id, instrumentId } });
  return json({ removed: true });
});
