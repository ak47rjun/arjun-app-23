import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { forbidden, json, notFound, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const patchSchema = z.object({
  alertEnabled: z.boolean().optional(),
  alertAbove: z.coerce.number().positive().nullable().optional(),
  alertBelow: z.coerce.number().positive().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const PATCH = withApi(async (req, ctx, user) => {
  const item = await prisma.watchlistItem.findUnique({
    where: { id: ctx.params.itemId },
    include: { watchlist: true },
  });
  if (!item) throw notFound('Item not found');
  if (item.watchlist.userId !== user.id) throw forbidden('This watchlist belongs to another user');
  const body = await parseBody(req, patchSchema);
  const updated = await prisma.watchlistItem.update({ where: { id: item.id }, data: body });
  return json({ item: updated });
});

export const DELETE = withApi(async (_req, ctx, user) => {
  const item = await prisma.watchlistItem.findUnique({
    where: { id: ctx.params.itemId },
    include: { watchlist: true },
  });
  if (!item) throw notFound('Item not found');
  if (item.watchlist.userId !== user.id) throw forbidden('This watchlist belongs to another user');
  await prisma.watchlistItem.delete({ where: { id: item.id } });
  return json({ removed: true });
});
