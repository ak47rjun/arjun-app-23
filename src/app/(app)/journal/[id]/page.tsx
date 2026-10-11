import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ImageIcon, TrendingDown, TrendingUp } from 'lucide-react';
import { requireServerSession } from '@/lib/auth/server-session';
import { prisma } from '@/lib/prisma';
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, PriceChange } from '@/components/ui';
import { TradeActions } from '@/components/journal/trade-actions';
import { ScreenshotUploader } from '@/components/journal/screenshot-uploader';

export const dynamic = 'force-dynamic';

async function getTrade(id: string, userId: string) {
  const trade = await prisma.trade.findUnique({
    where: { id },
    include: { instrument: true, strategy: true, tags: true, screenshots: true, account: true },
  });
  if (!trade) return null;
  // ownership enforced server-side — private journals never leak
  if (trade.userId !== userId) return null;
  return trade;
}

export default async function TradeDetailPage({ params }: { params: { id: string } }) {
  const user = await requireServerSession();
  const trade = await getTrade(params.id, user.id);
  if (!trade) notFound();

  const netPnl = trade.netPnl === null ? null : Number(trade.netPnl);
  const grossPnl = trade.grossPnl === null ? null : Number(trade.grossPnl);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/journal" className="mb-2 inline-flex items-center gap-1.5 text-sm text-arjun-muted hover:text-arjun-text">
          <ArrowLeft size={14} /> Back to journal
        </Link>
        <PageHeader
          title={`${trade.symbol} · ${trade.direction}`}
          description={`Opened ${new Date(trade.entryTime).toLocaleString()} UTC`}
          actions={<TradeActions tradeId={trade.id} />}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm text-arjun-muted">Net P&L</CardTitle></CardHeader>
          <CardContent>
            {netPnl === null ? (
              <span className="text-2xl text-arjun-muted">Open trade</span>
            ) : (
              <div className="flex items-center gap-2">
                {netPnl >= 0 ? <TrendingUp className="text-emerald-300" /> : <TrendingDown className="text-rose-300" />}
                <PriceChange value={netPnl} className="!text-2xl font-semibold" />
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-arjun-muted">Gross P&L</CardTitle></CardHeader>
          <CardContent>
            <span className="font-mono text-xl">{grossPnl === null ? '—' : `$${grossPnl.toFixed(2)}`}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-arjun-muted">Costs (fees + commission + swap)</CardTitle></CardHeader>
          <CardContent>
            <span className="font-mono text-xl">${(Number(trade.fees) + Number(trade.commission) + Number(trade.swap)).toFixed(2)}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-arjun-muted">Planned R:R</CardTitle></CardHeader>
          <CardContent>
            <span className="font-mono text-xl">{trade.rewardToRisk === null ? '—' : `${Number(trade.rewardToRisk).toFixed(2)}R`}</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Execution</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Field label="Status"><Badge variant={trade.status === 'OPEN' ? 'cyan' : 'neutral'}>{trade.status}</Badge></Field>
              <Field label="Source"><Badge variant="neutral">{trade.source === 'MT5_IMPORT' ? 'MT5 import' : 'Manual'}</Badge></Field>
              <Field label="Direction"><Badge variant={trade.direction === 'LONG' ? 'success' : 'danger'}>{trade.direction}</Badge></Field>
              <Field label="Quantity"><span className="font-mono">{Number(trade.quantity)}</span></Field>
              <Field label="Entry price"><span className="font-mono">{Number(trade.entryPrice)}</span></Field>
              <Field label="Exit price"><span className="font-mono">{trade.exitPrice === null ? '—' : Number(trade.exitPrice)}</span></Field>
              <Field label="Stop-loss"><span className="font-mono">{trade.stopLoss === null ? '—' : Number(trade.stopLoss)}</span></Field>
              <Field label="Take-profit"><span className="font-mono">{trade.takeProfit === null ? '—' : Number(trade.takeProfit)}</span></Field>
              <Field label="Entry time (UTC)">{new Date(trade.entryTime).toLocaleString()}</Field>
              <Field label="Exit time (UTC)">{trade.exitTime ? new Date(trade.exitTime).toLocaleString() : '—'}</Field>
              <Field label="Instrument">{trade.instrument?.name ?? trade.symbol}</Field>
              <Field label="Contract size"><span className="font-mono">{Number(trade.instrument?.contractSize ?? 1).toLocaleString()}</span></Field>
              <Field label="Account">{trade.account?.name ?? '—'}</Field>
              <Field label="Strategy">{trade.strategy?.name ?? '—'}</Field>
              <Field label="Timeframe">{trade.timeframe ?? '—'}</Field>
              <Field label="Setup">{trade.setup ?? '—'}</Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Analysis & discipline</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Block label="Trade thesis" value={trade.thesis} />
            <Block label="Market conditions" value={trade.marketConditions} />
            <Block label="Execution notes" value={trade.notes} />
            <Block label="Lessons learned" value={trade.lessons} />
            <div className="grid grid-cols-3 gap-4">
              <Field label="Emotion">{trade.emotion ?? '—'}</Field>
              <Field label="Discipline">{trade.disciplineRating ? `${trade.disciplineRating}/10` : '—'}</Field>
              <Field label="Rules followed">
                {trade.rulesFollowed === null ? '—' : trade.rulesFollowed ? <Badge variant="success">Yes</Badge> : <Badge variant="danger">No</Badge>}
              </Field>
            </div>
            {trade.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {trade.tags.map((t) => (
                  <span key={t.id} className="rounded-full border px-2.5 py-0.5 text-xs" style={{ borderColor: t.color, color: t.color }}>
                    {t.name}
                  </span>
                ))}
              </div>
            )}
            {trade.plannedEntry !== null && (
              <div className="rounded-xl border border-arjun-line p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-arjun-muted">Planned vs actual</div>
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <Field label="Planned entry"><span className="font-mono">{Number(trade.plannedEntry)}</span></Field>
                  <Field label="Planned stop"><span className="font-mono">{trade.plannedStop === null ? '—' : Number(trade.plannedStop)}</span></Field>
                  <Field label="Planned target"><span className="font-mono">{trade.plannedTarget === null ? '—' : Number(trade.plannedTarget)}</span></Field>
                </dl>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Screenshots</CardTitle>
        </CardHeader>
        <CardContent>
          {trade.screenshots.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-arjun-line py-10 text-center text-sm text-arjun-muted">
              <ImageIcon size={20} />
              No screenshots attached. Upload before/after charts from this page.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {trade.screenshots.map((s) => (
                <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="group relative overflow-hidden rounded-xl border border-arjun-line">
                  <img src={s.url} alt={s.caption ?? 'Trade screenshot'} className="aspect-video w-full object-cover transition-transform group-hover:scale-105" />
                  <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                    {s.kind === 'BEFORE' ? 'Before entry' : 'After exit'}
                  </span>
                </a>
              ))}
            </div>
          )}
          <div className="mt-4">
            <ScreenshotUploader tradeId={trade.id} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-arjun-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Block({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-arjun-muted">{label}</div>
      <p className="mt-1 whitespace-pre-wrap leading-relaxed">{value}</p>
    </div>
  );
}
