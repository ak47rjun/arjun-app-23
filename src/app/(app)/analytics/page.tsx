'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, StatCard, Tabs } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';
import { Activity } from 'lucide-react';

interface Stats {
  winRate: number;
  profitFactor: number | null;
  expectancy: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  avgWin: number;
  avgLoss: number;
  avgWinLossRatio: number | null;
  largestWin: number;
  largestLoss: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  longestWinStreak: number;
  longestLossStreak: number;
  closedTrades: number;
  equityCurve: { time: number; equity: number }[];
  byStrategy: Row[];
  byInstrument: Row[];
  bySession: Row[];
  byDayOfWeek: Row[];
  long: { trades: number; winRate: number; netPnl: number };
  short: { trades: number; winRate: number; netPnl: number };
  monthly: { month: string; trades: number; netPnl: number; winRate: number }[];
}

interface Row {
  key: string;
  trades: number;
  winRate: number;
  netPnl: number;
  profitFactor: number | null;
  avgWin: number;
  avgLoss: number;
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    api
      .get<{ stats: Stats }>('/api/journal/stats')
      .then((d) => setStats(d.stats))
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="animate-spin text-emerald-400" size={28} /></div>;
  }
  if (!stats || stats.closedTrades === 0) {
    return (
      <div>
        <PageHeader title="Performance Analytics" description="Deep statistics over your closed trades." />
        <EmptyState
          icon={Activity}
          title="No closed trades to analyze"
          description="Close trades in your journal and analytics will appear here — win rate, profit factor, drawdown, session performance and more."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Performance Analytics" description="Computed from your real closed trades. Times are UTC; sessions are UTC-based buckets." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Net P&L" value={`$${stats.netPnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} trend={stats.netPnl >= 0 ? 'up' : 'down'} />
        <StatCard label="Win rate" value={`${(stats.winRate * 100).toFixed(1)}%`} sub={`${stats.closedTrades} closed trades`} />
        <StatCard label="Profit factor" value={stats.profitFactor !== null ? stats.profitFactor.toFixed(2) : '∞'} sub={`Gross +$${stats.grossProfit.toFixed(0)} / -$${stats.grossLoss.toFixed(0)}`} />
        <StatCard label="Expectancy" value={`$${stats.expectancy.toFixed(2)}`} sub="average net P&L per trade" />
        <StatCard label="Max drawdown" value={`$${stats.maxDrawdown.toFixed(2)}`} sub={`${stats.maxDrawdownPercent.toFixed(1)}% of peak`} />
        <StatCard label="Avg win / loss" value={`$${stats.avgWin.toFixed(0)} / $${stats.avgLoss.toFixed(0)}`} sub={stats.avgWinLossRatio !== null ? `Ratio ${stats.avgWinLossRatio.toFixed(2)}` : ''} />
        <StatCard label="Best / worst" value={`$${stats.largestWin.toFixed(0)} / $${stats.largestLoss.toFixed(0)}`} />
        <StatCard label="Streaks" value={`${stats.longestWinStreak}W · ${stats.longestLossStreak}L`} sub="longest win / loss streaks" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'breakdown', label: 'Breakdowns' },
          { id: 'directions', label: 'Long vs Short' },
          { id: 'monthly', label: 'Monthly' },
        ]}
      />

      {tab === 'overview' && (
        <Card>
          <CardHeader><CardTitle>Equity curve (cumulative net P&L)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.equityCurve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="eq2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(52,211,153,0.08)" />
                  <XAxis dataKey="time" tickFormatter={(t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} stroke="#8fb8a5" fontSize={11} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${Number(v).toLocaleString()}`} stroke="#8fb8a5" fontSize={11} tickLine={false} width={64} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(7,31,22,0.95)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 12, color: '#e9f7f0', fontSize: 12 }}
                    labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
                    formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Cumulative']}
                  />
                  <Area type="monotone" dataKey="equity" stroke="#34d399" strokeWidth={2} fill="url(#eq2)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'breakdown' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <BreakdownCard title="By strategy" rows={stats.byStrategy} />
          <BreakdownCard title="By instrument" rows={stats.byInstrument} />
          <BreakdownCard title="By session (UTC)" rows={stats.bySession} />
          <BreakdownCard title="By day of week" rows={stats.byDayOfWeek} />
        </div>
      )}

      {tab === 'directions' && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Long trades</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-arjun-muted">Trades</span><span className="font-mono">{stats.long.trades}</span></div>
              <div className="flex justify-between"><span className="text-arjun-muted">Win rate</span><span className="font-mono">{(stats.long.winRate * 100).toFixed(1)}%</span></div>
              <div className="flex justify-between"><span className="text-arjun-muted">Net P&L</span><span className="font-mono text-emerald-300">${stats.long.netPnl.toFixed(2)}</span></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Short trades</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-arjun-muted">Trades</span><span className="font-mono">{stats.short.trades}</span></div>
              <div className="flex justify-between"><span className="text-arjun-muted">Win rate</span><span className="font-mono">{(stats.short.winRate * 100).toFixed(1)}%</span></div>
              <div className="flex justify-between"><span className="text-arjun-muted">Net P&L</span><span className="font-mono text-rose-300">${stats.short.netPnl.toFixed(2)}</span></div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'monthly' && (
        <Card>
          <CardHeader><CardTitle>Monthly performance</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(52,211,153,0.08)" />
                  <XAxis dataKey="month" stroke="#8fb8a5" fontSize={11} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${Number(v).toLocaleString()}`} stroke="#8fb8a5" fontSize={11} tickLine={false} width={64} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(7,31,22,0.95)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 12, color: '#e9f7f0', fontSize: 12 }}
                    formatter={(v, _n, p) => [`$${Number(v).toFixed(2)}`, `${p.payload.trades} trades · ${(p.payload.winRate * 100).toFixed(0)}% win rate`]}
                  />
                  <Bar dataKey="netPnl" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-arjun-muted">No data.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-arjun-line text-left text-xs uppercase tracking-wider text-arjun-muted">
                  <th className="pb-2 pr-3 font-medium">{title.replace('By ', '')}</th>
                  <th className="pb-2 pr-3 text-right font-medium">Trades</th>
                  <th className="pb-2 pr-3 text-right font-medium">Win rate</th>
                  <th className="pb-2 pr-3 text-right font-medium">Net P&L</th>
                  <th className="pb-2 font-medium">PF</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 12).map((r) => (
                  <tr key={r.key} className="border-b border-arjun-line/40 last:border-0">
                    <td className="py-2 pr-3 font-medium">{r.key}</td>
                    <td className="py-2 pr-3 text-right font-mono">{r.trades}</td>
                    <td className="py-2 pr-3 text-right font-mono">{(r.winRate * 100).toFixed(0)}%</td>
                    <td className={`py-2 pr-3 text-right font-mono ${r.netPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>${r.netPnl.toFixed(0)}</td>
                    <td className="py-2 font-mono">{r.profitFactor === null ? '∞' : r.profitFactor.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
