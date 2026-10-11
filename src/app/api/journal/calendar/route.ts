import { prisma } from '@/lib/prisma';
import { json, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** Per-day aggregated P&L for the journal calendar heatmap. */
export const GET = withApi(async (req, _ctx, user) => {
  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? new Date(Date.now() - 365 * 86400000).toISOString();
  const to = url.searchParams.get('to') ?? new Date().toISOString();

  const trades = await prisma.trade.findMany({
    where: {
      userId: user.id,
      status: 'CLOSED',
      exitTime: { gte: new Date(from), lte: new Date(to) },
    },
    select: { exitTime: true, netPnl: true },
  });

  const byDay = new Map<string, { pnl: number; trades: number; wins: number }>();
  for (const t of trades) {
    if (!t.exitTime) continue;
    const day = t.exitTime.toISOString().slice(0, 10);
    const e = byDay.get(day) ?? { pnl: 0, trades: 0, wins: 0 };
    const pnl = Number(t.netPnl ?? 0);
    e.pnl += pnl;
    e.trades += 1;
    if (pnl > 0) e.wins += 1;
    byDay.set(day, e);
  }

  return json({
    days: [...byDay.entries()].map(([date, v]) => ({ date, pnl: v.pnl, trades: v.trades, wins: v.wins })),
  });
});
