'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Badge, Button, EmptyState, PageHeader, Select } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';
import { cn } from '@/lib/cn';

type Impact = 'High' | 'Medium' | 'Low' | 'Holiday';

interface CalendarEvent {
  id: string;
  title: string;
  currency: string;
  impact: Impact;
  date: string;
  forecast: string;
  previous: string;
  actual: string;
  source: 'forexfactory' | 'demo';
}

interface CalendarResponse {
  events: CalendarEvent[];
  source: 'forexfactory' | 'demo';
  disclaimer: string;
  date: string;
}

const IMPACTS: (Impact | 'All')[] = ['All', 'High', 'Medium', 'Low', 'Holiday'];

const impactBadge = (impact: Impact) => {
  if (impact === 'High') return <Badge variant="danger">High</Badge>;
  if (impact === 'Medium') return <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-200">Medium</Badge>;
  if (impact === 'Holiday') return <Badge variant="cyan">Holiday</Badge>;
  return <Badge variant="neutral">Low</Badge>;
};

const fmtDate = (iso: string) => iso.slice(0, 10);
const shiftDay = (iso: string, delta: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};
const prettyDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

export default function CalendarPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [impact, setImpact] = useState<Impact | 'All'>('All');
  const [currency, setCurrency] = useState('ALL');
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (day: string) => {
    setLoading(true);
    try {
      const res = await api.get<CalendarResponse>(`/api/calendar?date=${day}`);
      setData(res);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to load calendar');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  const currencies = useMemo(() => {
    const set = new Set((data?.events ?? []).map((e) => e.currency));
    return [...set].sort();
  }, [data]);

  const events = useMemo(() => {
    const all = data?.events ?? [];
    return all
      .filter((e) => (impact === 'All' ? true : e.impact === impact))
      .filter((e) => (currency === 'ALL' ? true : e.currency === currency));
  }, [data, impact, currency]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Economic Calendar"
        description="Market-moving events by day — times shown in your local timezone. High-impact news often drives volatility."
      />

      {data?.source === 'demo' && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          <strong>Demo data</strong> — the live calendar feed is unreachable from this server, so sample events are shown. They are not real.
        </div>
      )}

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDate((d) => shiftDay(d, -1))} aria-label="Previous day">
            <ChevronLeft size={14} />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDate(new Date().toISOString().slice(0, 10))}>
            Today
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDate((d) => shiftDay(d, 1))} aria-label="Next day">
            <ChevronRight size={14} />
          </Button>
          <div className="ml-2 flex items-center gap-2 text-sm font-medium">
            <CalendarDays size={15} className="text-emerald-300" /> {prettyDay(date)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {IMPACTS.map((i) => (
              <button
                key={i}
                onClick={() => setImpact(i)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition',
                  impact === i ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200' : 'border-arjun-line text-arjun-muted hover:text-arjun-text',
                )}
              >
                {i}
              </button>
            ))}
          </div>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="!w-28">
            <option value="ALL">All currencies</option>
            {currencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="card flex items-center justify-center py-16"><Loader2 className="animate-spin text-emerald-400" /></div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No events"
          description={data?.source === 'demo' ? 'No demo events for this filter.' : 'No scheduled events for this day in the live feed. The free feed covers the current week — try a date within it.'}
        />
      ) : (
        <div className="space-y-2">
          {events.map((e) => (
            <div key={e.id} className="card flex flex-wrap items-center gap-3 py-3">
              <div className="w-16 shrink-0 text-center font-mono text-sm text-arjun-muted">
                {new Date(e.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </div>
              <Badge variant="cyan">{e.currency}</Badge>
              {impactBadge(e.impact)}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{e.title}</div>
                {(e.forecast || e.previous || e.actual) && (
                  <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-arjun-muted">
                    {e.forecast && <span>Forecast <span className="font-mono text-arjun-text">{e.forecast}</span></span>}
                    {e.previous && <span>Previous <span className="font-mono text-arjun-text">{e.previous}</span></span>}
                    {e.actual && <span>Actual <span className="font-mono text-emerald-300">{e.actual}</span></span>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {data && (
        <p className="text-xs text-arjun-muted">
          Source: {data.source === 'forexfactory' ? 'ForexFactory free feed (third-party)' : 'demo (sample data)'} · {data.disclaimer}
        </p>
      )}
    </div>
  );
}
