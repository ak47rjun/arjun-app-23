import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { computeTradePnl, computePlannedRR } from '@/lib/journal/pnl';
import { forbidden, json, notFound, parseBody, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

async function getOwnedTrade(id: string, userId: string) {
  const trade = await prisma.trade.findUnique({
    where: { id },
    include: { instrument: true, strategy: true, tags: true, screenshots: true, account: true },
  });
  if (!trade) throw notFound('Trade not found');
  if (trade.userId !== userId) throw forbidden('This trade belongs to another user');
  return trade;
}

function serialize(t: Awaited<ReturnType<typeof getOwnedTrade>>) {
  return {
    ...t,
    entryPrice: Number(t.entryPrice),
    exitPrice: t.exitPrice === null ? null : Number(t.exitPrice),
    stopLoss: t.stopLoss === null ? null : Number(t.stopLoss),
    takeProfit: t.takeProfit === null ? null : Number(t.takeProfit),
    quantity: Number(t.quantity),
    fees: Number(t.fees),
    commission: Number(t.commission),
    swap: Number(t.swap),
    grossPnl: t.grossPnl === null ? null : Number(t.grossPnl),
    netPnl: t.netPnl === null ? null : Number(t.netPnl),
    riskAmount: t.riskAmount === null ? null : Number(t.riskAmount),
    riskPercent: t.riskPercent === null ? null : Number(t.riskPercent),
    rewardToRisk: t.rewardToRisk === null ? null : Number(t.rewardToRisk),
    plannedEntry: t.plannedEntry === null ? null : Number(t.plannedEntry),
    plannedStop: t.plannedStop === null ? null : Number(t.plannedStop),
    plannedTarget: t.plannedTarget === null ? null : Number(t.plannedTarget),
    contractSize: Number(t.instrument?.contractSize ?? 1),
  };
}

export const GET = withApi(async (_req, ctx, user) => {
  const trade = await getOwnedTrade(ctx.params.id, user.id);
  return json({ trade: serialize(trade) });
});

const updateSchema = z.object({
  direction: z.enum(['LONG', 'SHORT']).optional(),
  status: z.enum(['OPEN', 'CLOSED']).optional(),
  entryPrice: z.coerce.number().positive().optional(),
  exitPrice: z.coerce.number().positive().nullable().optional(),
  stopLoss: z.coerce.number().positive().nullable().optional(),
  takeProfit: z.coerce.number().positive().nullable().optional(),
  quantity: z.coerce.number().positive().optional(),
  entryTime: z.coerce.date().optional(),
  exitTime: z.coerce.date().nullable().optional(),
  fees: z.coerce.number().min(0).optional(),
  commission: z.coerce.number().min(0).optional(),
  swap: z.coerce.number().optional(),
  riskAmount: z.coerce.number().min(0).nullable().optional(),
  riskPercent: z.coerce.number().min(0).max(100).nullable().optional(),
  plannedEntry: z.coerce.number().positive().nullable().optional(),
  plannedStop: z.coerce.number().positive().nullable().optional(),
  plannedTarget: z.coerce.number().positive().nullable().optional(),
  setup: z.string().max(200).nullable().optional(),
  strategyId: z.string().nullable().optional(),
  timeframe: z.string().max(10).nullable().optional(),
  marketConditions: z.string().max(500).nullable().optional(),
  thesis: z.string().max(2000).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  lessons: z.string().max(5000).nullable().optional(),
  emotion: z.string().max(100).nullable().optional(),
  disciplineRating: z.number().int().min(1).max(10).nullable().optional(),
  rulesFollowed: z.boolean().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
  accountId: z.string().nullable().optional(),
});

export const PATCH = withApi(async (req, ctx, user) => {
  const existing = await getOwnedTrade(ctx.params.id, user.id);
  const body = await parseBody(req, updateSchema);

  const merged = {
    direction: body.direction ?? existing.direction,
    status: body.status ?? existing.status,
    entryPrice: body.entryPrice ?? Number(existing.entryPrice),
    exitPrice: body.exitPrice !== undefined ? body.exitPrice : existing.exitPrice === null ? null : Number(existing.exitPrice),
    stopLoss: body.stopLoss !== undefined ? body.stopLoss : existing.stopLoss === null ? null : Number(existing.stopLoss),
    takeProfit: body.takeProfit !== undefined ? body.takeProfit : existing.takeProfit === null ? null : Number(existing.takeProfit),
    quantity: body.quantity ?? Number(existing.quantity),
    fees: body.fees ?? Number(existing.fees),
    commission: body.commission ?? Number(existing.commission),
    swap: body.swap ?? Number(existing.swap),
  };

  // imported trades are immutable except for notes/lessons (protects financial integrity)
  const isImported = existing.source === 'MT5_IMPORT';

  let grossPnl = existing.grossPnl === null ? null : Number(existing.grossPnl);
  let netPnl = existing.netPnl === null ? null : Number(existing.netPnl);
  if (!isImported && merged.status === 'CLOSED' && merged.exitPrice) {
    const pnl = computeTradePnl({
      direction: merged.direction,
      entryPrice: merged.entryPrice,
      exitPrice: merged.exitPrice,
      quantity: merged.quantity,
      contractSize: Number(existing.instrument?.contractSize ?? 1),
      fees: merged.fees,
      commission: merged.commission,
      swap: merged.swap,
    });
    grossPnl = pnl.grossPnl;
    netPnl = pnl.netPnl;
  }

  const rewardToRisk =
    merged.entryPrice && merged.stopLoss && merged.takeProfit
      ? computePlannedRR({ direction: merged.direction, entry: merged.entryPrice, stop: merged.stopLoss, target: merged.takeProfit })
      : null;

  const data: Record<string, unknown> = {
    grossPnl,
    netPnl,
    rewardToRisk,
    setup: body.setup,
    strategyId: body.strategyId,
    timeframe: body.timeframe,
    marketConditions: body.marketConditions,
    thesis: body.thesis,
    notes: body.notes,
    lessons: body.lessons,
    emotion: body.emotion,
    disciplineRating: body.disciplineRating,
    rulesFollowed: body.rulesFollowed,
    accountId: body.accountId,
    plannedEntry: body.plannedEntry,
    plannedStop: body.plannedStop,
    plannedTarget: body.plannedTarget,
    riskAmount: body.riskAmount,
    riskPercent: body.riskPercent,
  };
  if (!isImported) {
    Object.assign(data, {
      direction: merged.direction,
      status: merged.status,
      entryPrice: merged.entryPrice,
      exitPrice: merged.exitPrice,
      stopLoss: merged.stopLoss,
      takeProfit: merged.takeProfit,
      quantity: merged.quantity,
      entryTime: body.entryTime ?? existing.entryTime,
      exitTime: body.exitTime !== undefined ? body.exitTime : existing.exitTime,
      fees: merged.fees,
      commission: merged.commission,
      swap: merged.swap,
    });
  }
  if (body.tagIds) {
    const tags = await prisma.tag.findMany({ where: { id: { in: body.tagIds }, userId: user.id } });
    data.tags = { set: tags.map((t) => ({ id: t.id })) };
  }

  const trade = await prisma.trade.update({
    where: { id: existing.id },
    data,
    include: { instrument: true, strategy: true, tags: true, screenshots: true },
  });
  return json({ trade: serialize(trade as never) });
});

export const DELETE = withApi(async (_req, ctx, user) => {
  const existing = await getOwnedTrade(ctx.params.id, user.id);
  await prisma.trade.delete({ where: { id: existing.id } });
  return json({ deleted: true });
});
