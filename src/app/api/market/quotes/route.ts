import { getMarketProvider } from '@/lib/market/provider';
import { badRequest, json, publicApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** Live/delayed/demo quotes. Market data is public — rate-limited per IP. */
export const GET = publicApi(
  async (req) => {
    const symbolsParam = new URL(req.url).searchParams.get('symbols') ?? '';
    const symbols = symbolsParam
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 50);
    if (symbols.length === 0) throw badRequest('Provide ?symbols=EURUSD,BTCUSD,…');
    const provider = getMarketProvider();
    const quotes = await provider.getQuotes(symbols);
    return json({ quotes, status: provider.status() });
  },
  { rateLimit: { scope: 'market:quotes', key: '', limit: 60, windowSec: 60 } },
);
