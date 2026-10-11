'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Bell,
  CandlestickChart,
  ChevronDown,
  LayoutTemplate,
  Loader2,
  Plus,
  Share2,
  Star,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { Badge, Button, Input, Label, Modal, Select, Skeleton } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';
import { TradingViewWidget } from '@/components/terminal/tradingview-widget';
import { toTvSymbol } from '@/lib/market/tv-symbol';

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
  change: number;
  changePercent: number;
}

interface WatchlistItemRow {
  id: string;
  instrument: Instrument;
}

interface Watchlist {
  id: string;
  name: string;
  items: WatchlistItemRow[];
}

interface LayoutRow {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  isDefault: boolean;
}

const TIMEFRAMES = [
  { id: '1', label: '1m' },
  { id: '5', label: '5m' },
  { id: '15', label: '15m' },
  { id: '30', label: '30m' },
  { id: '60', label: '1h' },
  { id: '240', label: '4h' },
  { id: 'D', label: '1D' },
  { id: 'W', label: '1W' },
];

export default function TerminalPage() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeWl, setActiveWl] = useState<string>('');
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [symbol, setSymbol] = useState('EURUSD');
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [timeframe, setTimeframe] = useState('60');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Instrument[]>([]);
  const [layouts, setLayouts] = useState<LayoutRow[]>([]);
  const [providerLabel, setProviderLabel] = useState('');
  const [loading, setLoading] = useState(true);

  // share dialog
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTitle, setShareTitle] = useState('');
  const [shareBias, setShareBias] = useState<'BULLISH' | 'BEARISH' | 'NEUTRAL'>('NEUTRAL');
  const [shareAnalysis, setShareAnalysis] = useState('');
  const [shareVisibility, setShareVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');
  const [shareEntry, setShareEntry] = useState('');
  const [shareStop, setShareStop] = useState('');
  const [shareTarget, setShareTarget] = useState('');
  const [sharing, setSharing] = useState(false);

  const loadWatchlists = useCallback(async () => {
    const data = await api.get<{ watchlists: Watchlist[] }>('/api/watchlists');
    setWatchlists(data.watchlists);
    if (!activeWl && data.watchlists.length > 0) setActiveWl(data.watchlists[0].id);
  }, [activeWl]);

  const loadLayouts = useCallback(async () => {
    const data = await api.get<{ layouts: LayoutRow[] }>('/api/charts/layouts');
    setLayouts(data.layouts);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([loadWatchlists(), loadLayouts()]);
        const status = await api.get<{ status: { label: string; mode: string; provider: string } }>('/api/market/status');
        setProviderLabel(status.status.label);
        const def = await api.get<{ layouts: LayoutRow[] }>('/api/charts/layouts');
        const d = def.layouts.find((l) => l.isDefault);
        if (d) {
          setSymbol(d.symbol);
          setTimeframe(d.timeframe);
        }
      } catch (e) {
        toast.error(e instanceof ApiClientError ? e.message : 'Failed to load terminal');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadWatchlists, loadLayouts]);

  // poll quotes for the active watchlist
  useEffect(() => {
    if (!activeWl) return;
    const wl = watchlists.find((w) => w.id === activeWl);
    if (!wl || wl.items.length === 0) return;
    let cancelled = false;
    const load = async () => {
      try {
        const symbols = wl.items.map((i) => i.instrument.symbol).join(',');
        const data = await api.get<{ quotes: Quote[] }>(`/api/market/quotes?symbols=${symbols}`);
        if (cancelled) return;
        const map: Record<string, Quote> = {};
        for (const q of data.quotes) map[q.symbol] = q;
        setQuotes(map);
      } catch {
        /* keep last quotes */
      }
    };
    void load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeWl, watchlists]);

  // search
  useEffect(() => {
    if (search.trim().length < 1) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const data = await api.get<{ instruments: Instrument[] }>(`/api/market/search?q=${encodeURIComponent(search)}`);
      setSearchResults(data.instruments);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const openSymbol = async (inst: Instrument) => {
    setSymbol(inst.symbol);
    setInstrument(inst);
    setSearch('');
    setSearchResults([]);
  };

  const addToWatchlist = async (inst: Instrument) => {
    if (!activeWl) return;
    try {
      await api.post(`/api/watchlists/${activeWl}/items`, { instrumentId: inst.id });
      await loadWatchlists();
      toast.success(`${inst.symbol} added to watchlist`);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to add');
    }
  };

  const removeFromWatchlist = async (instId: string) => {
    if (!activeWl) return;
    try {
      await api.del(`/api/watchlists/${activeWl}/items?instrumentId=${instId}`);
      await loadWatchlists();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to remove');
    }
  };

  const saveLayout = async () => {
    try {
      await api.post('/api/charts/layouts', { name: `${symbol} · ${timeframe}`, symbol, timeframe, config: {}, isDefault: false });
      await loadLayouts();
      toast.success('Chart layout saved');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to save layout');
    }
  };

  const doShare = async () => {
    setSharing(true);
    try {
      const res = await api.post<{ share: { id: string; linkToken: string } }>('/api/charts/shares', {
        title: shareTitle || `${symbol} · ${timeframe} setup`,
        symbol,
        timeframe,
        bias: shareBias,
        analysis: shareAnalysis || undefined,
        visibility: shareVisibility,
        entry: shareEntry ? Number(shareEntry) : undefined,
        stopLoss: shareStop ? Number(shareStop) : undefined,
        takeProfit: shareTarget ? Number(shareTarget) : undefined,
      });
      toast.success('Chart shared', {
        description: shareVisibility === 'PRIVATE' ? `Private link: /s/${res.share.linkToken}` : 'Public link created',
      });
      setShareOpen(false);
      setShareAnalysis('');
      setShareTitle('');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to share chart');
    } finally {
      setSharing(false);
    }
  };

  const tvSymbol = toTvSymbol(symbol, instrument?.type);

  if (loading) {
    return (
      <div className="grid h-[calc(100vh-8rem)] grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <Skeleton className="h-full w-full rounded-2xl" />
        <Skeleton className="h-full w-full rounded-2xl" />
      </div>
    );
  }

  const wl = watchlists.find((w) => w.id === activeWl);

  return (
    <div className="grid h-[calc(100vh-7.5rem)] grid-cols-1 gap-4 lg:grid-cols-[270px_1fr]">
      {/* ── Left: watchlist + search ── */}
      <div className="glass flex flex-col overflow-hidden rounded-2xl">
        <div className="border-b border-arjun-line p-3">
          <div className="mb-2 flex items-center gap-2">
            <Star size={15} className="text-emerald-300" />
            <Select value={activeWl} onChange={(e) => setActiveWl(e.target.value)} className="h-8 text-xs">
              {watchlists.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </Select>
          </div>
          <div className="relative">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search instruments…"
              className="h-8 text-xs"
            />
            {searchResults.length > 0 && (
              <div className="absolute inset-x-0 top-9 z-20 max-h-64 overflow-y-auto rounded-xl border border-arjun-line bg-arjun-panel shadow-glass">
                {searchResults.map((inst) => (
                  <button
                    key={inst.id}
                    onClick={() => void openSymbol(inst)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-white/5"
                  >
                    <span>
                      <span className="font-mono font-semibold">{inst.symbol}</span>
                      <span className="ml-2 text-arjun-muted">{inst.name}</span>
                    </span>
                    <Plus size={13} className="text-emerald-300" onClick={(e) => { e.stopPropagation(); void addToWatchlist(inst); }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <tbody>
              {(wl?.items ?? []).map((item) => {
                const q = quotes[item.instrument.symbol];
                const active = item.instrument.symbol === symbol;
                return (
                  <tr
                    key={item.id}
                    onClick={() => void openSymbol(item.instrument)}
                    className={`cursor-pointer border-b border-arjun-line/40 ${active ? 'bg-emerald-500/10' : 'hover:bg-white/[0.03]'}`}
                  >
                    <td className="px-3 py-2">
                      <div className="font-mono font-semibold">{item.instrument.symbol}</div>
                      <div className="text-[10px] text-arjun-muted">{item.instrument.type}</div>
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {q ? q.last.toFixed(item.instrument.digits) : <Loader2 size={12} className="animate-spin" />}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {q && (
                        <span className={`font-mono ${q.changePercent >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); void removeFromWatchlist(item.instrument.id); }}
                        className="text-arjun-muted hover:text-rose-300"
                        aria-label="Remove"
                      >
                        <X size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {(wl?.items ?? []).length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-arjun-muted">
                    Watchlist is empty. Search above to add instruments.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {providerLabel && (
          <div className="border-t border-arjun-line p-3 text-[11px] text-arjun-muted">
            <Badge variant="warn" className="mr-1">Data</Badge> {providerLabel}
          </div>
        )}
      </div>

      {/* ── Right: chart ── */}
      <div className="glass flex flex-col overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-arjun-line p-3">
          <div className="flex items-center gap-2">
            <CandlestickChart size={16} className="text-emerald-300" />
            <span className="font-mono font-bold">{symbol}</span>
            {instrument && <span className="text-xs text-arjun-muted">{instrument.name}</span>}
          </div>
          <div className="ml-2 flex items-center gap-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.id}
                onClick={() => setTimeframe(tf.id)}
                className={`rounded-lg px-2 py-1 text-xs font-medium transition-all ${
                  timeframe === tf.id ? 'bg-emerald-500/15 text-emerald-200' : 'text-arjun-muted hover:text-arjun-text'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <select
                className="input h-8 appearance-none py-1 pl-2 pr-7 text-xs"
                value=""
                onChange={(e) => {
                  const l = layouts.find((x) => x.id === e.target.value);
                  if (l) {
                    setSymbol(l.symbol);
                    setTimeframe(l.timeframe);
                  }
                }}
              >
                <option value="">Load layout…</option>
                {layouts.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}{l.isDefault ? ' ★' : ''}</option>
                ))}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-arjun-muted" />
            </div>
            <Button variant="secondary" size="sm" onClick={saveLayout}>
              <LayoutTemplate size={13} /> Save layout
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShareOpen(true)}>
              <Share2 size={13} /> Share chart
            </Button>
          </div>
        </div>
        <div className="relative flex-1">
          <TradingViewWidget symbol={tvSymbol} interval={timeframe} />
          <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg border border-arjun-line bg-black/60 px-2 py-1 text-[10px] text-arjun-muted backdrop-blur-glass">
            Chart: TradingView widget · free-tier data may be delayed · times in UTC
          </div>
        </div>
      </div>

      {/* ── Share dialog ── */}
      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title={`Share ${symbol} · ${timeframe}`} description="Share this chart setup with the community, a group, or via a private link.">
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={shareTitle} onChange={(e) => setShareTitle(e.target.value)} placeholder={`${symbol} setup`} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Bias</Label>
              <Select value={shareBias} onChange={(e) => setShareBias(e.target.value as never)}>
                <option value="BULLISH">Bullish</option>
                <option value="BEARISH">Bearish</option>
                <option value="NEUTRAL">Neutral</option>
              </Select>
            </div>
            <div>
              <Label>Visibility</Label>
              <Select value={shareVisibility} onChange={(e) => setShareVisibility(e.target.value as never)}>
                <option value="PRIVATE">Private link</option>
                <option value="PUBLIC">Public link</option>
              </Select>
            </div>
            <div>
              <Label>Entry (optional)</Label>
              <Input value={shareEntry} onChange={(e) => setShareEntry(e.target.value)} placeholder="0.0000" inputMode="decimal" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Stop-loss (optional)</Label>
              <Input value={shareStop} onChange={(e) => setShareStop(e.target.value)} placeholder="0.0000" inputMode="decimal" />
            </div>
            <div>
              <Label>Take-profit (optional)</Label>
              <Input value={shareTarget} onChange={(e) => setShareTarget(e.target.value)} placeholder="0.0000" inputMode="decimal" />
            </div>
          </div>
          <div>
            <Label>Analysis</Label>
            <textarea
              className="input min-h-[90px]"
              value={shareAnalysis}
              onChange={(e) => setShareAnalysis(e.target.value)}
              placeholder="Your thesis, key levels, invalidation…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShareOpen(false)}>Cancel</Button>
            <Button onClick={doShare} disabled={sharing}>
              {sharing ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} Share chart
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
