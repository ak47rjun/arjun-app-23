import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { computeTradePnl, computePlannedRR } from '@/lib/journal/pnl';
import { badRequest, json, parseBody, withApi } from '@/lib/api';
import type { TradeDirection, TradeStatus } from '@prisma/client';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const tradeSchema = z.object({
  symbol: z.string().min(1).max(20),
  direction: z.enum(['LONG', 'SHORT']),
  status: z.enum(['OPEN', 'CLOSED']).default('OPEN'),
  entryPrice: z.coerce.number().positive(),
  exitPrice: z.coerce.number().positive().optional(),
  stopLoss: z.coerce.number().positive().optional(),
  takeProfit: z.coerce.number().positive().optional(),
  quantity: z.coerce.number().positive(),
  entryTime: z.coerce.date(),
  exitTime: z.coerce.date().optional(),
  fees: z.coerce.number().min(0).default(0),
  commission: z.coerce.number().min(0).default(0),
  swap: z.coerce.number().default(0),
  riskAmount: z.coerce.number().min(0).optional(),
  riskPercent: z.coerce.number().min(0).max(100).optional(),
  plannedEntry: z.coerce.number().positive().optional(),
  plannedStop: z.coerce.number().positive().optional(),
  plannedTarget: z.coerce.number().positive().optional(),
  setup: z.string().max(200).optional(),
  strategyId: z.string().optional(),
  timeframe: z.string().max(10).optional(),
  marketConditions: z.string().max(500).optional(),
  thesis: z.string().max(2000).optional(),
  notes: z.string().max(5000).optional(),
  lessons: z.string().max(5000).optional(),
  emotion: z.string().max(100).optional(),
  disciplineRating: z.number().int().min(1).max(10).optional(),
  rulesFollowed: z.boolean().optional(),
  tagIds: z.array(z.string()).default([]),
  accountId: z.string().optional(),
});

export const GET = withApi(async (req, _ctx, user) => {
  const url = new URL(req.url);
  const status = url.searchParams.get('status') as TradeStatus | null;
  const symbol = url.searchParams.get('symbol') ?? undefined;
  const strategyId = url.searchParams.get('strategyId') ?? undefined;
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
  const cursor = url.searchParams.get('cursor');

  const trades = await prisma.trade.findMany({
    where: {
      userId: user.id,
      ...(status ? { status } : {}),
      ...(symbol ? { symbol: symbol.toUpperCase() } : {}),
      ...(strategyId ? { strategyId } : {}),
      ...(from || to
        ? { entryTime: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { entryTime: 'desc' },
    take: limit,
    include: {
      instrument: true,
      strategy: true,
      tags: true,
      screenshots: true,
      account: { select: { id: true, name: true, broker: true } },
      _count: true,
    },
  });

  return json({
    trades: trades.map((t) => ({
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
      contractSize: Number(t.instrument?.contractSize ?? 1),
    })),
    nextCursor: trades.length === limit ? trades[trades.length - 1].createdAt.toISOString() : null,
  });
});

export const POST = withApi(async (req, _ctx, user) => {
  const body = await parseBody(req, tradeSchema);
  if (body.status === 'CLOSED' && !body.exitPrice) throw badRequest('exitPrice is required for closed trades');
  if (body.status === 'CLOSED' && !body.exitTime) body.exitTime = new Date();

  const instrument = await prisma.instrument.findUnique({ where: { symbol: body.symbol.toUpperCase() } });
  const contractSize = Number(instrument?.contractSize ?? 1);

  let grossPnl: number | null = null;
  let netPnl: number | null = null;
  if (body.status === 'CLOSED' && body.exitPrice) {
    const pnl = computeTradePnl({
      direction: body.direction,
      entryPrice: body.entryPrice,
      exitPrice: body.exitPrice,
      quantity: body.quantity,
      contractSize,
      fees: body.fees,
      commission: body.commission,
      swap: body.swap,
    });
    grossPnl = pnl.grossPnl;
    netPnl = pnl.netPnl;
  }

  const rewardToRisk =
    body.entryPrice && body.stopLoss && body.takeProfit
      ? computePlannedRR({ direction: body.direction, entry: body.entryPrice, stop: body.stopLoss, target: body.takeProfit })
      : null;

  // verify referenced entities belong to the user
  if (body.strategyId) {
    const strategy = await prisma.strategy.findFirst({ where: { id: body.strategyId, userId: user.id } });
    if (!strategy) throw badRequest('Strategy not found');
  }
  if (body.accountId) {
    const account = await prisma.tradingAccount.findFirst({ where: { id: body.accountId, userId: user.id } });
    if (!account) throw badRequest('Trading account not found');
  }
  if (body.tagIds.length > 0) {
    const tags = await prisma.tag.findMany({ where: { id: { in: body.tagIds }, userId: user.id } });
    if (tags.length !== body.tagIds.length) throw badRequest('One or more tags not found');
  }

  const trade = await prisma.trade.create({
    data: {
      userId: user.id,
      instrumentId: instrument?.id,
      symbol: body.symbol.toUpperCase(),
      direction: body.direction as TradeDirection,
      status: body.status,
      entryPrice: body.entryPrice,
      exitPrice: body.exitPrice,
      stopLoss: body.stopLoss,
      takeProfit: body.takeProfit,
      quantity: body.quantity,
      entryTime: body.entryTime,
      exitTime: body.exitTime,
      fees: body.fees,
      commission: body.commission,
      swap: body.swap,
      grossPnl,
      netPnl,
      riskAmount: body.riskAmount,
      riskPercent: body.riskPercent,
      rewardToRisk,
      plannedEntry: body.plannedEntry,
      plannedStop: body.plannedStop,
      plannedTarget: body.plannedTarget,
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
      source: 'MANUAL',
      tags: { connect: body.tagIds.map((id) => ({ id })) },
    },
    include: { instrument: true, strategy: true, tags: true, screenshots: true },
  });

  return json({ trade: { ...trade, contractSize } }, 201);
});
