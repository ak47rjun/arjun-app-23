import { prisma } from '@/lib/prisma';
import { badRequest, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** Export the user's journal as CSV or JSON. */
export const GET = withApi(async (req, _ctx, user) => {
  const format = new URL(req.url).searchParams.get('format') ?? 'csv';
  const trades = await prisma.trade.findMany({
    where: { userId: user.id },
    include: { strategy: true, tags: true, instrument: true },
    orderBy: { entryTime: 'asc' },
  });

  if (format === 'json') {
    return new Response(JSON.stringify({ trades }, null, 2), {
      headers: {
        'content-type': 'application/json',
        'content-disposition': `attachment; filename="arjun-journal-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  }

  if (format !== 'csv') throw badRequest('format must be csv or json');

  const header = [
    'id', 'symbol', 'direction', 'status', 'entryPrice', 'exitPrice', 'stopLoss', 'takeProfit', 'quantity',
    'entryTime', 'exitTime', 'fees', 'commission', 'swap', 'grossPnl', 'netPnl', 'strategy', 'setup',
    'timeframe', 'tags', 'thesis', 'notes', 'lessons', 'emotion', 'disciplineRating', 'rulesFollowed', 'source',
  ];
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = trades.map((t) =>
    [
      t.id, t.symbol, t.direction, t.status, t.entryPrice.toString(), t.exitPrice?.toString() ?? '', t.stopLoss?.toString() ?? '',
      t.takeProfit?.toString() ?? '', t.quantity.toString(), t.entryTime.toISOString(), t.exitTime?.toISOString() ?? '',
      t.fees.toString(), t.commission.toString(), t.swap.toString(), t.grossPnl?.toString() ?? '', t.netPnl?.toString() ?? '',
      t.strategy?.name ?? '', t.setup ?? '', t.timeframe ?? '', t.tags.map((tg) => tg.name).join('|'),
      t.thesis ?? '', t.notes ?? '', t.lessons ?? '', t.emotion ?? '', t.disciplineRating ?? '', t.rulesFollowed ?? '', t.source,
    ]
      .map(escape)
      .join(','),
  );

  return new Response([header.join(','), ...rows].join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="arjun-journal-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
