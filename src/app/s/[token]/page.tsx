import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Eye, Share2 } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getShareByToken } from '@/lib/charts/access';
import { getServerSessionUser } from '@/lib/auth/server-session';
import { Avatar, Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { TradingViewWidget } from '@/components/terminal/tradingview-widget';
import { toTvSymbol } from '@/lib/market/tv-symbol';
import { SharedChartNotes } from '@/components/charts/shared-chart-notes';

export const dynamic = 'force-dynamic';

/**
 * Public/shared chart view. PRIVATE shares are only reachable via their
 * unguessable link token; PUBLIC shares are open; GROUP shares require
 * membership (enforced in canViewShare for the API; here we resolve by token
 * and check group membership explicitly).
 */
export default async function SharedChartPage({ params }: { params: { token: string } }) {
  const share = await getShareByToken(params.token);
  if (!share) notFound();

  const viewer = await getServerSessionUser();

  // GROUP shares require membership
  if (share.visibility === 'GROUP') {
    if (!viewer || !share.groupId) notFound();
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: share.groupId, userId: viewer.id } },
    });
    if (!membership) notFound();
  }

  // PRIVATE shares: link-token holders may view (owner or anyone with the link)
  const isOwner = viewer?.id === share.ownerId;
  if (share.visibility === 'PRIVATE' && !isOwner) {
    // allowed via unguessable token — that is the access control for PRIVATE
  }

  await prisma.chartShare.update({
    where: { id: share.id },
    data: { viewCount: { increment: 1 } },
  }).catch(() => {});

  const instrument = await prisma.instrument.findUnique({ where: { symbol: share.symbol } });

  return (
    <main className="min-h-screen">
      <header className="border-b border-arjun-line bg-arjun-bg2/70 backdrop-blur-glass">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 font-display font-bold text-white shadow-glow">A</div>
            <span className="font-display text-xl font-bold text-gradient">ARJUN</span>
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant={share.visibility === 'PUBLIC' ? 'success' : share.visibility === 'GROUP' ? 'cyan' : 'neutral'}>
              {share.visibility === 'PRIVATE' ? 'Private link' : share.visibility}
            </Badge>
            {viewer ? (
              <Link href="/dashboard" className="btn-ghost !py-1.5 text-xs">Open ARJUN</Link>
            ) : (
              <Link href="/register" className="btn-primary !py-1.5 text-xs">Join ARJUN</Link>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div>
          <Link href={viewer ? '/charts' : '/'} className="mb-2 inline-flex items-center gap-1.5 text-sm text-arjun-muted hover:text-arjun-text">
            <ArrowLeft size={14} /> Back
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold">{share.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-arjun-muted">
                <span className="font-mono font-semibold text-emerald-200">{share.symbol}</span>
                <Badge variant="neutral">{share.timeframe}</Badge>
                {share.bias && <Badge variant={share.bias === 'BULLISH' ? 'success' : share.bias === 'BEARISH' ? 'danger' : 'neutral'}>{share.bias}</Badge>}
                <span className="flex items-center gap-1.5"><Eye size={13} /> {share.viewCount + 1} views</span>
                <span>{new Date(share.createdAt).toLocaleString()}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Avatar src={share.owner.avatarUrl} name={share.owner.displayName} size={36} />
              <div className="text-sm">
                <div className="font-medium">{share.owner.displayName ?? 'Trader'}</div>
                {share.owner.profile?.verifiedBadge && <Badge variant="cyan">Verified</Badge>}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="overflow-hidden rounded-2xl border border-arjun-line bg-[#04120c]">
            <div className="h-[560px]">
              <TradingViewWidget symbol={toTvSymbol(share.symbol, instrument?.type ?? undefined)} interval={share.timeframe} containerId="shared-tv-chart" />
            </div>
            <div className="border-t border-arjun-line p-2 text-center text-[11px] text-arjun-muted">
              Chart: TradingView widget (free-tier data may be delayed) · times UTC
            </div>
          </div>

          <div className="space-y-4">
            {share.snapshot?.imageUrl && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Snapshot</CardTitle></CardHeader>
                <CardContent>
                  <img src={share.snapshot.imageUrl} alt="Chart snapshot" className="w-full rounded-xl border border-arjun-line" />
                </CardContent>
              </Card>
            )}

            {(share.entry || share.stopLoss || share.takeProfit) && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Levels</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {share.entry && <LevelRow label="Entry" value={Number(share.entry)} />}
                  {share.stopLoss && <LevelRow label="Stop-loss" value={Number(share.stopLoss)} className="text-rose-300" />}
                  {share.takeProfit && <LevelRow label="Take-profit" value={Number(share.takeProfit)} className="text-emerald-300" />}
                </CardContent>
              </Card>
            )}

            {share.analysis && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Analysis</CardTitle></CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{share.analysis}</p>
                </CardContent>
              </Card>
            )}

            <SharedChartNotes shareId={share.id} isLoggedIn={Boolean(viewer)} />
          </div>
        </div>

        <p className="text-center text-xs text-arjun-muted">
          Shared via ARJUN — The Real Trader&apos;s Hub · Not financial advice · Past performance does not guarantee future results
        </p>
      </div>
    </main>
  );
}

function LevelRow({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-arjun-muted">{label}</span>
      <span className={`font-mono ${className ?? ''}`}>{value}</span>
    </div>
  );
}
