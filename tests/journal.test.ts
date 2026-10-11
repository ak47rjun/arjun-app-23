/** Unit tests for the journal P&L math and analytics engine (pure functions). */
import { describe, expect, it } from 'vitest';
import { computeGrossPnl, computeNetPnl, computePlannedRR, computeTradePnl, directionSign, sessionOf } from '@/lib/journal/pnl';
import { computeStats, type ClosedTradeInput } from '@/lib/journal/stats';

describe('directionSign', () => {
  it('LONG is +1, SHORT is -1', () => {
    expect(directionSign('LONG')).toBe(1);
    expect(directionSign('SHORT')).toBe(-1);
  });
});

describe('computeGrossPnl', () => {
  it('computes a winning LONG with contract size', () => {
    // EURUSD: 1 lot = 100,000 units; +30 pips = 0.0030 → 0.0030 * 1 * 100000 = $300
    expect(computeGrossPnl({ direction: 'LONG', entryPrice: 1.1, exitPrice: 1.103, quantity: 1, contractSize: 100000 })).toBeCloseTo(300);
  });

  it('computes a losing SHORT (price rises against the position)', () => {
    // entry 1.10, exit 1.11: (1.10 - 1.11) * 1 * 100000 = -$1000
    expect(computeGrossPnl({ direction: 'SHORT', entryPrice: 1.1, exitPrice: 1.11, quantity: 1, contractSize: 100000 })).toBeCloseTo(-1000);
  });

  it('computes a winning SHORT (price falls)', () => {
    expect(computeGrossPnl({ direction: 'SHORT', entryPrice: 1.11, exitPrice: 1.1, quantity: 1, contractSize: 100000 })).toBeCloseTo(1000);
  });

  it('scales with quantity', () => {
    const one = computeGrossPnl({ direction: 'LONG', entryPrice: 100, exitPrice: 110, quantity: 1, contractSize: 1 });
    const two = computeGrossPnl({ direction: 'LONG', entryPrice: 100, exitPrice: 110, quantity: 2, contractSize: 1 });
    expect(one).toBe(10);
    expect(two).toBe(20);
  });

  it('returns 0 for non-positive quantity', () => {
    expect(computeGrossPnl({ direction: 'LONG', entryPrice: 1, exitPrice: 2, quantity: 0, contractSize: 1 })).toBe(0);
  });
});

describe('computeNetPnl', () => {
  it('subtracts fees, commission and swap', () => {
    expect(computeNetPnl(300, { fees: 2, commission: 5, swap: 1 })).toBe(292);
  });
});

describe('computeTradePnl', () => {
  it('combines gross and costs', () => {
    const { grossPnl, netPnl } = computeTradePnl({
      direction: 'LONG', entryPrice: 1.1, exitPrice: 1.103, quantity: 1, contractSize: 100000, fees: 7,
    });
    expect(grossPnl).toBeCloseTo(300);
    expect(netPnl).toBeCloseTo(293);
  });
});

describe('computePlannedRR', () => {
  it('computes reward/risk for a LONG', () => {
    // entry 100, stop 95 (risk 5), target 110 (reward 10) → 2R
    expect(computePlannedRR({ direction: 'LONG', entry: 100, stop: 95, target: 110 })).toBeCloseTo(2);
  });

  it('computes reward/risk for a SHORT', () => {
    // entry 100, stop 105 (risk 5), target 90 (reward 10) → 2R
    expect(computePlannedRR({ direction: 'SHORT', entry: 100, stop: 105, target: 90 })).toBeCloseTo(2);
  });

  it('returns null when risk is zero/negative', () => {
    expect(computePlannedRR({ direction: 'LONG', entry: 100, stop: 100, target: 110 })).toBeNull();
    expect(computePlannedRR({ direction: 'LONG', entry: 100, stop: 105, target: 110 })).toBeNull();
  });
});

describe('sessionOf', () => {
  it('buckets UTC hours', () => {
    expect(sessionOf(new Date('2026-01-01T03:00:00Z'))).toBe('ASIA');
    expect(sessionOf(new Date('2026-01-01T10:00:00Z'))).toBe('EUROPE');
    expect(sessionOf(new Date('2026-01-01T15:00:00Z'))).toBe('US');
    expect(sessionOf(new Date('2026-01-01T23:00:00Z'))).toBe('OFF_HOURS');
  });
});

function trade(partial: Partial<ClosedTradeInput> & { id: string; exitTime: Date }): ClosedTradeInput {
  return {
    direction: 'LONG',
    symbol: 'EURUSD',
    entryPrice: 1.1,
    exitPrice: 1.11,
    quantity: 1,
    contractSize: 100000,
    fees: 0,
    commission: 0,
    swap: 0,
    entryTime: partial.exitTime,
    strategyName: null,
    strategyId: null,
    ...partial,
  };
}

