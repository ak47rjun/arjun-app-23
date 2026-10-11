import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CandlestickChart,
  MessagesSquare,
  Plus,
  Video,
  Wallet,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  Percent,
  AlertTriangle,
} from 'lucide-react';
import { requireServerSession } from '@/lib/auth/server-session';
import { getDashboardData } from '@/lib/dashboard/service';
import { Card, CardContent, CardHeader, CardTitle, Badge, EmptyState, StatCard, Avatar, PriceChange } from '@/components/ui';
import { EquityChart } from '@/components/dashboard/equity-chart';

export const dynamic = 'force-dynamic';

const fmtMoney = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);

export default async function DashboardPage() {
  const user = await requireServerSession();
  const data = await getDashboardData(user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-arjun-muted">
            Welcome back, {user.displayName ?? 'trader'}. Every figure below comes from your real records.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/journal?new=1" className="btn-ghost"><Plus size={15} /> Log trade</Link>
          <Link href="/terminal" className="btn-primary"><CandlestickChart size={15} /> Open terminal</Link>
        </div>
      </div>

      {!user.emailVerified && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <AlertTriangle size={16} className="shrink-0 text-amber-300" />
          Your email isn&apos;t verified yet. Check your inbox or{' '}
          <Link href="/verify-email" className="font-medium underline">resend the verification link</Link>.
        </div>
      )}

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total equity"
          value={data.totals.equity > 0 ? fmtMoney(data.totals.equity, data.totals.currency) : '—'}
          sub={data.accounts.length > 0 ? `${data.accounts.length} connected account${data.accounts.length > 1 ? 's' : ''}` : 'No accounts connected'}
          icon={Wallet}
        />
        <StatCard
          label="Today's P&L"
          value={fmtMoney(data.performance.today, data.totals.currency)}
          trend={data.performance.today > 0 ? 'up' : data.performance.today < 0 ? 'down' : 'flat'}
          icon={data.performance.today >= 0 ? TrendingUp : TrendingDown}
        />
        <StatCard
          label="Win rate"
          value={data.stats.totalTrades > 0 ? `${(data.stats.winRate * 100).toFixed(1)}%` : '—'}
          sub={data.stats.totalTrades > 0 ? `${data.stats.wins}W / ${data.stats.losses}L` : 'No closed trades yet'}
          icon={Percent}
        />
        <StatCard
          label="Profit factor"
          value={data.stats.profitFactor !== null ? data.stats.profitFactor.toFixed(2) : '—'}
          sub={data.stats.expectancy !== 0 ? `Expectancy ${fmtMoney(data.stats.expectancy)}/trade` : 'Journal a trade to begin'}
          icon={Target}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Equity curve */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Equity curve</CardTitle>
            <Link href="/analytics" className="text-xs text-emerald-300 hover:text-emerald-200">Full analytics →</Link>
          </CardHeader>
          <CardContent>
            {data.equityCurve.length > 1 ? (
              <EquityChart data={data.equityCurve} />
            ) : (
              <EmptyState
                icon={Activity}
                title="No performance data yet"
                description="Close a few trades in your journal and your equity curve will appear here."
                action={<Link href="/journal?new=1" className="btn-ghost">Log your first trade</Link>}
              />
            )}
          </CardContent>
        </Card>

        {/* Performance periods */}
        <Card>
          <CardHeader>
            <CardTitle>Performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PeriodRow label="Today" value={data.performance.today} currency={data.totals.currency} />
            <PeriodRow label="This week" value={data.performance.week} currency={data.totals.currency} />
            <PeriodRow label="This month" value={data.performance.month} currency={data.totals.currency} />
            <PeriodRow label="This year" value={data.performance.year} currency={data.totals.currency} />
            <PeriodRow label="All time" value={data.performance.allTime} currency={data.totals.currency} bold />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Recent trades */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Recent trades</CardTitle>
            <Link href="/journal" className="text-xs text-emerald-300 hover:text-emerald-200">Open journal →</Link>
          </CardHeader>
          <CardContent>
            {data.recentTrades.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="Your journal is empty"
                description="Log trades manually or connect an MT5 account to import history automatically."
                action={
                  <div className="flex gap-2">
                    <Link href="/journal?new=1" className="btn-ghost"><Plus size={14} /> Log trade</Link>
                    <Link href="/mt5" className="btn-ghost"><Wallet size={14} /> Connect MT5</Link>
                  </div>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-arjun-line text-left text-xs uppercase tracking-wider text-arjun-muted">
                      <th className="pb-2 pr-4 font-medium">Symbol</th>
                      <th className="pb-2 pr-4 font-medium">Direction</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 pr-4 text-right font-medium">Net P&L</th>
                      <th className="pb-2 font-medium">Opened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentTrades.map((t) => (
                      <tr key={t.id} className="border-b border-arjun-line/50 last:border-0">
                        <td className="py-2.5 pr-4 font-mono font-medium">{t.symbol}</td>
                        <td className="py-2.5 pr-4">
                          <Badge variant={t.direction === 'LONG' ? 'success' : 'danger'}>{t.direction}</Badge>
                        </td>
                        <td className="py-2.5 pr-4">
                          <Badge variant={t.status === 'OPEN' ? 'cyan' : 'neutral'}>{t.status}</Badge>
                          {t.source === 'MT5_IMPORT' && <span className="ml-1 text-[10px] text-arjun-muted">MT5</span>}
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          {t.netPnl === null ? <span className="text-arjun-muted">—</span> : <PriceChange value={t.netPnl} />}
                        </td>
                        <td className="py-2.5 text-arjun-muted">{new Date(t.entryTime).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column: accounts + meetings + messages */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Connected accounts</CardTitle>
              <Link href="/mt5" className="text-xs text-emerald-300 hover:text-emerald-200">Manage →</Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.accounts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-arjun-line p-4 text-center text-sm text-arjun-muted">
                  No accounts connected.
                  <div className="mt-2"><Link href="/mt5" className="btn-ghost !py-1.5 text-xs">Connect MT5</Link></div>
                </div>
              ) : (
                data.accounts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-xl border border-arjun-line p-3">
                    <div>
                      <div className="text-sm font-medium">{a.name}</div>
                      <div className="text-xs text-arjun-muted">{a.broker} · {a.currency}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm">{fmtMoney(a.equity, a.currency)}</div>
                      <Badge variant={a.status === 'ACTIVE' ? 'success' : 'warn'}>{a.status}</Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming meetings</CardTitle>
              <Link href="/meetings" className="text-xs text-emerald-300 hover:text-emerald-200">All →</Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.upcomingMeetings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-arjun-line p-4 text-center text-sm text-arjun-muted">
                  No meetings scheduled.
                  <div className="mt-2"><Link href="/meetings" className="btn-ghost !py-1.5 text-xs"><Video size={13} /> Start a meeting</Link></div>
                </div>
              ) : (
                data.upcomingMeetings.map((m) => (
                  <Link key={m.id} href={`/meetings/${m.id}`} className="flex items-center justify-between rounded-xl border border-arjun-line p-3 transition-colors hover:border-emerald-500/40">
                    <div>
                      <div className="text-sm font-medium">{m.title}</div>
                      <div className="text-xs text-arjun-muted">
                        {m.scheduledAt ? new Date(m.scheduledAt).toLocaleString() : 'Instant meeting'} · {m.isHost ? 'Host' : 'Guest'}
                      </div>
                    </div>
                    <ArrowRight size={15} className="text-arjun-muted" />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent messages</CardTitle>
              <Link href="/messages" className="text-xs text-emerald-300 hover:text-emerald-200">Inbox →</Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.recentMessages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-arjun-line p-4 text-center text-sm text-arjun-muted">
                  No messages yet.
                  <div className="mt-2"><Link href="/community" className="btn-ghost !py-1.5 text-xs"><MessagesSquare size={13} /> Find traders</Link></div>
                </div>
              ) : (
                data.recentMessages.map((m) => (
                  <Link key={m.id} href={`/messages/${m.conversationId}`} className="flex items-start gap-3 rounded-xl border border-arjun-line p-3 transition-colors hover:border-emerald-500/40">
                    <Avatar src={m.sender.avatarUrl} name={m.sender.displayName} size={32} />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-emerald-200">{m.sender.displayName ?? 'Trader'}</div>
                      <div className="truncate text-sm text-arjun-muted">{m.content ?? 'Attachment'}</div>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PeriodRow({ label, value, currency, bold }: { label: string; value: number; currency: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'border-t border-arjun-line pt-3' : ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold' : 'text-arjun-muted'}`}>{label}</span>
      <PriceChange value={value} className={bold ? 'text-base font-semibold' : ''} />
    </div>
  );
}
