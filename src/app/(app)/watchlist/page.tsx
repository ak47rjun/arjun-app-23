'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Bell, BellOff, Loader2, Plus, RefreshCw, Search, Star, Trash2 } from 'lucide-react';
import { Badge, Button, EmptyState, Input, Label, Modal, PageHeader, Select, Switch } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

interface Instrument {
  id: string;
  symbol: string;
  name: string;
  type: string;
  digits: number;
}

interface Quote {
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  change: number;
  changePercent: number;
  volume?: number;
  time: number;
}

interface WatchlistItemRow {
  id: string;
  alertEnabled: boolean;
  alertAbove: number | null;
  alertBelow: number | null;
  instrument: Instrument;
}

interface Watchlist {
  id: string;
  name: string;
  isDefault: boolean;
  items: WatchlistItemRow[];
}

interface MarketStatus {
  provider: string;
  mode: 'live' | 'delayed' | 'demo';
  label: string;
  configured: boolean;
}

export default function WatchlistPage() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeWl, setActiveWl] = useState('');
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [status, setStatus] = useState<MarketStatus | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Instrument[]>([]);
  const [newListName, setNewListName] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [alertItem, setAlertItem] = useState<WatchlistItemRow | null>(null);
  const [alertAbove, setAlertAbove] = useState('');
  const [alertBelow, setAlertBelow] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [wlData, statusData] = await Promise.all([
      api.get<{ watchlists: Watchlist[] }>('/api/watchlists'),
      api.get<{ status: MarketStatus }>('/api/market/status'),
    ]);
    setWatchlists(wlData.watchlists);
    setStatus(statusData.status);
    if (!activeWl && wlData.watchlists.length > 0) setActiveWl(wlData.watchlists[0].id);
    setLoading(false);
  }, [activeWl]);

  useEffect(() => {
    load().catch((e) => {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to load watchlists');
      setLoading(false);
    });
  }, [load]);

  const wl = watchlists.find((w) => w.id === activeWl);

  // poll quotes
  useEffect(() => {
    if (!wl || wl.items.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const symbols = wl.items.map((i) => i.instrument.symbol).join(',');
        const data = await api.get<{ quotes: Quote[] }>(`/api/market/quotes?symbols=${symbols}`);
        if (cancelled) return;
        const map: Record<string, Quote> = {};
        for (const q of data.quotes) map[q.symbol] = q;
        setQuotes(map);
      } catch {
        /* keep last */
      }
    };
    void tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [wl]);

  // search
  useEffect(() => {
    if (search.trim().length < 1) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const data = await api.get<{ instruments: Instrument[] }>(`/api/market/search?q=${encodeURIComponent(search)}`);
      setResults(data.instruments);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const addInstrument = async (inst: Instrument) => {
    if (!wl) return;
    try {
      await api.post(`/api/watchlists/${wl.id}/items`, { instrumentId: inst.id });
      await load();
      setSearch('');
      setResults([]);
      toast.success(`${inst.symbol} added`);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to add');
    }
  };

  const removeInstrument = async (instId: string) => {
    if (!wl) return;
    await api.del(`/api/watchlists/${wl.id}/items?instrumentId=${instId}`);
    await load();
  };

  const createList = async () => {
    try {
      await api.post('/api/watchlists', { name: newListName });
      setNewListName('');
      setCreateOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to create list');
    }
  };

  const deleteList = async () => {
    if (!wl || wl.isDefault) return;
    await api.del(`/api/watchlists/${wl.id}`);
    setActiveWl('');
    await load();
  };

  const saveAlert = async () => {
    if (!alertItem) return;
    try {
      await api.patch(`/api/watchlists/${wl!.id}/items/${alertItem.id}`, {
        alertEnabled: true,
        alertAbove: alertAbove ? Number(alertAbove) : null,
        alertBelow: alertBelow ? Number(alertBelow) : null,
      });
      toast.success('Price alert saved');
      setAlertItem(null);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to save alert');
    }
  };

  if (loading) {
    return <div className="space-y-4"><div className="skeleton h-10 w-full" /><div className="skeleton h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Watchlist & Markets"
        description="Monitor instruments with live or delayed quotes. Set price alerts — ARJUN notifies you in-app."
        actions={
          <>
            {status && (
              <Badge variant={status.mode === 'demo' ? 'warn' : status.mode === 'delayed' ? 'neutral' : 'success'}>
                {status.mode === 'demo' ? 'DEMO DATA' : status.mode === 'delayed' ? 'DELAYED' : 'LIVE'} · {status.provider}
              </Badge>
            )}
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} /> New list</Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl border border-arjun-line bg-white/[0.03] p-1">
          {watchlists.map((w) => (
            <button
              key={w.id}
              onClick={() => setActiveWl(w.id)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                activeWl === w.id ? 'bg-emerald-500/15 text-emerald-200' : 'text-arjun-muted hover:text-arjun-text'
              }`}
            >
              {w.name} <span className="text-xs opacity-70">({w.items.length})</span>
            </button>
          ))}
        </div>
        {wl && !wl.isDefault && (
          <Button variant="ghost" size="sm" onClick={deleteList}><Trash2 size={14} /> Delete list</Button>
        )}
        <div className="relative ml-auto w-full max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-arjun-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Add instrument…" className="h-9 pl-9" />
          {results.length > 0 && (
            <div className="absolute inset-x-0 top-10 z-20 max-h-72 overflow-y-auto rounded-xl border border-arjun-line bg-arjun-panel shadow-glass">
              {results.map((inst) => (
                <button
                  key={inst.id}
                  onClick={() => void addInstrument(inst)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/5"
                >
                  <span><span className="font-mono font-semibold">{inst.symbol}</span> <span className="text-arjun-muted">{inst.name}</span></span>
                  <Badge variant="neutral">{inst.type}</Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {status?.mode === 'demo' && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          Prices on this page are <strong>simulated demo data</strong> — no real market feed is configured. Set
          MARKET_DATA_PROVIDER and an API key to enable real (delayed or live) quotes.
        </div>
      )}

      {!wl || wl.items.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Your watchlist is empty"
          description="Search for an instrument above to add it. Quotes refresh automatically."
        />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-arjun-line text-left text-xs uppercase tracking-wider text-arjun-muted">
                <th className="px-4 py-3 font-medium">Symbol</th>
                <th className="px-4 py-3 text-right font-medium">Bid</th>
                <th className="px-4 py-3 text-right font-medium">Ask</th>
                <th className="px-4 py-3 text-right font-medium">Last</th>
                <th className="px-4 py-3 text-right font-medium">Change</th>
                <th className="px-4 py-3 text-right font-medium">Volume</th>
                <th className="px-4 py-3 text-right font-medium">Updated</th>
                <th className="px-4 py-3 text-right font-medium">Alert</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {wl.items.map((item) => {
                const q = quotes[item.instrument.symbol];
                return (
                  <tr key={item.id} className="border-b border-arjun-line/40 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/terminal`} onClick={() => { /* terminal opens its own search */ }} className="font-mono font-semibold text-emerald-200 hover:underline">
                        {item.instrument.symbol}
                      </Link>
                      <div className="text-xs text-arjun-muted">{item.instrument.name}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{q ? q.bid.toFixed(item.instrument.digits) : '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">{q ? q.ask.toFixed(item.instrument.digits) : '—'}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{q ? q.last.toFixed(item.instrument.digits) : '—'}</td>
                    <td className={`px-4 py-3 text-right font-mono ${!q ? '' : q.changePercent >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {q ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-arjun-muted">{q?.volume ? q.volume.toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-right text-xs text-arjun-muted">
                      {q ? new Date(q.time * 1000).toLocaleTimeString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setAlertItem(item);
                          setAlertAbove(item.alertAbove?.toString() ?? '');
                          setAlertBelow(item.alertBelow?.toString() ?? '');
                        }}
                        className={`rounded-lg p-1.5 ${item.alertEnabled ? 'text-emerald-300' : 'text-arjun-muted'} hover:bg-white/5`}
                        aria-label="Configure alert"
                      >
                        {item.alertEnabled ? <Bell size={15} /> : <BellOff size={15} />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => void removeInstrument(item.instrument.id)} className="text-arjun-muted hover:text-rose-300" aria-label="Remove">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New watchlist">
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="e.g. Majors" />
          </div>
          <div className="flex justify-end">
            <Button onClick={createList} disabled={!newListName.trim()}>Create</Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(alertItem)} onClose={() => setAlertItem(null)} title={alertItem ? `Price alert · ${alertItem.instrument.symbol}` : ''}>
        <div className="space-y-4">
          <p className="text-sm text-arjun-muted">
            Get an in-app notification when {alertItem?.instrument.symbol} reaches your levels. Alerts use the configured market data provider.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Alert when price is above</Label>
              <Input value={alertAbove} onChange={(e) => setAlertAbove(e.target.value)} inputMode="decimal" placeholder="optional" />
            </div>
            <div>
              <Label>Alert when price is below</Label>
              <Input value={alertBelow} onChange={(e) => setAlertBelow(e.target.value)} inputMode="decimal" placeholder="optional" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveAlert} disabled={!alertAbove && !alertBelow}>Save alert</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
