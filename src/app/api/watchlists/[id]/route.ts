import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { forbidden, json, notFound, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

async function getOwned(id: string, userId: string) {
  const wl = await prisma.watchlist.findUnique({ where: { id }, include: { items: true } });
  if (!wl) throw notFound('Watchlist not found');
  if (wl.userId !== userId) throw forbidden('This watchlist belongs to another user');
  return wl;
}

export const GET = withApi(async (_req, ctx, user) => {
  const wl = await getOwned(ctx.params.id, user.id);
  return json({ watchlist: wl });
});

const patchSchema = z.object({ name: z.string().min(1).max(60).optional() });

export const PATCH = withApi(async (req, ctx, user) => {
  await getOwned(ctx.params.id, user.id);
  const body = await parseBody(req, patchSchema);
  const wl = await prisma.watchlist.update({ where: { id: ctx.params.id }, data: body });
  return json({ watchlist: wl });
});

export const DELETE = withApi(async (_req, ctx, user) => {
  const wl = await getOwned(ctx.params.id, user.id);
  if (wl.isDefault) return json({ error: 'DEFAULT_WATCHLIST', message: 'The default watchlist cannot be deleted' }, 400);
  await prisma.watchlist.delete({ where: { id: wl.id } });
  return json({ deleted: true });
});
