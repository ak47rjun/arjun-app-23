import { z } from 'zod';
import { json, withApi } from '@/lib/api';
import { getCalendarEvents } from '@/lib/market/calendar';

export const dynamic = 'force-dynamic'; // reads the live feed — never prerender

const querySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
  currency: z.string().min(2).max(8).optional(),
  impact: z.enum(['High', 'Medium', 'Low', 'Holiday']).optional(),
});

/** Economic calendar for a day (live ForexFactory feed, labeled demo fallback). */
export const GET = withApi(
  async (req, _ctx, _user) => {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      date: url.searchParams.get('date') ?? undefined,
      currency: url.searchParams.get('currency') ?? undefined,
      impact: url.searchParams.get('impact') ?? undefined,
    });
    if (!parsed.success) {
      return json({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message ?? 'Invalid query' }, 400);
    }
    const result = await getCalendarEvents(parsed.data);
    return json(result);
  },
  { rateLimit: { scope: 'calendar', key: '', limit: 30, windowSec: 60 } },
);
