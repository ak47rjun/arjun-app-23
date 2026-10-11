import { getMarketProvider } from '@/lib/market/provider';
import { badRequest, json, publicApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

const TF_SECONDS: Record<string, number> = {
  '1': 60, '5': 300, '15': 900, '30': 1800, '60': 3600, '240': 14400, 'D': 86400, 'W': 604800, 'M': 2592000,
};

export const GET = publicApi(
  async (req) => {
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol')?.toUpperCase() ?? '';
    const tf = url.searchParams.get('timeframe') ?? '60';
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 200), 1000);
    const tfSec = TF_SECONDS[tf];
    if (!symbol) throw badRequest('Missing symbol');
    if (!tfSec) throw badRequest('Unsupported timeframe');
    const provider = getMarketProvider();
    const candles = await provider.getCandles(symbol, tfSec, limit);
    return json({ symbol, timeframe: tf, candles, status: provider.status() });
  },
  { rateLimit: { scope: 'market:candles', key: '', limit: 60, windowSec: 60 } },
);
