'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  BookOpen, CalendarDays, Download, Filter, Loader2, Plus, Search, TrendingDown, TrendingUp,
} from 'lucide-react';
import { Badge, Button, EmptyState, Input, Label, Modal, PageHeader, Select, StatCard } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

interface TradeRow {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  status: 'OPEN' | 'CLOSED';
  source: string;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  netPnl: number | null;
  entryTime: string;
  exitTime: string | null;
  strategy: { id: string; name: string } | null;
  tags: { id: string; name: string; color: string }[];
}

interface Stats {
  winRate: number;
  profitFactor: number | null;
  expectancy: number;
  netPnl: number;
  maxDrawdown: number;
  closedTrades: number;
  wins: number;
  losses: number;
  avgWin: number;
  avgLoss: number;
  longestLossStreak: number;
}

interface CalendarDay {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
}

interface Strategy {
  id: string;
  name: string;
}

export default function JournalPage() {
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    symbol: 'EURUSD',
    direction: 'LONG' as 'LONG' | 'SHORT',
    status: 'CLOSED' as 'OPEN' | 'CLOSED',
    entryPrice: '',
    exitPrice: '',
    stopLoss: '',
    takeProfit: '',
    quantity: '',
    entryTime: new Date().toISOString().slice(0, 16),
    exitTime: '',
    fees: '0',
    commission: '0',
    swap: '0',
    strategyId: '',
    timeframe: '60',
    setup: '',
    thesis: '',
    notes: '',
    emotion: '',
    disciplineRating: '7',
    rulesFollowed: true,
  });

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (symbolFilter) params.set('symbol', symbolFilter);
    const [t, s, c, st] = await Promise.all([
      api.get<{ trades: TradeRow[] }>(`/api/trades?${params.toString()}`),
      api.get<{ stats: Stats }>('/api/journal/stats'),
      api.get<{ days: CalendarDay[] }>(`/api/journal/calendar?from=${new Date(Date.now() - 180 * 86400000).toISOString()}`),
      api.get<{ strategies: Strategy[] }>('/api/strategies'),
    ]);
    setTrades(t.trades);
    setStats(s.stats);
    setCalendar(c.days);
    setStrategies(st.strategies);
    setLoading(false);
  }, [statusFilter, symbolFilter]);

  useEffect(() => {
    load().catch((e) => {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to load journal');
      setLoading(false);
    });
  }, [load]);

  const submitTrade = async () => {
    setSaving(true);
    try {
      await api.post('/api/trades', {
        symbol: form.symbol,
        direction: form.direction,
        status: form.status,
        entryPrice: Number(form.entryPrice),
        exitPrice: form.exitPrice ? Number(form.exitPrice) : undefined,
        stopLoss: form.stopLoss ? Number(form.stopLoss) : undefined,
        takeProfit: form.takeProfit ? Number(form.takeProfit) : undefined,
        quantity: Number(form.quantity),
        entryTime: new Date(form.entryTime).toISOString(),
        exitTime: form.exitTime ? new Date(form.exitTime).toISOString() : undefined,
        fees: Number(form.fees || 0),
        commission: Number(form.commission || 0),
        swap: Number(form.swap || 0),
        strategyId: form.strategyId || undefined,
        timeframe: form.timeframe || undefined,
        setup: form.setup || undefined,
        thesis: form.thesis || undefined,
        notes: form.notes || undefined,
        emotion: form.emotion || undefined,
        disciplineRating: Number(form.disciplineRating),
        rulesFollowed: form.rulesFollowed,
      });
      toast.success('Trade journaled');
      setNewOpen(false);
      setForm({ ...form, entryPrice: '', exitPrice: '', quantity: '', thesis: '', notes: '' });
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to save trade');
    } finally {
      setSaving(false);
    }
  };

  const maxAbsPnl = Math.max(1, ...calendar.map((d) => Math.abs(d.pnl)));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trading Journal"
        description="Every trade, screenshot and lesson in one place. All statistics are computed from your records."
        actions={
          <>
            <a href="/api/journal/export?format=csv" className="btn-ghost"><Download size={14} /> CSV</a>
            <a href="/api/journal/export?format=json" className="btn-ghost"><Download size={14} /> JSON</a>
            <Button onClick={() => setNewOpen(true)}><Plus size={15} /> Log trade</Button>
          </>
        }
      />

      {/* stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Net P&L (closed)"
          value={stats ? `$${stats.netPnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
          trend={stats && stats.netPnl >= 0 ? 'up' : 'down'}
          icon={stats && stats.netPnl >= 0 ? TrendingUp : TrendingDown}
        />
        <StatCard
          label="Win rate"
          value={stats && stats.closedTrades > 0 ? `${(stats.winRate * 100).toFixed(1)}%` : '—'}
          sub={stats ? `${stats.wins}W / ${stats.losses}L` : ''}
        />
        <StatCard
          label="Profit factor"
          value={stats?.profitFactor !== null && stats?.profitFactor !== undefined ? stats.profitFactor.toFixed(2) : '—'}
          sub={stats ? `Expectancy $${stats.expectancy.toFixed(2)}/trade` : ''}
        />
        <StatCard
          label="Max drawdown"
          value={stats ? `$${stats.maxDrawdown.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
          sub={stats ? `Longest losing streak: ${stats.longestLossStreak}` : ''}
        />
      </div>

      {/* calendar heatmap */}
      <div className="card">
        <div className="mb-4 flex items-center gap-2">
          <CalendarDays size={16} className="text-emerald-300" />
          <h3 className="font-display text-lg font-semibold">Trading calendar</h3>
          <span className="ml-auto text-xs text-arjun-muted">Last 6 months · darker = bigger P&L</span>
        </div>
        {calendar.length === 0 ? (
          <p className="py-6 text-center text-sm text-arjun-muted">No closed trades in this period yet.</p>
        ) : (
          <div className="grid grid-cols-7 gap-1 sm:grid-cols-14">
            {calendar.map((d) => {
              const intensity = Math.min(1, Math.abs(d.pnl) / maxAbsPnl);
              const bg = d.pnl > 0 ? `rgba(16,185,129,${0.12 + intensity * 0.75})` : d.pnl < 0 ? `rgba(251,113,133,${0.12 + intensity * 0.75})` : 'rgba(255,255,255,0.04)';
              return (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.trades} trade(s), P&L $${d.pnl.toFixed(2)} (${d.wins}W)`}
                  className="aspect-square rounded-sm border border-white/5"
                  style={{ background: bg }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* filters + table */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-48">
          <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-arjun-muted" />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 pl-8">
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
          </Select>
        </div>
        <div className="relative w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-arjun-muted" />
          <Input value={symbolFilter} onChange={(e) => setSymbolFilter(e.target.value)} placeholder="Symbol…" className="h-9 pl-8" />
        </div>
        <Link href="/analytics" className="btn-ghost ml-auto">Deep analytics →</Link>
      </div>

      {loading ? (
        <div className="card flex items-center justify-center py-16"><Loader2 className="animate-spin text-emerald-400" /></div>
      ) : trades.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No trades yet"
          description="Log your first trade manually, or connect an MT5 account to import your history automatically."
          action={<Button onClick={() => setNewOpen(true)}><Plus size={15} /> Log your first trade</Button>}
        />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-arjun-line text-left text-xs uppercase tracking-wider text-arjun-muted">
                <th className="px-4 py-3 font-medium">Symbol</th>
                <th className="px-4 py-3 font-medium">Direction</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Entry</th>
                <th className="px-4 py-3 text-right font-medium">Exit</th>
                <th className="px-4 py-3 text-right font-medium">Net P&L</th>
                <th className="px-4 py-3 font-medium">Strategy</th>
                <th className="px-4 py-3 font-medium">Entry time</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-b border-arjun-line/40 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/journal/${t.id}`} className="font-mono font-semibold text-emerald-200 hover:underline">{t.symbol}</Link>
                    {t.source === 'MT5_IMPORT' && <span className="ml-1 text-[10px] text-arjun-muted">MT5</span>}
                  </td>
                  <td className="px-4 py-3"><Badge variant={t.direction === 'LONG' ? 'success' : 'danger'}>{t.direction}</Badge></td>
                  <td className="px-4 py-3"><Badge variant={t.status === 'OPEN' ? 'cyan' : 'neutral'}>{t.status}</Badge></td>
                  <td className="px-4 py-3 text-right font-mono">{t.entryPrice}</td>
                  <td className="px-4 py-3 text-right font-mono">{t.exitPrice ?? '—'}</td>
                  <td className={`px-4 py-3 text-right font-mono ${t.netPnl === null ? 'text-arjun-muted' : t.netPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {t.netPnl === null ? '—' : `$${t.netPnl.toFixed(2)}`}
                  </td>
                  <td className="px-4 py-3 text-arjun-muted">{t.strategy?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-arjun-muted">{new Date(t.entryTime).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── New trade dialog ── */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Log a trade" className="max-w-2xl" description="Record a trade with full context — screenshots and planned-vs-actual are on the trade detail page.">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Symbol</Label>
            <Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} placeholder="EURUSD" />
          </div>
          <div>
            <Label>Direction</Label>
            <Select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as never })}>
              <option value="LONG">Long</option>
              <option value="SHORT">Short</option>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as never })}>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
            </Select>
          </div>
          <div>
            <Label>Quantity / lots</Label>
            <Input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} inputMode="decimal" placeholder="0.10" />
          </div>
          <div>
            <Label>Entry price</Label>
            <Input value={form.entryPrice} onChange={(e) => setForm({ ...form, entryPrice: e.target.value })} inputMode="decimal" placeholder="1.0842" />
          </div>
          <div>
            <Label>Exit price {form.status === 'CLOSED' ? '(required)' : '(optional)'}</Label>
            <Input value={form.exitPrice} onChange={(e) => setForm({ ...form, exitPrice: e.target.value })} inputMode="decimal" placeholder="1.0871" />
          </div>
          <div>
            <Label>Stop-loss</Label>
            <Input value={form.stopLoss} onChange={(e) => setForm({ ...form, stopLoss: e.target.value })} inputMode="decimal" />
          </div>
          <div>
            <Label>Take-profit</Label>
            <Input value={form.takeProfit} onChange={(e) => setForm({ ...form, takeProfit: e.target.value })} inputMode="decimal" />
          </div>
          <div>
            <Label>Entry time (UTC)</Label>
            <Input type="datetime-local" value={form.entryTime} onChange={(e) => setForm({ ...form, entryTime: e.target.value })} />
          </div>
          <div>
            <Label>Exit time (UTC)</Label>
            <Input type="datetime-local" value={form.exitTime} onChange={(e) => setForm({ ...form, exitTime: e.target.value })} />
          </div>
          <div>
            <Label>Fees</Label>
            <Input value={form.fees} onChange={(e) => setForm({ ...form, fees: e.target.value })} inputMode="decimal" />
          </div>
          <div>
            <Label>Commission</Label>
            <Input value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })} inputMode="decimal" />
          </div>
          <div>
            <Label>Swap</Label>
            <Input value={form.swap} onChange={(e) => setForm({ ...form, swap: e.target.value })} inputMode="decimal" />
          </div>
          <div>
            <Label>Strategy</Label>
            <Select value={form.strategyId} onChange={(e) => setForm({ ...form, strategyId: e.target.value })}>
              <option value="">— none —</option>
              {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Timeframe</Label>
            <Select value={form.timeframe} onChange={(e) => setForm({ ...form, timeframe: e.target.value })}>
              <option value="5">5m</option><option value="15">15m</option><option value="30">30m</option>
              <option value="60">1h</option><option value="240">4h</option><option value="D">Daily</option>
            </Select>
          </div>
          <div>
            <Label>Setup</Label>
            <Input value={form.setup} onChange={(e) => setForm({ ...form, setup: e.target.value })} placeholder="e.g. London breakout" />
          </div>
          <div className="col-span-2">
            <Label>Thesis</Label>
            <textarea className="input" value={form.thesis} onChange={(e) => setForm({ ...form, thesis: e.target.value })} placeholder="Why this trade?" />
          </div>
          <div className="col-span-2">
            <Label>Notes / lessons</Label>
            <textarea className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Execution notes, mistakes, lessons…" />
          </div>
          <div>
            <Label>Emotion</Label>
            <Select value={form.emotion} onChange={(e) => setForm({ ...form, emotion: e.target.value })}>
              <option value="">—</option>
              <option value="calm">Calm</option>
              <option value="confident">Confident</option>
              <option value="fomo">FOMO</option>
              <option value="revenge">Revenge</option>
              <option value="tilt">Tilt</option>
            </Select>
          </div>
          <div>
            <Label>Discipline (1–10)</Label>
            <Input type="number" min={1} max={10} value={form.disciplineRating} onChange={(e) => setForm({ ...form, disciplineRating: e.target.value })} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button>
          <Button onClick={submitTrade} disabled={saving || !form.entryPrice || !form.quantity}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Save trade
          </Button>
        </div>
      </Modal>
    </div>
  );
}
