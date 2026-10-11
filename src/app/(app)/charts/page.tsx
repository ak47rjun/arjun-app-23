'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Copy, Eye, Globe, LineChart, Loader2, Lock, Share2, Trash2, Users } from 'lucide-react';
import { Avatar, Badge, Button, EmptyState, PageHeader, Tabs } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

interface ShareRow {
  id: string;
  title: string;
  symbol: string;
  timeframe: string;
  bias: string | null;
  visibility: 'PRIVATE' | 'GROUP' | 'PUBLIC';
  linkToken: string;
  viewCount: number;
  createdAt: string;
  owner?: { id: string; displayName: string | null; avatarUrl: string | null };
  group?: { id: string; name: string } | null;
  snapshot?: { imageUrl: string | null } | null;
}

export default function SharedChartsPage() {
  const [tab, setTab] = useState('mine');
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ shares: ShareRow[] }>(`/api/charts/shares?scope=${tab}`);
      setShares(data.shares);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to load shares');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/s/${token}`);
    toast.success('Link copied');
  };

  const del = async (id: string) => {
    try {
      await api.del(`/api/charts/shares/${id}`);
      setShares((cur) => cur.filter((s) => s.id !== id));
      toast.success('Share deleted');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to delete');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shared Charts"
        description="Chart setups you've shared, and setups shared with your groups. Private links only open for you; public links open for anyone."
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'mine', label: 'My shares', count: tab === 'mine' ? shares.length : undefined },
          { id: 'groups', label: 'From my groups' },
        ]}
      />

      {loading ? (
        <div className="card flex items-center justify-center py-16"><Loader2 className="animate-spin text-emerald-400" /></div>
      ) : shares.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title={tab === 'mine' ? 'No shared charts yet' : 'No group shares yet'}
          description={tab === 'mine' ? 'Open the terminal and click "Share chart" to publish a setup with your analysis.' : 'Charts shared with groups you belong to will appear here.'}
          action={tab === 'mine' ? <Link href="/terminal" className="btn-ghost">Open terminal</Link> : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shares.map((s) => (
            <div key={s.id} className="card flex flex-col">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-emerald-200">{s.symbol}</span>
                  <Badge variant="neutral">{s.timeframe}</Badge>
                  {s.bias && <Badge variant={s.bias === 'BULLISH' ? 'success' : s.bias === 'BEARISH' ? 'danger' : 'neutral'}>{s.bias}</Badge>}
                </div>
                {s.visibility === 'PRIVATE' ? <Lock size={14} className="text-arjun-muted" /> : s.visibility === 'PUBLIC' ? <Globe size={14} className="text-emerald-300" /> : <Users size={14} className="text-cyan-300" />}
              </div>
              <h3 className="font-display text-base font-semibold">{s.title}</h3>
              {s.owner && (
                <div className="mt-2 flex items-center gap-2 text-xs text-arjun-muted">
                  <Avatar src={s.owner.avatarUrl} name={s.owner.displayName} size={20} />
                  {s.owner.displayName ?? 'Trader'}
                </div>
              )}
              {s.snapshot?.imageUrl && (
                <img src={s.snapshot.imageUrl} alt={s.title} className="mt-3 max-h-44 rounded-xl border border-arjun-line object-cover" />
              )}
              <div className="mt-4 flex items-center justify-between text-xs text-arjun-muted">
                <span className="flex items-center gap-1"><Eye size={12} /> {s.viewCount} views</span>
                <span>{new Date(s.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <Link href={`/s/${s.linkToken}`} className="btn-ghost flex-1 !py-1.5 text-xs">Open</Link>
                {tab === 'mine' && (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => copyLink(s.linkToken)} aria-label="Copy link">
                      <Copy size={13} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => del(s.id)} aria-label="Delete share">
                      <Trash2 size={13} />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
