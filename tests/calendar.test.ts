/**
 * Unit tests for the economic-calendar provider (pure parts): ForexFactory
 * normalization, filtering, and the labeled demo fallback.
 */
import 'dotenv/config'; // the provider's import chain (redis → env) validates env at load
import { describe, expect, it } from 'vitest';
import { normalizeForexFactory, demoEventsFor, filterEvents, type CalendarEvent } from '@/lib/market/calendar';

const sampleFeed = [
  { title: 'CPI m/m', country: 'USD', date: '2026-10-12T12:30:00-04:00', impact: 'High', forecast: '0.3%', previous: '0.2%' },
  { title: 'Bank Holiday', country: 'JPY', date: '2026-10-11T19:00:00-04:00', impact: 'Holiday', forecast: '', previous: '' },
  { title: 'MPC Member Speaks', country: 'GBP', date: '2026-10-12T05:30:00-04:00', impact: 'Low', forecast: '', previous: '' },
  { title: '', country: 'EUR', date: '2026-10-12T09:00:00-04:00', impact: 'Medium', forecast: '', previous: '' }, // no title → dropped
  { title: 'Bad Date', country: 'EUR', date: 'not-a-date', impact: 'Medium', forecast: '', previous: '' }, // bad date → dropped
  'garbage', // not an object → dropped
];

describe('normalizeForexFactory', () => {
  it('maps fields and converts dates to UTC ISO', () => {
    const events = normalizeForexFactory(sampleFeed);
    expect(events).toHaveLength(3);
    const cpi = events.find((e) => e.title === 'CPI m/m')!;
    expect(cpi.currency).toBe('USD');
    expect(cpi.impact).toBe('High');
    expect(cpi.forecast).toBe('0.3%');
    expect(cpi.previous).toBe('0.2%');
    expect(cpi.source).toBe('forexfactory');
    // 2026-10-12T12:30:00-04:00 → 16:30 UTC
    expect(cpi.date).toBe('2026-10-12T16:30:00.000Z');
  });

  it('drops malformed entries and returns [] for non-arrays', () => {
    expect(normalizeForexFactory(null)).toEqual([]);
    expect(normalizeForexFactory({})).toEqual([]);
    expect(normalizeForexFactory('x')).toEqual([]);
  });
});

describe('demoEventsFor', () => {
  it('generates labeled demo events for the requested day', () => {
    const events = demoEventsFor('2026-10-12T00:00:00.000Z');
    expect(events.length).toBeGreaterThan(3);
    for (const e of events) {
      expect(e.source).toBe('demo');
      expect(e.date.startsWith('2026-10-12')).toBe(true);
    }
  });
});

describe('filterEvents', () => {
  const events: CalendarEvent[] = [
    { id: '1', title: 'A', currency: 'USD', impact: 'High', date: '2026-10-12T16:30:00.000Z', forecast: '', previous: '', actual: '', source: 'forexfactory' },
    { id: '2', title: 'B', currency: 'EUR', impact: 'Low', date: '2026-10-12T09:00:00.000Z', forecast: '', previous: '', actual: '', source: 'forexfactory' },
    { id: '3', title: 'C', currency: 'USD', impact: 'Medium', date: '2026-10-13T10:00:00.000Z', forecast: '', previous: '', actual: '', source: 'forexfactory' },
  ];

  it('filters by day, currency and impact, sorted by time', () => {
    expect(filterEvents(events, { date: '2026-10-12' })).toHaveLength(2);
    expect(filterEvents(events, { date: '2026-10-12', currency: 'usd' })).toHaveLength(1);
    expect(filterEvents(events, { date: '2026-10-12', impact: 'Low' })[0].id).toBe('2');
    expect(filterEvents(events, { date: '2026-10-13' })[0].id).toBe('3');
    // sorted ascending by time within the day
    const day = filterEvents(events, { date: '2026-10-12' });
    expect(day[0].date.localeCompare(day[1].date)).toBeLessThan(0);
  });
});
