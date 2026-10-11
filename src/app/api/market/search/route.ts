import { searchInstruments } from '@/lib/market/provider';
import { json, publicApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

export const GET = publicApi(
  async (req) => {
    const q = new URL(req.url).searchParams.get('q') ?? '';
    const instruments = await searchInstruments(q, 20);
    return json({
      instruments: instruments.map((i) => ({
        id: i.id,
        symbol: i.symbol,
        name: i.name,
        type: i.type,
        currency: i.currency,
        digits: i.digits,
      })),
    });
  },
  { rateLimit: { scope: 'market:search', key: '', limit: 60, windowSec: 60 } },
);
