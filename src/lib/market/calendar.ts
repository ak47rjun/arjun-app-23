/**
 * Economic calendar provider.
 *
 * Primary source: the ForexFactory free public feed (ff_calendar_thisweek.json)
 * — a widely used third-party JSON feed covering the current week. Responses
 * are cached (Redis, 15 min) and every response carries an explicit `source`
 * label plus a disclaimer. If the feed is unreachable, the provider returns a
 * clearly-labeled DEMO dataset — the app never pretends demo data is live.
 */
import { redisGet, redisSet } from '../redis';

export type CalendarImpact = 'High' | 'Medium' | 'Low' | 'Holiday';
export type CalendarSource = 'forexfactory' | 'demo';

export interface CalendarEvent {
  id: string;
  title: string;
  currency: string;
  impact: CalendarImpact;
  /** ISO-8601 UTC timestamp */
  date: string;
  forecast: string;
  previous: string;
  actual: string;
  source: CalendarSource;
}

export const CALENDAR_DISCLAIMER =
  'Calendar data: ForexFactory free third-party feed (nfs.faireconomy.media). Times are shown in your local timezone. Market-moving news can be revised — verify before trading. Not financial advice.';

const FF_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const CACHE_KEY = 'arjun:calendar:ff-thisweek';
const CACHE_TTL_SEC = 900; // 15 minutes

const IMPACTS: CalendarImpact[] = ['High', 'Medium', 'Low', 'Holiday'];

/** Normalize the raw ForexFactory payload into our event shape. Pure + total. */
export function normalizeForexFactory(raw: unknown): CalendarEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: CalendarEvent[] = [];
  let i = 0;
  for (const item of raw) {
    i += 1;
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const title = typeof r.title === 'string' ? r.title.trim() : '';
    const currency = typeof r.country === 'string' ? r.country.trim().toUpperCase() : '';
    const rawDate = typeof r.date === 'string' ? r.date : '';
    const time = Date.parse(rawDate);
    if (!title || !currency || Number.isNaN(time)) continue;
    const impactRaw = typeof r.impact === 'string' ? r.impact.trim() : '';
    const impact: CalendarImpact = (IMPACTS as string[]).includes(impactRaw) ? (impactRaw as CalendarImpact) : 'Low';
    events.push({
      id: `ff-${i}`,
      title,
      currency,
      impact,
      date: new Date(time).toISOString(),
      forecast: typeof r.forecast === 'string' ? r.forecast.trim() : '',
      previous: typeof r.previous === 'string' ? r.previous.trim() : '',
      actual: typeof r.actual === 'string' ? r.actual.trim() : '',
      source: 'forexfactory',
    });
  }
  return events;
}

/** Deterministic demo events for a given UTC day — clearly labeled `demo`. */
export function demoEventsFor(dateISO: string): CalendarEvent[] {
  const day = dateISO.slice(0, 10);
  const mk = (id: string, title: string, currency: string, impact: CalendarImpact, time: string, forecast = '', previous = ''): CalendarEvent => ({
    id: `demo-${day}-${id}`,
    title,
    currency,
    impact,
    date: `${day}T${time}:00.000Z`,
    forecast,
    previous,
    actual: '',
    source: 'demo',
  });
  return [
    mk('cpi', 'CPI m/m (demo)', 'USD', 'High', '12:30', '0.3%', '0.2%'),
    mk('claims', 'Unemployment Claims (demo)', 'USD', 'High', '12:30', '220K', '215K'),
    mk('gdp', 'GDP q/q Preliminary (demo)', 'USD', 'Medium', '12:30', '2.1%', '2.3%'),
    mk('speech', 'Fed Chair Speaks (demo)', 'USD', 'Medium', '18:00'),
    mk('nfp', 'Non-Farm Payrolls (demo)', 'USD', 'High', '12:30', '180K', '150K'),
    mk('rate', 'Interest Rate Decision (demo)', 'EUR', 'High', '11:45', '2.00%', '2.00%'),
    mk('cpi-eu', 'CPI y/y Final (demo)', 'EUR', 'Medium', '09:00', '2.4%', '2.4%'),
    mk('oil', 'Crude Oil Inventories (demo)', 'USD', 'Medium', '14:30', '-1.2M', '-0.5M'),
    mk('pmi', 'Flash Manufacturing PMI (demo)', 'GBP', 'Low', '08:30', '48.5', '48.1'),
    mk('holiday', 'Bank Holiday (demo)', 'JPY', 'Holiday', '00:00'),
  ];
}

/** Pure filter used by the API route and unit tests. */
export function filterEvents(
  events: CalendarEvent[],
  opts: { date?: string; currency?: string; impact?: string },
): CalendarEvent[] {
  const day = opts.date?.slice(0, 10);
  const currency = opts.currency?.toUpperCase();
  const impact = opts.impact;
  return events
    .filter((e) => (day ? e.date.slice(0, 10) === day : true))
    .filter((e) => (currency ? e.currency === currency : true))
    .filter((e) => (impact && (IMPACTS as string[]).includes(impact) ? e.impact === impact : true))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchLiveEvents(): Promise<CalendarEvent[] | null> {
  try {
    const cached = await redisGet(CACHE_KEY);
    if (cached) return normalizeForexFactory(JSON.parse(cached));
    const res = await fetch(FF_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const raw: unknown = await res.json();
    const events = normalizeForexFactory(raw);
    if (events.length === 0) return null;
    await redisSet(CACHE_KEY, JSON.stringify(raw), CACHE_TTL_SEC).catch(() => {});
    return events;
  } catch {
    return null;
  }
}

export interface CalendarResult {
  events: CalendarEvent[];
  source: CalendarSource;
  disclaimer: string;
  date: string;
}

/**
 * Get calendar events for a day. Live feed when available, labeled demo data
 * otherwise. The `source` field is always explicit — never mix silently.
 */
export async function getCalendarEvents(opts: {
  date?: string;
  currency?: string;
  impact?: string;
}): Promise<CalendarResult> {
  const date = opts.date ?? new Date().toISOString();
  const live = await fetchLiveEvents();
  if (live) {
    return {
      events: filterEvents(live, opts),
      source: 'forexfactory',
      disclaimer: CALENDAR_DISCLAIMER,
      date,
    };
  }
  // Feed unreachable or empty → clearly-labeled demo data for the requested day.
  return {
    events: filterEvents(demoEventsFor(date), opts),
    source: 'demo',
    disclaimer: 'DEMO DATA — the live economic-calendar feed is unreachable from this server. These are sample events, not real data. ' + CALENDAR_DISCLAIMER,
    date,
  };
}
