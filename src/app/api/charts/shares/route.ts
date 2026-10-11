import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { badRequest, forbidden, json, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** List my shares + shares shared with me (via groups I belong to). */
export const GET = withApi(async (req, _ctx, user) => {
  const scope = new URL(req.url).searchParams.get('scope') ?? 'mine';
  if (scope === 'mine') {
    const shares = await prisma.chartShare.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { snapshot: true, group: { select: { id: true, name: true } } },
    });
    return json({ shares });
  }
  const memberships = await prisma.groupMember.findMany({ where: { userId: user.id }, select: { groupId: true } });
  const shares = await prisma.chartShare.findMany({
    where: {
      visibility: 'GROUP',
      groupId: { in: memberships.map((m) => m.groupId) },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      owner: { select: { id: true, displayName: true, avatarUrl: true } },
      group: { select: { id: true, name: true } },
    },
  });
  return json({ shares });
});

const schema = z.object({
  title: z.string().min(1).max(120),
  symbol: z.string().min(1).max(20),
  timeframe: z.string().max(10).default('60'),
  bias: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']).optional(),
  analysis: z.string().max(5000).optional(),
  entry: z.coerce.number().positive().optional(),
  stopLoss: z.coerce.number().positive().optional(),
  takeProfit: z.coerce.number().positive().optional(),
  snapshotId: z.string().optional(),
  visibility: z.enum(['PRIVATE', 'GROUP', 'PUBLIC']).default('PRIVATE'),
  groupId: z.string().optional(),
});

export const POST = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, schema);
  if (body.visibility === 'GROUP') {
    if (!body.groupId) throw badRequest('groupId is required for group sharing');
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: body.groupId, userId: user.id } },
    });
    if (!membership) throw forbidden('You are not a member of this group');
  }
  if (body.snapshotId) {
    const snapshot = await prisma.chartSnapshot.findUnique({ where: { id: body.snapshotId } });
    if (!snapshot || snapshot.userId !== user.id) throw badRequest('Snapshot not found');
  }
  const instrument = await prisma.instrument.findUnique({ where: { symbol: body.symbol.toUpperCase() } });
  const share = await prisma.chartShare.create({
    data: {
      ownerId: user.id,
      title: body.title,
      symbol: body.symbol.toUpperCase(),
      timeframe: body.timeframe,
      bias: body.bias,
      analysis: body.analysis,
      entry: body.entry,
      stopLoss: body.stopLoss,
      takeProfit: body.takeProfit,
      snapshotId: body.snapshotId,
      instrumentId: instrument?.id,
      visibility: body.visibility,
      groupId: body.visibility === 'GROUP' ? body.groupId : null,
    },
    include: { snapshot: true, group: true },
  });
  return json({ share }, 201);
});
