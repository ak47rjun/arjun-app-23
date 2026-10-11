import { prisma } from '@/lib/prisma';
import { json, withApi } from '@/lib/api';
import { computeStats } from '@/lib/journal/stats';
import { getUnreadCount } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** Dashboard aggregate — every figure comes from real stored records. */
export const GET = withApi(async (_req, _ctx, user) => {
  const uid = user.id;
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfWeek = new Date(startOfDay.getTime() - now.getUTCDay() * 86400000);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const [
    accounts,
    openTrades,
    closedTrades,
    recentTrades,
    recentMessages,
    upcomingMeetings,
    unreadNotifications,
    watchlist,
    strategies,
  ] = await Promise.all([
    prisma.tradingAccount.findMany({ where: { userId: uid } }),
    prisma.trade.findMany({ where: { userId: uid, status: 'OPEN' }, orderBy: { entryTime: 'desc' }, take: 20 }),
    prisma.trade.findMany({
      where: { userId: uid, status: 'CLOSED', exitTime: { not: null } },
      include: { instrument: true, strategy: true },
    }),
    prisma.trade.findMany({
      where: { userId: uid },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { instrument: true, strategy: true },
    }),
    prisma.message.findMany({
      where: { conversation: { members: { some: { userId: uid } } }, senderId: { not: uid }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        sender: { select: { id: true, displayName: true, avatarUrl: true } },
        conversation: { select: { id: true, name: true, type: true } },
      },
    }),
    prisma.meeting.findMany({
      where: {
        AND: [
          { OR: [{ hostId: uid }, { participants: { some: { userId: uid } } }] },
          { status: { in: ['SCHEDULED', 'LIVE'] } },
          { OR: [{ scheduledAt: { gte: now } }, { scheduledAt: null }] },
        ],
      },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
    }),
    getUnreadCount(uid),
    prisma.watchlist.findFirst({
      where: { userId: uid, isDefault: true },
      include: { items: { include: { instrument: true }, orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.strategy.findMany({ where: { userId: uid }, orderBy: { name: 'asc' } }),
  ]);

  const stats = computeStats(
    closedTrades.map((t) => ({
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

  const pnlSince = (since: Date) =>
    closedTrades
      .filter((t) => t.exitTime && t.exitTime >= since)
      .reduce((s, t) => s + Number(t.netPnl ?? 0), 0);

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);
  const totalEquity = accounts.reduce((s, a) => s + Number(a.equity), 0);
  const unrealized = openTrades.length
    ? null // requires live prices per symbol — shown on the terminal instead
    : 0;

  const hasAnyData = accounts.length > 0 || closedTrades.length > 0;

  return json({
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      broker: a.broker,
      currency: a.currency,
      balance: Number(a.balance),
      equity: Number(a.equity),
      margin: Number(a.margin),
      freeMargin: Number(a.freeMargin),
      status: a.status,
      lastSyncAt: a.lastSyncAt,
    })),
    totals: {
      balance: totalBalance,
      equity: totalEquity,
      currency: accounts[0]?.currency ?? 'USD',
      openTrades: openTrades.length,
      unrealizedPnl: unrealized,
    },
    performance: {
      today: pnlSince(startOfDay),
      week: pnlSince(startOfWeek),
      month: pnlSince(startOfMonth),
      year: pnlSince(startOfYear),
      allTime: stats.netPnl,
    },
    stats: {
      winRate: stats.winRate,
      profitFactor: stats.profitFactor,
      expectancy: stats.expectancy,
      maxDrawdown: stats.maxDrawdown,
      totalTrades: stats.closedTrades,
      wins: stats.wins,
      losses: stats.losses,
    },
    equityCurve: stats.equityCurve.slice(-90),
    recentTrades: recentTrades.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      direction: t.direction,
      status: t.status,
      netPnl: t.netPnl === null ? null : Number(t.netPnl),
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      strategy: t.strategy?.name ?? null,
      source: t.source,
    })),
    openTrades: openTrades.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      direction: t.direction,
      entryPrice: Number(t.entryPrice),
      quantity: Number(t.quantity),
      entryTime: t.entryTime,
      stopLoss: t.stopLoss === null ? null : Number(t.stopLoss),
      takeProfit: t.takeProfit === null ? null : Number(t.takeProfit),
    })),
    recentMessages: recentMessages.map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      conversationId: m.conversationId,
      conversationName: m.conversation.name,
      sender: m.sender,
    })),
    upcomingMeetings: upcomingMeetings.map((m) => ({
      id: m.id,
      title: m.title,
      roomName: m.roomName,
      scheduledAt: m.scheduledAt,
      status: m.status,
      isHost: m.hostId === uid,
    })),
    unreadNotifications,
    watchlist: watchlist
      ? watchlist.items.map((i) => ({
          id: i.id,
          symbol: i.instrument.symbol,
          name: i.instrument.name,
          alertEnabled: i.alertEnabled,
        }))
      : [],
    strategies: strategies.map((s) => ({ id: s.id, name: s.name })),
    hasAnyData,
  });
});