describe('computeStats', () => {
  const exit = (h: number) => new Date(Date.UTC(2026, 0, 5 + h)); // Jan 5.., 2026 UTC

  it('handles an empty journal', () => {
    const s = computeStats([]);
    expect(s.closedTrades).toBe(0);
    expect(s.winRate).toBe(0);
    expect(s.netPnl).toBe(0);
    expect(s.profitFactor).toBeNull();
    expect(s.equityCurve).toEqual([]);
  });

  it('computes win rate, profit factor and expectancy', () => {
    // 3 wins of +$1000 (10 pips), 1 loss of -$500 (5 pips), fees 0
    const trades = [
      trade({ id: '1', exitPrice: 1.11, exitTime: exit(1) }),   // +1000
      trade({ id: '2', exitPrice: 1.11, exitTime: exit(2) }),   // +1000
      trade({ id: '3', exitPrice: 1.11, exitTime: exit(3) }),   // +1000
      trade({ id: '4', direction: 'LONG', entryPrice: 1.1, exitPrice: 1.095, exitTime: exit(4) }), // -500
    ];
    const s = computeStats(trades);
    expect(s.closedTrades).toBe(4);
    expect(s.wins).toBe(3);
    expect(s.losses).toBe(1);
    expect(s.winRate).toBeCloseTo(0.75);
    expect(s.grossProfit).toBe(3000);
    expect(s.grossLoss).toBe(500);
    expect(s.profitFactor).toBe(6);
    expect(s.netPnl).toBe(2500);
    expect(s.expectancy).toBe(625);
    expect(s.avgWin).toBe(1000);
    expect(s.avgLoss).toBe(500);
  });

  it('computes max drawdown from the equity curve', () => {
    // +1000, -500, -500, +1000 → equity: 1000, 500, 0, 1000 → max DD = 1000 (from peak 1000 to 0)
    const trades = [
      trade({ id: '1', exitPrice: 1.11, exitTime: exit(1) }),
      trade({ id: '2', exitPrice: 1.095, exitTime: exit(2) }),
      trade({ id: '3', exitPrice: 1.095, exitTime: exit(3) }),
      trade({ id: '4', exitPrice: 1.11, exitTime: exit(4) }),
    ];
    const s = computeStats(trades);
    expect(s.maxDrawdown).toBeCloseTo(1000);
    const equities = s.equityCurve.map((p) => p.equity);
    expect(equities).toHaveLength(4);
    equities.forEach((eq, i) => expect(eq).toBeCloseTo([1000, 500, 0, 1000][i], 6));
  });

  it('computes streaks', () => {
    const trades = [
      trade({ id: '1', exitPrice: 1.11, exitTime: exit(1) }),
      trade({ id: '2', exitPrice: 1.11, exitTime: exit(2) }),
      trade({ id: '3', exitPrice: 1.095, exitTime: exit(3) }),
      trade({ id: '4', exitPrice: 1.095, exitTime: exit(4) }),
      trade({ id: '5', exitPrice: 1.095, exitTime: exit(5) }),
    ];
    const s = computeStats(trades);
    expect(s.longestWinStreak).toBe(2);
    expect(s.longestLossStreak).toBe(3);
  });

  it('deducts fees from net P&L', () => {
    const trades = [trade({ id: '1', exitPrice: 1.11, exitTime: exit(1), fees: 100 })];
    const s = computeStats(trades);
    expect(s.netPnl).toBe(900);
    expect(s.totalFees).toBe(100);
  });

  it('breaks down by strategy, instrument, session and direction', () => {
    const trades = [
      trade({ id: '1', exitPrice: 1.11, exitTime: exit(1), strategyName: 'Breakout' }),
      trade({ id: '2', exitPrice: 1.095, exitTime: exit(2), strategyName: 'Breakout', symbol: 'GBPUSD' }),
      trade({ id: '3', direction: 'SHORT', entryPrice: 1.3, exitPrice: 1.29, exitTime: exit(3), symbol: 'GBPUSD', strategyName: 'Trend' }),
    ];
    const s = computeStats(trades);
    expect(s.byStrategy.find((r) => r.key === 'Breakout')?.trades).toBe(2);
    expect(s.byInstrument.find((r) => r.key === 'GBPUSD')?.trades).toBe(2);
    expect(s.bySession.length).toBeGreaterThan(0);
    expect(s.long.trades).toBe(2);
    expect(s.short.trades).toBe(1);
    expect(s.monthly[0].month).toBe('2026-01');
  });
});
