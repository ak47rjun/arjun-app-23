/** Journal analytics — pure functions over closed trades. Unit tested in tests/journal.test.ts. */
import { computeNetPnl, sessionOf } from './pnl';

export interface ClosedTradeInput {
  id: string;
  direction: 'LONG' | 'SHORT';
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  contractSize: number;
  fees: number;
  commission: number;
  swap: number;
  entryTime: Date;
  exitTime: Date;
  strategyName?: string | null;
  strategyId?: string | null;
}

export interface EquityPoint {
  time: number; // unix ms
  equity: number; // cumulative net P&L
  tradePnl: number;
}

export interface BreakdownRow {
  key: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  profitFactor: number | null;
  avgWin: number;
  avgLoss: number;
}

export interface JournalStats {
  totalTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  avgWinLossRatio: number | null;
  largestWin: number;
  largestLoss: number;
  totalFees: number;
  netPnl: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  longestWinStreak: number;
  longestLossStreak: number;
  avgTradesPerDay: number;
  equityCurve: EquityPoint[];
  byStrategy: BreakdownRow[];
  byInstrument: BreakdownRow[];
  bySession: BreakdownRow[];
  byDayOfWeek: BreakdownRow[];
  long: { trades: number; winRate: number; netPnl: number };
  short: { trades: number; winRate: number; netPnl: number };
  monthly: { month: string; trades: number; netPnl: number; winRate: number }[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function breakdown(rows: { key: string; pnl: number }[]): BreakdownRow[] {
  const map = new Map<string, { trades: number; wins: number; losses: number; netPnl: number; winsAmt: number; lossesAmt: number }>();
  for (const r of rows) {
    const e = map.get(r.key) ?? { trades: 0, wins: 0, losses: 0, netPnl: 0, winsAmt: 0, lossesAmt: 0 };
    e.trades += 1;
    e.netPnl += r.pnl;
    if (r.pnl > 0) {
      e.wins += 1;
      e.winsAmt += r.pnl;
    } else if (r.pnl < 0) {
      e.losses += 1;
      e.lossesAmt += Math.abs(r.pnl);
    }
    map.set(r.key, e);
  }
  return [...map.entries()]
    .map(([key, e]) => ({
      key,
      trades: e.trades,
      wins: e.wins,
      losses: e.losses,
      winRate: e.trades ? e.wins / e.trades : 0,
      netPnl: round2(e.netPnl),
      profitFactor: e.lossesAmt > 0 ? round2(e.winsAmt / e.lossesAmt) : e.winsAmt > 0 ? null : null,
      avgWin: e.wins ? round2(e.winsAmt / e.wins) : 0,
      avgLoss: e.losses ? round2(e.lossesAmt / e.losses) : 0,
    }))
    .sort((a, b) => b.netPnl - a.netPnl);
}

export function computeStats(trades: ClosedTradeInput[]): JournalStats {
  const closed = trades
    .map((t) => ({
      ...t,
      netPnl: computeNetPnl(
        (t.exitPrice - t.entryPrice) * t.quantity * t.contractSize * (t.direction === 'LONG' ? 1 : -1),
        { fees: t.fees, commission: t.commission, swap: t.swap },
      ),
    }))
    .sort((a, b) => a.exitTime.getTime() - b.exitTime.getTime());

  const wins = closed.filter((t) => t.netPnl > 0);
  const losses = closed.filter((t) => t.netPnl < 0);
  const grossProfit = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const netPnl = grossProfit - grossLoss;

  // equity curve + drawdown
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  const equityCurve: EquityPoint[] = [];
  for (const t of closed) {
    equity += t.netPnl;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
    equityCurve.push({ time: t.exitTime.getTime(), equity: round2(equity), tradePnl: round2(t.netPnl) });
  }
  const maxDrawdownPercent = peak > 0 ? (maxDd / peak) * 100 : 0;

  // streaks
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let curWin = 0;
  let curLoss = 0;
  for (const t of closed) {
    if (t.netPnl > 0) {
      curWin += 1;
      curLoss = 0;
      longestWinStreak = Math.max(longestWinStreak, curWin);
    } else if (t.netPnl < 0) {
      curLoss += 1;
      curWin = 0;
      longestLossStreak = Math.max(longestLossStreak, curLoss);
    }
  }

  // trading days span
  const first = closed[0]?.entryTime.getTime();
  const last = closed[closed.length - 1]?.exitTime.getTime();
  const days = first && last ? Math.max(1, (last - first) / 86400000) : 0;

  // monthly
  const monthlyMap = new Map<string, { trades: number; netPnl: number; wins: number }>();
  for (const t of closed) {
    const key = t.exitTime.toISOString().slice(0, 7);
    const e = monthlyMap.get(key) ?? { trades: 0, netPnl: 0, wins: 0 };
    e.trades += 1;
    e.netPnl += t.netPnl;
    if (t.netPnl > 0) e.wins += 1;
    monthlyMap.set(key, e);
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const longs = closed.filter((t) => t.direction === 'LONG');
  const shorts = closed.filter((t) => t.direction === 'SHORT');
  const dirStats = (list: typeof closed) => ({
    trades: list.length,
    winRate: list.length ? list.filter((t) => t.netPnl > 0).length / list.length : 0,
    netPnl: round2(list.reduce((s, t) => s + t.netPnl, 0)),
  });

  return {
    totalTrades: trades.length,
    closedTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? wins.length / closed.length : 0,
    grossProfit: round2(grossProfit),
    grossLoss: round2(grossLoss),
    profitFactor: grossLoss > 0 ? round2(grossProfit / grossLoss) : wins.length > 0 ? null : null,
    expectancy: closed.length ? round2(netPnl / closed.length) : 0,
    avgWin: wins.length ? round2(grossProfit / wins.length) : 0,
    avgLoss: losses.length ? round2(grossLoss / losses.length) : 0,
    avgWinLossRatio: losses.length && grossLoss > 0 ? round2((grossProfit / wins.length || 0) / (grossLoss / losses.length)) : null,
    largestWin: wins.length ? round2(Math.max(...wins.map((t) => t.netPnl))) : 0,
    largestLoss: losses.length ? round2(Math.min(...losses.map((t) => t.netPnl))) : 0,
    totalFees: round2(closed.reduce((s, t) => s + t.fees + t.commission + t.swap, 0)),
    netPnl: round2(netPnl),
    maxDrawdown: round2(maxDd),
    maxDrawdownPercent: round2(maxDrawdownPercent),
    longestWinStreak,
    longestLossStreak,
    avgTradesPerDay: days ? round2(closed.length / days) : 0,
    equityCurve,
    byStrategy: breakdown(closed.map((t) => ({ key: t.strategyName || 'Untagged', pnl: t.netPnl }))),
    byInstrument: breakdown(closed.map((t) => ({ key: t.symbol, pnl: t.netPnl }))),
    bySession: breakdown(closed.map((t) => ({ key: sessionOf(t.entryTime), pnl: t.netPnl }))),
    byDayOfWeek: breakdown(closed.map((t) => ({ key: dayNames[t.entryTime.getUTCDay()], pnl: t.netPnl }))),
    long: dirStats(longs),
    short: dirStats(shorts),
    monthly: [...monthlyMap.entries()]
      .map(([month, e]) => ({ month, trades: e.trades, netPnl: round2(e.netPnl), winRate: e.trades ? e.wins / e.trades : 0 }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}
