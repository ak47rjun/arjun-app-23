import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, MapPin, UserPlus, Users } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireServerSession } from '@/lib/auth/server-session';
import { Avatar, Badge, Button, Card, CardContent, EmptyState, PageHeader } from '@/components/ui';
import { FollowButton } from '@/components/community/follow-button';
import { StartDmButton } from '@/components/community/start-dm-button';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: { id: string } }) {
  const user = await requireServerSession();
  const target = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      profile: true,
      _count: { select: { posts: true, followers: true, following: true, trades: true } },
    },
  });
  if (!target || target.isBanned) notFound();

  const isOwn = target.id === user.id;
  const canSee = isOwn || (target.profile?.isPublic ?? true);
  if (!canSee) notFound();

  const follow = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: user.id, followingId: target.id } },
  });

  let stats: { trades: number; winRate: number | null; netPnl: number | null } | null = null;
  if (isOwn || target.profile?.showStats) {
    const trades = await prisma.trade.findMany({
      where: { userId: target.id, status: 'CLOSED', netPnl: { not: null } },
      select: { netPnl: true },
    });
    const wins = trades.filter((t) => Number(t.netPnl) > 0).length;
    stats = {
      trades: trades.length,
      winRate: trades.length ? wins / trades.length : null,
      netPnl: trades.length ? trades.reduce((s, t) => s + Number(t.netPnl), 0) : null,
    };
  }

  const posts = await prisma.post.findMany({
    where: { authorId: target.id, deletedAt: null, visibility: 'PUBLIC' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { _count: { select: { comments: true, reactions: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="card relative overflow-hidden">
        <div className="absolute inset-0 bg-aurora opacity-60" />
        <div className="relative flex flex-wrap items-center gap-5">
          <Avatar src={target.avatarUrl} name={target.displayName} size={88} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold">{target.displayName ?? 'Trader'}</h1>
              {target.profile?.verifiedBadge && <Badge variant="cyan">✓ Verified trader</Badge>}
              {isOwn && <Badge variant="neutral">This is you</Badge>}
            </div>
            {target.bio && <p className="mt-1 max-w-xl text-sm text-arjun-muted">{target.bio}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-arjun-muted">
              <span className="flex items-center gap-1"><Users size={12} /> {target._count.followers} followers · {target._count.following} following</span>
              {target.profile?.country && <span className="flex items-center gap-1"><MapPin size={12} /> {target.profile.country}</span>}
              <span className="flex items-center gap-1"><CalendarDays size={12} /> Joined {new Date(target.createdAt).toLocaleDateString()}</span>
              {target.profile?.experienceYears !== null && target.profile?.experienceYears !== undefined && (
                <span>{target.profile.experienceYears} yrs experience</span>
              )}
            </div>
            {target.profile?.preferredMarkets && target.profile.preferredMarkets.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {target.profile.preferredMarkets.map((m) => (
                  <Badge key={m} variant="neutral">{m}</Badge>
                ))}
              </div>
            )}
          </div>
          {!isOwn && (
            <div className="flex gap-2">
              <FollowButton targetId={target.id} initialFollowing={Boolean(follow)} />
              <StartDmButton targetId={target.id} />
            </div>
          )}
        </div>
      </div>

      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardContent><div className="text-xs uppercase tracking-wider text-arjun-muted">Closed trades</div><div className="mt-1 font-mono text-2xl font-semibold">{stats.trades}</div></CardContent></Card>
          <Card><CardContent><div className="text-xs uppercase tracking-wider text-arjun-muted">Win rate (self-reported)</div><div className="mt-1 font-mono text-2xl font-semibold">{stats.winRate === null ? '—' : `${(stats.winRate * 100).toFixed(1)}%`}</div></CardContent></Card>
          <Card><CardContent><div className="text-xs uppercase tracking-wider text-arjun-muted">Net P&L (self-reported)</div><div className={`mt-1 font-mono text-2xl font-semibold ${(stats.netPnl ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{stats.netPnl === null ? '—' : `$${stats.netPnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}</div></CardContent></Card>
        </div>
      )}
      {!stats && !isOwn && (
        <div className="rounded-xl border border-arjun-line bg-white/[0.02] p-4 text-sm text-arjun-muted">
          This trader hasn&apos;t made their performance stats public.
        </div>
      )}

      <div>
        <h2 className="mb-4 font-display text-lg font-semibold">Posts</h2>
        {posts.length === 0 ? (
          <EmptyState icon={UserPlus} title="No public posts" description="This trader hasn't shared any analysis yet." />
        ) : (
          <div className="space-y-3">
            {posts.map((p) => (
              <Card key={p.id}>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{p.content}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-arjun-muted">
                    <span>{new Date(p.createdAt).toLocaleString()}</span>
                    <span>{p._count.reactions} reactions · {p._count.comments} comments</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-arjun-muted">
        Performance figures are self-reported by the trader unless they carry a verified badge. Past performance does not guarantee future results.
      </p>
    </div>
  );
}
