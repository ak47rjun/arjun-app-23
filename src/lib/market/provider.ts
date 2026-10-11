/**
 * Market data provider abstraction.
 *
 * - `demo` (default): simulated random-walk prices, clearly labelled DEMO in the UI.
 * - `twelvedata` / `alphavantage`: real providers, enabled by API keys.
 *
 * The UI always shows the provider name and data mode — demo/delayed/live data
 * are never mixed without disclosure.
 */
import { env } from '../env';
import { prisma } from '../prisma';

export interface Quote {
  symbol: string;
  name?: string;
  last: number;
  bid: number;
  ask: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePercent: number;
  volume?: number;
  time: number; // unix seconds
}

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ProviderStatus {
  provider: string;
  mode: 'live' | 'delayed' | 'demo';
  label: string;
  configured: boolean;
}

export interface MarketProvider {
  status(): ProviderStatus;
  getQuotes(symbols: string[]): Promise<Quote[]>;
  getCandles(symbol: string, timeframeSec: number, limit: number): Promise<Candle[]>;
}

// ─────────────────────────── Demo provider ───────────────────────────
// Deterministic per (symbol, time-bucket) so server + clients agree and
// repeated calls within a bucket return the same price.

const BASE_PRICES: Record<string, number> = {
  EURUSD: 1.0842, GBPUSD: 1.2718, USDJPY: 149.42, AUDUSD: 0.6612, USDCAD: 1.3586, USDCHF: 0.8842,
  US500: 5972.4, NAS100: 21045.2, GER40: 19842.5, UK100: 8245.1, JPN225: 39250,
  XAUUSD: 2652.3, XAGUSD: 31.42, USOIL: 71.84,
  BTCUSD: 97240, ETHUSD: 3412.5, SOLUSD: 214.8,
  AAPL: 229.87, TSLA: 412.5, NVDA: 138.25, MSFT: 428.9,
};

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seeded PRNG (mulberry32) — deterministic "market". */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function demoPrice(symbol: string, atBucket: number): { last: number; open: number; high: number; low: number } {
  const base = BASE_PRICES[symbol] ?? 100;
  const digits = symbol.length <= 6 && !/USD|JPY|EUR|GBP/.test(symbol) ? 2 : 4;
  const rand = prng(hashSeed(`${symbol}:${atBucket}`));
  const drift = (rand() - 0.5) * 0.004; // ±0.2% per 5s bucket
  const open = base * (1 + drift);
  let price = open;
  let high = open;
  let low = open;
  for (let i = 0; i < 12; i++) {
    price = price * (1 + (rand() - 0.5) * 0.001);
    high = Math.max(high, price);
    low = Math.min(low, price);
  }
  const round = (n: number) => Number(n.toFixed(digits));
  return { last: round(price), open: round(open), high: round(high), low: round(low) };
}

const demoProvider: MarketProvider = {
  status() {
    return {
      provider: 'demo',
      mode: 'demo',
      label: 'Simulated demo data — not real market prices',
      configured: true,
    };
  },
  async getQuotes(symbols) {
    const bucket = Math.floor(Date.now() / 5000);
    const instruments = await prisma.instrument.findMany({ where: { symbol: { in: symbols } } });
    const bySymbol = new Map(instruments.map((i) => [i.symbol, i]));
    return symbols.map((symbol) => {
      const inst = bySymbol.get(symbol);
      const { last, open, high, low } = demoPrice(symbol, bucket);
      const spread = Math.max(last * 0.00015, Number((10 ** -inst?.digits! || 2).toPrecision(1)));
      return {
        symbol,
        name: inst?.name,
        last,
        bid: Number((last - spread / 2).toFixed(inst?.digits ?? 5)),
        ask: Number((last + spread / 2).toFixed(inst?.digits ?? 5)),
        open, high, low,
        change: Number((last - open).toFixed(inst?.digits ?? 5)),
        changePercent: Number(((last - open) / open) * 100 || 0),
        volume: Math.round(1000 + hashSeed(symbol + bucket) % 90000),
        time: bucket * 5,
      };
    });
  },
  async getCandles(symbol, timeframeSec, limit) {
    const now = Math.floor(Date.now() / 1000);
    const end = Math.floor(now / timeframeSec) * timeframeSec;
    const candles: Candle[] = [];
    const digits = BASE_PRICES[symbol] !== undefined && BASE_PRICES[symbol] < 5 ? 5 : 2;
    for (let i = limit - 1; i >= 0; i--) {
      const t = end - i * timeframeSec;
      const bucket = Math.floor(t / 5);
      const { last, open, high, low } = demoPrice(symbol, bucket + i * 7919);
      candles.push({
        time: t,
        open: Number(open.toFixed(digits)),
        high: Number(Math.max(high, last, open).toFixed(digits)),
        low: Number(Math.min(low, last, open).toFixed(digits)),
        close: Number(last.toFixed(digits)),
        volume: Math.round(500 + hashSeed(`${symbol}:${t}`) % 5000),
      });
    }
    return candles;
  },
};

