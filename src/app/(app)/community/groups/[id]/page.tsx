'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, LogOut, Send, Users } from 'lucide-react';
import { Avatar, Badge, Button, EmptyState, PageHeader } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

interface GroupInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: 'PUBLIC' | 'PRIVATE';
  isMember: boolean;
  myRole: string | null;
  owner: { id: string; displayName: string | null };
  _count: { members: number; posts: number };
}

interface MemberRow {
  userId: string;
  role: string;
  user: { id: string; displayName: string | null; avatarUrl: string | null; profile?: { verifiedBadge: boolean } | null };
}

interface Post {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; displayName: string | null; avatarUrl: string | null };
  _count: { comments: number; reactions: number };
}

export default function GroupDetailPage() {
  const params = useParams<{ id: string }>();
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [g, m, p] = await Promise.all([
        api.get<{ group: GroupInfo }>(`/api/groups/${params.id}`),
        api.get<{ members: MemberRow[] }>(`/api/groups/${params.id}/members`).catch(() => ({ members: [] as MemberRow[] })),
        api.get<{ posts: Post[] }>(`/api/posts?groupId=${params.id}`).catch(() => ({ posts: [] as Post[] })),
      ]);
      setGroup(g.group);
      setMembers(m.members);
      setPosts(p.posts);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to load group');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const join = async () => {
    try {
      await api.post(`/api/groups/${group!.id}/join`);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Could not join');
    }
  };

  const leave = async () => {
    try {
      await api.del(`/api/groups/${group!.id}/join`);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Could not leave');
    }
  };

  const submitPost = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      const { post } = await api.post<{ post: Post }>('/api/posts', { content: draft, groupId: group!.id });
      setPosts((cur) => [post as Post, ...cur]);
      setDraft('');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="animate-spin text-emerald-400" size={28} /></div>;
  if (!group) return <EmptyState icon={Users} title="Group not found" description="This group may be private or deleted." />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={group.name}
        description={`${group.description ?? 'No description'} · ${group._count.members} members · owner ${group.owner.displayName ?? '—'}`}
        actions={
          group.isMember ? (
            <Button variant="ghost" size="sm" onClick={leave}><LogOut size={14} /> Leave</Button>
          ) : (
            <Button size="sm" onClick={join}>Join group</Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={group.visibility === 'PUBLIC' ? 'success' : 'neutral'}>{group.visibility}</Badge>
        {group.isMember && <Badge variant="cyan">{group.myRole ?? 'MEMBER'}</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {group.isMember && (
            <div className="card">
              <div className="flex gap-2">
                <textarea className="input min-h-[60px] flex-1" placeholder={`Post to ${group.name}…`} value={draft} onChange={(e) => setDraft(e.target.value)} />
                <Button size="sm" onClick={submitPost} disabled={posting || !draft.trim()}>
                  {posting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                </Button>
              </div>
            </div>
          )}
          {posts.length === 0 ? (
            <EmptyState icon={Users} title="No posts yet" description="Be the first to share analysis in this group." />
          ) : (
            posts.map((p) => (
              <div key={p.id} className="card">
                <div className="mb-2 flex items-center gap-2">
                  <Avatar src={p.author.avatarUrl} name={p.author.displayName} size={30} />
                  <span className="text-sm font-medium">{p.author.displayName ?? 'Trader'}</span>
                  <span className="ml-auto text-xs text-arjun-muted">{new Date(p.createdAt).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{p.content}</p>
                <div className="mt-2 text-xs text-arjun-muted">{p._count.reactions} reactions · {p._count.comments} comments</div>
              </div>
            ))
          )}
        </div>

        <div className="card h-fit">
          <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-arjun-muted">Members ({members.length})</h3>
          <div className="space-y-2">
            {members.map((m) => (
              <Link key={m.userId} href={`/profiles/${m.userId}`} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-white/5">
                <Avatar src={m.user.avatarUrl} name={m.user.displayName} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm">{m.user.displayName ?? 'Trader'}</span>
                {m.role !== 'MEMBER' && <Badge variant="neutral">{m.role}</Badge>}
                {m.user.profile?.verifiedBadge && <Badge variant="cyan">✓</Badge>}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
