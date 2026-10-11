'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Heart, Laugh, Loader2, MessageCircle, Plus, Repeat2, Send, TrendingDown, TrendingUp, Users, UserPlus, Flag } from 'lucide-react';
import { Avatar, Badge, Button, EmptyState, Input, Label, Modal, PageHeader, Tabs } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';
import { cn } from '@/lib/cn';

interface Author {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  profile?: { verifiedBadge: boolean } | null;
}

interface Post {
  id: string;
  content: string;
  mediaUrls: string[];
  createdAt: string;
  author: Author;
  group?: { id: string; name: string; slug: string } | null;
  _count: { comments: number; reactions: number };
  myReaction?: 'LIKE' | 'LOVE' | 'BULLISH' | 'BEARISH' | null;
}

interface GroupRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  visibility: 'PUBLIC' | 'PRIVATE';
  isMember: boolean;
  _count: { members: number; posts: number };
}

interface TraderRow {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isFollowing: boolean;
  _count: { followers: number };
}

const REACTIONS = [
  { type: 'LIKE' as const, icon: Heart, label: 'Like' },
  { type: 'LOVE' as const, icon: Heart, label: 'Love' },
  { type: 'BULLISH' as const, icon: TrendingUp, label: 'Bullish' },
  { type: 'BEARISH' as const, icon: TrendingDown, label: 'Bearish' },
  { type: 'LOVE' as const, icon: Laugh, label: 'Laugh', alt: true },
];