// ─────────────────────────── Twelve Data ───────────────────────────

const twelveDataProvider: MarketProvider = {
  status() {
    return {
      provider: 'twelvedata',
      mode: env.TWELVE_DATA_API_KEY ? 'live' : 'demo',
      label: env.TWELVE_DATA_API_KEY ? 'Twelve Data (live/delayed per plan)' : 'Twelve Data (API key missing)',
      configured: Boolean(env.TWELVE_DATA_API_KEY),
    };
  },
  async getQuotes(symbols) {
    if (!env.TWELVE_DATA_API_KEY) return demoProvider.getQuotes(symbols);
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols.join(','))}&apikey=${env.TWELVE_DATA_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Twelve Data error ${res.status}`);
    const data = await res.json();
    const items = symbols.length === 1 && data.symbol ? [data] : Object.values(data);
    return items.map((q: any) => ({
      symbol: q.symbol,
      name: q.name,
      last: Number(q.close ?? q.price),
      bid: Number(q.bid ?? q.close ?? q.price),
      ask: Number(q.ask ?? q.close ?? q.price),
      open: Number(q.open ?? q.close ?? q.price),
      high: Number(q.high ?? q.close ?? q.price),
      low: Number(q.low ?? q.close ?? q.price),
      change: Number(q.change ?? 0),
      changePercent: Number(q.percent_change ?? 0),
      volume: q.volume ? Number(q.volume) : undefined,
      time: q.timestamp ? Number(q.timestamp) : Math.floor(Date.now() / 1000),
    }));
  },
  async getCandles(symbol, timeframeSec, limit) {
    if (!env.TWELVE_DATA_API_KEY) return demoProvider.getCandles(symbol, timeframeSec, limit);
    const interval = timeframeSec < 3600 ? `${timeframeSec / 60}min` : timeframeSec < 86400 ? `${timeframeSec / 3600}h` : '1day';
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${limit}&apikey=${env.TWELVE_DATA_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Twelve Data error ${res.status}`);
    const data = await res.json();
    return (data.values ?? [])
      .map((c: any) => ({
        time: Math.floor(new Date(c.datetime.replace(' ', 'T') + 'Z').getTime() / 1000),
        open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close),
        volume: c.volume ? Number(c.volume) : undefined,
      }))
      .reverse();
  },
};

// ─────────────────────────── Alpha Vantage ───────────────────────────

