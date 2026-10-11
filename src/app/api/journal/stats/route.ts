import { prisma } from '@/lib/prisma';
import { computeStats } from '@/lib/journal/stats';
import { json, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** Full journal analytics, computed from the user's real closed trades. */
export const GET = withApi(async (req, _ctx, user) => {
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const trades = await prisma.trade.findMany({
    where: {
      userId: user.id,
      status: 'CLOSED',
      exitTime: { not: null },
      ...(from || to
        ? { exitTime: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
    },
    include: { instrument: true, strategy: true },
    orderBy: { exitTime: 'asc' },
  });

  const stats = computeStats(
    trades.map((t) => ({
      id: t.id,
      direction: t.direction,
      symbol: t.symbol,
      entryPrice: Number(t.entryPrice),
      exitPrice: Number(t.exitPrice ?? 0),
      quantity: Number(t.quantity),
      contractSize: Number(t.instrument?.contractSize ?? 1),
      fees: Number(t.fees),
      commission: Number(t.commission),
      swap: Number(t.swap),
      entryTime: t.entryTime,
      exitTime: t.exitTime ?? t.updatedAt,
      strategyName: t.strategy?.name ?? null,
      strategyId: t.strategyId,
    })),
  );

  return json({ stats });
});
