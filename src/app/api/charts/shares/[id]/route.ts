import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { forbidden, json, notFound, parseBody, withApi } from '@/lib/api';
import { canViewShare } from '@/lib/charts/access';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = withApi(async (_req, ctx, user) => {
  const share = await prisma.chartShare.findUnique({
    where: { id: ctx.params.id },
    include: {
      owner: { select: { id: true, displayName: true, avatarUrl: true, profile: { select: { verifiedBadge: true } } } },
      snapshot: true,
      group: { select: { id: true, name: true } },
      notes: {
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!share) throw notFound('Shared chart not found');
  if (!(await canViewShare(share, user.id))) throw forbidden('You do not have access to this shared chart');

  await prisma.chartShare.update({ where: { id: share.id }, data: { viewCount: { increment: 1 } } });
  return json({ share, isOwner: share.ownerId === user.id });
});

const patchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  bias: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']).nullable().optional(),
  analysis: z.string().max(5000).nullable().optional(),
  entry: z.coerce.number().positive().nullable().optional(),
  stopLoss: z.coerce.number().positive().nullable().optional(),
  takeProfit: z.coerce.number().positive().nullable().optional(),
  timeframe: z.string().max(10).optional(),
  visibility: z.enum(['PRIVATE', 'GROUP', 'PUBLIC']).optional(),
});

export const PATCH = withApi(async (req, ctx, user) => {
  const share = await prisma.chartShare.findUnique({ where: { id: ctx.params.id }, include: { group: true } });
  if (!share) throw notFound('Shared chart not found');
  if (share.ownerId !== user.id) throw forbidden('Only the owner can edit this share');
  const body = await parseBody(req, patchSchema);
  const updated = await prisma.chartShare.update({ where: { id: share.id }, data: body });
  return json({ share: updated });
});

export const DELETE = withApi(async (_req, ctx, user) => {
  const share = await prisma.chartShare.findUnique({ where: { id: ctx.params.id } });
  if (!share) throw notFound('Shared chart not found');
  if (share.ownerId !== user.id) throw forbidden('Only the owner can delete this share');
  await prisma.chartShare.delete({ where: { id: share.id } });
  return json({ deleted: true });
});
