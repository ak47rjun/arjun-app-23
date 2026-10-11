/**
 * Pure P&L math for the trading journal. All money math uses numbers converted
 * from Prisma Decimals at the service boundary; calculations here are exact
 * for the inputs given (contract specifications, fees, swaps included).
 */
import type { TradeDirection } from '@prisma/client';

export interface PnlInput {
  direction: TradeDirection;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  contractSize: number;
  fees?: number;
  commission?: number;
  swap?: number;
}

export function directionSign(direction: TradeDirection): 1 | -1 {
  return direction === 'LONG' ? 1 : -1;
}

export function computeGrossPnl(input: PnlInput): number {
  const { direction, entryPrice, exitPrice, quantity, contractSize } = input;
  if (quantity <= 0 || contractSize <= 0) return 0;
  return (exitPrice - entryPrice) * quantity * contractSize * directionSign(direction);
}

export function computeNetPnl(gross: number, costs: { fees?: number; commission?: number; swap?: number } = {}): number {
  return gross - (costs.fees ?? 0) - (costs.commission ?? 0) - (costs.swap ?? 0);
}

export function computeTradePnl(input: PnlInput): { grossPnl: number; netPnl: number } {
  const grossPnl = computeGrossPnl(input);
  const netPnl = computeNetPnl(grossPnl, input);
  return { grossPnl, netPnl };
}

/** Realized R:R from planned levels (independent of outcome). */
export function computePlannedRR(input: { direction: TradeDirection; entry: number; stop: number; target: number }): number | null {
  const { direction, entry, stop, target } = input;
  const sign = directionSign(direction);
  const risk = (entry - stop) * sign;
  const reward = (target - entry) * sign;
  if (risk <= 0) return null;
  return reward / risk;
}

/** Session bucket (UTC) used for session-based analytics. */
export function sessionOf(date: Date): 'ASIA' | 'EUROPE' | 'US' | 'OFF_HOURS' {
  const h = date.getUTCHours();
  if (h >= 0 && h < 8) return 'ASIA';
  if (h >= 8 && h < 13) return 'EUROPE';
  if (h >= 13 && h < 21) return 'US';
  return 'OFF_HOURS';
}
