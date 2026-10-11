import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { forbidden, json, notFound, parseBody, withApi } from '@/lib/api';
import { canViewShare } from '@/lib/charts/access';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** A viewer's own analysis on a shared chart — never mutates the original. */
export const GET = withApi(async (_req, ctx, user) => {
  const share = await prisma.chartShare.findUnique({ where: { id: ctx.params.id } });
  if (!share) throw notFound('Shared chart not found');
  if (!(await canViewShare(share, user.id))) throw forbidden('You do not have access to this shared chart');
  const notes = await prisma.chartNote.findMany({
    where: { shareId: share.id },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  return json({ notes });
});

const schema = z.object({
  content: z.string().min(1).max(5000),
  drawings: z.any().optional(),
});

export const POST = withApi(async (req, ctx, user) => {
  const share = await prisma.chartShare.findUnique({ where: { id: ctx.params.id } });
  if (!share) throw notFound('Shared chart not found');
  if (!(await canViewShare(share, user.id))) throw forbidden('You do not have access to this shared chart');
  const body = await parseBody(req, schema);
  const note = await prisma.chartNote.create({
    data: {
      shareId: share.id,
      userId: user.id,
      content: body.content,
      drawings: body.drawings ?? undefined,
    },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  return json({ note }, 201);
});
