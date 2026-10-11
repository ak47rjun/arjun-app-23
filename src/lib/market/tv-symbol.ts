/**
 * Map an ARJUN instrument symbol to a TradingView symbol.
 * Pure function — safe to import from BOTH server and client components
 * (unlike the widget module, which is 'use client').
 */
export function toTvSymbol(symbol: string, type?: string): string {
  const s = symbol.toUpperCase();
  if (type === 'forex' || /^[A-Z]{6}$/.test(s)) return `FX:${s}`;
  if (type === 'crypto' || ['BTCUSD', 'ETHUSD', 'SOLUSD'].includes(s)) {
    const base = s.replace(/USDT?$/, '');
    return `BINANCE:${base}USDT`;
  }
  if (type === 'index' || ['US500', 'NAS100', 'GER40', 'UK100', 'JPN225'].includes(s)) {
    const map: Record<string, string> = {
      US500: 'SP:SPX',
      NAS100: 'NASDAQ:NDX',
      GER40: 'XETR:DAX',
      UK100: 'TVC:UKX',
      JPN225: 'TVC:NI225',
    };
    return map[s] ?? `TVC:${s}`;
  }
  if (type === 'commodity' || ['XAUUSD', 'XAGUSD', 'USOIL'].includes(s)) {
    const map: Record<string, string> = {
      XAUUSD: 'OANDA:XAUUSD',
      XAGUSD: 'OANDA:XAGUSD',
      USOIL: 'TVC:USOIL',
    };
    return map[s] ?? `TVC:${s}`;
  }
  if (type === 'stock') return `NASDAQ:${s}`;
  return `FX:${s}`;
}
