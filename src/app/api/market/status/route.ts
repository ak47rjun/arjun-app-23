import { getMarketProvider } from '@/lib/market/provider';
import { json, publicApi } from '@/lib/api';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** Market data provider status — the UI uses this to label demo/delayed/live data. */
export const GET = publicApi(async () => {
  const provider = getMarketProvider();
  return json({ status: provider.status() });
});