export default function CommunityPage() {
  const { user } = useSession();
  const [tab, setTab] = useState('feed');
  const [posts, setPosts] = useState<Post[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [traders, setTraders] = useState<TraderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '', visibility: 'PUBLIC' as 'PUBLIC' | 'PRIVATE' });
  const [traderQuery, setTraderQuery] = useState('');

  const loadFeed = useCallback(async () => {
    const data = await api.get<{ posts: Post[] }>('/api/feed?limit=30');
    setPosts(data.posts);
  }, []);

  const loadGroups = useCallback(async () => {
    const data = await api.get<{ groups: GroupRow[] }>('/api/groups');
    setGroups(data.groups);
  }, []);

  const loadTraders = useCallback(async () => {
    const data = await api.get<{ users: TraderRow[] }>('/api/users/search?q=');
    setTraders(data.users);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadFeed(), loadGroups(), loadTraders()])
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load community'))
      .finally(() => setLoading(false));
  }, [loadFeed, loadGroups, loadTraders]);

  useEffect(() => {
    if (traderQuery.trim().length < 2) {
      void loadTraders();
      return;
    }
    const t = setTimeout(async () => {
      const data = await api.get<{ users: TraderRow[] }>(`/api/users/search?q=${encodeURIComponent(traderQuery)}`);
      setTraders(data.users);
    }, 300);
    return () => clearTimeout(t);
  }, [traderQuery, loadTraders]);

  const submitPost = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      const { post } = await api.post<{ post: Post }>('/api/posts', { content: draft });
      setPosts((cur) => [{ ...post, myReaction: null, _count: post._count ?? { comments: 0, reactions: 0 } }, ...cur]);
      setDraft('');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  const react = async (postId: string, type: 'LIKE' | 'LOVE' | 'BULLISH' | 'BEARISH') => {
    setPosts((cur) =>
      cur.map((p) => (p.id === postId ? { ...p, myReaction: p.myReaction === type ? null : type, _count: { ...p._count, reactions: p._count.reactions + (p.myReaction === type ? -1 : p.myReaction ? 0 : 1) } } : p)),
    );
    try {
      await api.post(`/api/posts/${postId}/reactions`, { type });
    } catch {
      /* optimistic */
    }
  };

  const toggleFollow = async (traderId: string) => {
    setTraders((cur) => cur.map((t) => (t.id === traderId ? { ...t, isFollowing: !t.isFollowing } : t)));
    try {
      const t = traders.find((x) => x.id === traderId);
      if (t?.isFollowing) await api.del(`/api/users/${traderId}/follow`);
      else await api.post(`/api/users/${traderId}/follow`);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed');
    }
  };

  const joinGroup = async (groupId: string) => {
    try {
      await api.post(`/api/groups/${groupId}/join`);
      await loadGroups();
      toast.success('Joined group');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Could not join');
    }
  };

  const createGroup = async () => {
    try {
      await api.post('/api/groups', newGroup);
      setGroupOpen(false);
      setNewGroup({ name: '', description: '', visibility: 'PUBLIC' });
      await loadGroups();
      toast.success('Group created');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to create group');
    }
  };

  const reportPost = async (postId: string) => {
    try {
      await api.post('/api/reports', { targetType: 'POST', targetId: postId, reason: 'Reported from community feed' });
      toast.success('Report submitted — moderators will review it');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to report');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Community"
        description="Share analysis, follow traders and join strategy groups. Performance claims are self-reported unless a trader is verified."
        actions={<Button onClick={() => setGroupOpen(true)}><Plus size={15} /> Create group</Button>}
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'feed', label: 'Feed', count: posts.length },
          { id: 'groups', label: 'Groups', count: groups.length },
          { id: 'traders', label: 'Traders' },
        ]}
      />

      {loading ? (
        <div className="card flex items-center justify-center py-16"><Loader2 className="animate-spin text-emerald-400" /></div>
      ) : (
        <>
          {tab === 'feed' && (
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="space-y-4">
                {/* composer */}
                <div className="card">
                  <div className="flex gap-3">
                    <Avatar src={user?.avatarUrl} name={user?.displayName} size={40} />
                    <div className="flex-1">
                      <textarea
                        className="input min-h-[70px]"
                        placeholder="Share an idea, a chart, a lesson…"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                      />
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" onClick={submitPost} disabled={posting || !draft.trim()}>
                          {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Post
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {posts.length === 0 ? (
                  <EmptyState icon={Users} title="The feed is quiet" description="Be the first to share an idea — or follow traders to see their posts here." />
                ) : (
                  posts.map((p) => (
                    <PostCard key={p.id} post={p} onReact={react} onReport={reportPost} />
                  ))
                )}
              </div>

              <div className="space-y-4">
                <div className="card">
                  <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-arjun-muted">Top groups</h3>
                  <div className="space-y-2">
                    {groups.slice(0, 5).map((g) => (
                      <div key={g.id} className="flex items-center justify-between gap-2">
                        <Link href={`/community/groups/${g.id}`} className="min-w-0 truncate text-sm hover:text-emerald-200">
                          {g.name} <span className="text-xs text-arjun-muted">· {g._count.members}</span>
                        </Link>
                        {!g.isMember && (
                          <Button variant="ghost" size="sm" onClick={() => joinGroup(g.id)}>Join</Button>
                        )}
                      </div>
                    ))}
                    {groups.length === 0 && <p className="text-sm text-arjun-muted">No groups yet.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'groups' && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {groups.map((g) => (
                <div key={g.id} className="card flex flex-col">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge variant={g.visibility === 'PUBLIC' ? 'success' : 'neutral'}>{g.visibility}</Badge>
                    {g.isMember && <Badge variant="cyan">Member</Badge>}
                  </div>
                  <h3 className="font-display text-lg font-semibold">{g.name}</h3>
                  <p className="mt-1 line-clamp-2 flex-1 text-sm text-arjun-muted">{g.description ?? 'No description'}</p>
                  <div className="mt-4 flex items-center justify-between text-xs text-arjun-muted">
                    <span>{g._count.members} members · {g._count.posts} posts</span>
                    {g.isMember ? (
                      <Link href={`/community/groups/${g.id}`} className="text-emerald-300 hover:text-emerald-200">Open →</Link>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => joinGroup(g.id)}>Join</Button>
                    )}
                  </div>
                </div>
              ))}
              {groups.length === 0 && (
                <div className="col-span-full">
                  <EmptyState icon={Users} title="No groups yet" description="Create the first strategy group and invite traders." action={<Button onClick={() => setGroupOpen(true)}>Create group</Button>} />
                </div>
              )}
            </div>
          )}

          {tab === 'traders' && (
            <div className="space-y-4">
              <Input value={traderQuery} onChange={(e) => setTraderQuery(e.target.value)} placeholder="Search traders…" className="max-w-md" />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {traders.map((t) => (
                  <div key={t.id} className="card flex items-center gap-3">
                    <Avatar src={t.avatarUrl} name={t.displayName} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/profiles/${t.id}`} className="truncate font-semibold hover:text-emerald-200">{t.displayName}</Link>
                      </div>
                      <div className="text-xs text-arjun-muted">{t._count.followers} followers</div>
                    </div>
                    <Button size="sm" variant={t.isFollowing ? 'ghost' : 'secondary'} onClick={() => toggleFollow(t.id)}>
                      {t.isFollowing ? 'Following' : <><UserPlus size={13} /> Follow</>}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Modal open={groupOpen} onClose={() => setGroupOpen(false)} title="Create a group" description="Groups get their own feed, chat and shared charts.">
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} placeholder="e.g. ICT Concepts" />
          </div>
          <div>
            <Label>Description</Label>
            <textarea className="input" value={newGroup.description} onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })} placeholder="What is this group about?" />
          </div>
          <div>
            <Label>Visibility</Label>
            <select className="input" value={newGroup.visibility} onChange={(e) => setNewGroup({ ...newGroup, visibility: e.target.value as never })}>
              <option value="PUBLIC">Public — anyone can join</option>
              <option value="PRIVATE">Private — members must be added</option>
            </select>
          </div>
          <div className="flex justify-end">
            <Button onClick={createGroup} disabled={!newGroup.name.trim()}>Create group</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PostCard({
  post,
  onReact,
  onReport,
}: {
  post: Post;
  onReact: (postId: string, type: 'LIKE' | 'LOVE' | 'BULLISH' | 'BEARISH') => void;
  onReport: (postId: string) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<{ id: string; content: string; author: { displayName: string | null } }[]>([]);
  const [commentDraft, setCommentDraft] = useState('');

  const loadComments = async () => {
    const data = await api.get<{ comments: typeof comments }>(`/api/posts/${post.id}/comments`);
    setComments(data.comments);
  };

  const addComment = async () => {
    if (!commentDraft.trim()) return;
    try {
      await api.post(`/api/posts/${post.id}/comments`, { content: commentDraft });
      setCommentDraft('');
      await loadComments();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to comment');
    }
  };

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <Avatar src={post.author.avatarUrl} name={post.author.displayName} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link href={`/profiles/${post.author.id}`} className="font-semibold hover:text-emerald-200">{post.author.displayName ?? 'Trader'}</Link>
            {post.author.profile?.verifiedBadge && <Badge variant="cyan">Verified</Badge>}
            <span className="text-xs text-arjun-muted">{new Date(post.createdAt).toLocaleString()}</span>
            {post.group && <Badge variant="neutral">{post.group.name}</Badge>}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{post.content}</p>
          {post.mediaUrls.map((url) => (
            <img key={url} src={url} alt="attachment" className="mt-3 max-h-80 rounded-xl border border-arjun-line" />
          ))}

          <div className="mt-3 flex items-center gap-1 border-t border-arjun-line pt-2">
            {REACTIONS.map((r, i) => {
              const Icon = r.icon;
              const active = post.myReaction === r.type && !r.alt;
              return (
                <button
                  key={`${r.type}-${i}`}
                  onClick={() => onReact(post.id, r.type)}
                  className={cn('flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-white/5', active && 'text-emerald-300')}
                >
                  <Icon size={14} className={r.type === 'BEARISH' ? 'text-rose-300' : r.type === 'BULLISH' ? 'text-emerald-300' : ''} />
                </button>
              );
            })}
            <span className="ml-1 text-xs text-arjun-muted">{post._count.reactions > 0 ? post._count.reactions : ''}</span>
            <button
              onClick={() => {
                setShowComments((v) => !v);
                if (!showComments) void loadComments();
              }}
              className="ml-2 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-arjun-muted hover:bg-white/5 hover:text-arjun-text"
            >
              <MessageCircle size={14} /> {post._count.comments}
            </button>
            <button onClick={() => onReport(post.id)} className="ml-auto rounded-lg px-2 py-1 text-xs text-arjun-muted hover:bg-white/5 hover:text-rose-300" aria-label="Report post">
              <Flag size={13} />
            </button>
          </div>

          {showComments && (
            <div className="mt-3 space-y-2 border-t border-arjun-line pt-3">
              {comments.map((c) => (
                <div key={c.id} className="text-sm">
                  <span className="font-semibold text-emerald-200">{c.author.displayName}: </span>
                  <span className="text-arjun-muted">{c.content}</span>
                </div>
              ))}
              <div className="flex gap-2">
                <Input value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} placeholder="Write a comment…" className="h-8" />
                <Button size="sm" variant="secondary" onClick={addComment}>Send</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