const alphaVantageProvider: MarketProvider = {
  status() {
    return {
      provider: 'alphavantage',
      mode: env.ALPHA_VANTAGE_API_KEY ? 'delayed' : 'demo',
      label: env.ALPHA_VANTAGE_API_KEY ? 'Alpha Vantage (delayed 15m on free tier)' : 'Alpha Vantage (API key missing)',
      configured: Boolean(env.ALPHA_VANTAGE_API_KEY),
    };
  },
  async getQuotes(symbols) {
    if (!env.ALPHA_VANTAGE_API_KEY) return demoProvider.getQuotes(symbols);
    const quotes = await Promise.all(
      symbols.map(async (symbol) => {
        const isFx = /^[A-Z]{6}$/.test(symbol);
        const fn = isFx ? 'CURRENCY_EXCHANGE_RATE' : 'GLOBAL_QUOTE';
        const params = isFx
          ? `from_currency=${symbol.slice(0, 3)}&to_currency=${symbol.slice(3)}`
          : `symbol=${encodeURIComponent(symbol)}`;
        const res = await fetch(`https://www.alphavantage.co/query?function=${fn}&${params}&apikey=${env.ALPHA_VANTAGE_API_KEY}`);
        const data = await res.json();
        if (isFx) {
          const rate = data['Realtime Currency Exchange Rate'];
          const last = Number(rate?.['5. Exchange Rate'] ?? 0);
          return { symbol, last, bid: last, ask: last, open: last, high: last, low: last, change: 0, changePercent: 0, time: Math.floor(Date.now() / 1000) };
        }
        const q = data['Global Quote'];
        const last = Number(q?.['05. price'] ?? 0);
        return {
          symbol, last,
          bid: last, ask: last,
          open: Number(q?.['02. open'] ?? last),
          high: Number(q?.['03. high'] ?? last),
          low: Number(q?.['04. low'] ?? last),
          change: Number(q?.['09. change'] ?? 0),
          changePercent: Number((q?.['10. change percent'] ?? '0').replace('%', '')),
          volume: q?.['06. volume'] ? Number(q['06. volume']) : undefined,
          time: Math.floor(Date.now() / 1000),
        };
      }),
    );
    return quotes;
  },
  async getCandles(symbol, timeframeSec, limit) {
    if (!env.ALPHA_VANTAGE_API_KEY) return demoProvider.getCandles(symbol, timeframeSec, limit);
    const isFx = /^[A-Z]{6}$/.test(symbol);
    const interval = timeframeSec < 3600 ? '1min' : timeframeSec < 14400 ? '5min' : timeframeSec < 86400 ? '60min' : '1day';
    const from = isFx ? symbol.slice(0, 3) : undefined;
    const to = isFx ? symbol.slice(3) : undefined;
    const params = isFx
      ? `function=FX_INTRADAY&from_symbol=${from}&to_symbol=${to}&interval=${interval}&outputsize=${Math.min(limit, 100)}&apikey=${env.ALPHA_VANTAGE_API_KEY}`
      : `function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${Math.min(limit, 100)}&apikey=${env.ALPHA_VANTAGE_API_KEY}`;
    const res = await fetch(`https://www.alphavantage.co/query?${params}`);
    const data = await res.json();
    const seriesKey = Object.keys(data).find((k) => k.includes('Time Series'));
    if (!seriesKey) return demoProvider.getCandles(symbol, timeframeSec, limit);
    const series = data[seriesKey];
    return Object.entries(series)
      .slice(0, limit)
      .map(([datetime, v]: [string, any]) => ({
        time: Math.floor(new Date(datetime.replace(' ', 'T') + 'Z').getTime() / 1000),
        open: Number(v['1. open']), high: Number(v['2. high']), low: Number(v['3. low']), close: Number(v['4. close']),
      }))
      .reverse();
  },
};

let provider: MarketProvider | null = null;

export function getMarketProvider(): MarketProvider {
  if (provider) return provider;
  switch (env.MARKET_DATA_PROVIDER) {
    case 'twelvedata':
      provider = twelveDataProvider;
      break;
    case 'alphavantage':
      provider = alphaVantageProvider;
      break;
    default:
      provider = demoProvider;
  }
  return provider;
}

/** Search instruments from the database (fast, provider-independent). */
export async function searchInstruments(query: string, limit = 20) {
  const q = query.trim();
  if (!q) return [];
  return prisma.instrument.findMany({
    where: {
      isActive: true,
      OR: [{ symbol: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }],
    },
    take: limit,
    orderBy: { symbol: 'asc' },
  });
}
