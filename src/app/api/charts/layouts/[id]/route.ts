import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { forbidden, json, notFound, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

async function getOwned(id: string, userId: string) {
  const layout = await prisma.chartLayout.findUnique({ where: { id } });
  if (!layout) throw notFound('Layout not found');
  if (layout.userId !== userId) throw forbidden('This layout belongs to another user');
  return layout;
}

export const PATCH = withApi(async (req, ctx, user) => {
  const layout = await getOwned(ctx.params.id, user.id);
  const schema = z.object({
    name: z.string().min(1).max(80).optional(),
    symbol: z.string().min(1).max(20).optional(),
    timeframe: z.string().max(10).optional(),
    config: z.any().optional(),
    isDefault: z.boolean().optional(),
  });
  const body = await parseBody(req, schema);
  if (body.isDefault) {
    await prisma.chartLayout.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  }
  const updated = await prisma.chartLayout.update({ where: { id: layout.id }, data: body });
  return json({ layout: updated });
});

export const DELETE = withApi(async (_req, ctx, user) => {
  const layout = await getOwned(ctx.params.id, user.id);
  await prisma.chartLayout.delete({ where: { id: layout.id } });
  return json({ deleted: true });
});
