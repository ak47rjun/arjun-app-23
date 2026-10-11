'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, ImagePlus, Loader2, MessagesSquare, MoreVertical, Paperclip, Pencil, Plus, Search, Send, Smile, Trash2, Users, X,
} from 'lucide-react';
import { Avatar, Badge, Button, EmptyState, Input, Label, Modal, PageHeader, Select, Skeleton } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';
import { realtime } from '@/lib/client/realtime';
import { useSession } from '@/lib/client/session';
import { cn } from '@/lib/cn';

interface ChatUser {
  id: string;
  displayName: string | null;
  name: string | null;
  avatarUrl: string | null;
}

interface ConversationRow {
  id: string;
  type: 'DM' | 'GROUP';
  name: string | null;
  avatarUrl: string | null;
  updatedAt: string;
  pinned: boolean;
  muted: boolean;
  members: ChatUser[];
  lastMessage: { id: string; content: string | null; createdAt: string; sender: { id: string } } | null;
  unreadCount: number;
}

interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  sender: ChatUser;
  type: 'TEXT' | 'ATTACHMENT' | 'CHART_SHARE' | 'SYSTEM';
  content: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt?: string | null;
  pinned?: boolean;
  reactions?: { emoji: string; userId: string }[];
  attachment?: { id: string; url: string; filename: string; mimeType: string; size: number; kind: string } | null;
  chartShare?: { id: string; title: string; symbol: string; timeframe: string; linkToken: string; bias: string | null } | null;
}

const EMOJIS = ['👍', '🔥', '😂', '💡', '🚀', '🙏'];

export function MessengerPage() {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const activeId = params?.id ?? '';
  const { user } = useSession();

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [online, setOnline] = useState<Set<string>>(new Set());

  const [searchOpen, setSearchOpen] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<(ChatUser & { isFollowing?: boolean })[]>([]);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');

  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientKeyRef = useRef(0);

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.get<{ conversations: ConversationRow[] }>('/api/conversations');
      setConversations(data.conversations);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to load conversations');
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // realtime: join + live events
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const registered: Array<[string, (payload: any) => void]> = [];
    const bind = (event: string, handler: (payload: any) => void) => {
      realtime.on(event, handler);
      registered.push([event, handler]);
    };
    const onNew = (message: MessageRow) => {
      setMessages((cur) => (cur.some((m) => m.id === message.id) ? cur : [...cur, message]));
      setConversations((cur) =>
        cur.map((c) =>
          c.id === message.conversationId
            ? { ...c, lastMessage: { id: message.id, content: message.content, createdAt: message.createdAt, sender: { id: message.senderId } }, updatedAt: message.createdAt }
            : c,
        ),
      );
      if (message.conversationId !== activeIdRef.current && message.senderId !== user?.id) {
        // badge handled globally; nothing else needed here
      }
    };
    const onEdited = (message: MessageRow) => {
      setMessages((cur) => cur.map((m) => (m.id === message.id ? { ...m, ...message } : m)));
    };
    const onDeleted = (payload: { messageId: string }) => {
      setMessages((cur) => cur.map((m) => (m.id === payload.messageId ? { ...m, content: null, type: 'TEXT', deletedAt: new Date().toISOString() } : m)));
    };
    const onReaction = (payload: { messageId: string; emoji: string; added: boolean; userId: string }) => {
      setMessages((cur) =>
        cur.map((m) => {
          if (m.id !== payload.messageId) return m;
          const reactions = m.reactions ?? [];
          if (payload.added) return { ...m, reactions: [...reactions.filter((r) => !(r.userId === payload.userId && r.emoji === payload.emoji)), { emoji: payload.emoji, userId: payload.userId }] };
          return { ...m, reactions: reactions.filter((r) => !(r.userId === payload.userId && r.emoji === payload.emoji)) };
        }),
      );
    };
    const onTyping = (payload: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (payload.conversationId !== activeIdRef.current) return;
      setTypingUsers((cur) => {
        const next = { ...cur };
        if (payload.isTyping) next[payload.userId] = Date.now();
        else delete next[payload.userId];
        return next;
      });
    };
    const onPresence = (payload: { userId: string; online: boolean }) => {
      setOnline((cur) => {
        const next = new Set(cur);
        if (payload.online) next.add(payload.userId);
        else next.delete(payload.userId);
        return next;
      });
    };
    const onAdded = (payload: { conversationId: string }) => {
      void loadConversations();
      if (payload.conversationId) router.push(`/messages/${payload.conversationId}`);
    };

    void realtime.start({ userId: user.id }).then(() => {
      if (cancelled) return;
      bind('message:new', onNew);
      bind('message:edited', onEdited);
      bind('message:deleted', onDeleted);
      bind('message:reaction', onReaction);
      bind('message:typing', onTyping);
      bind('presence:update', onPresence);
      bind('conversation:added', onAdded);
    });
    return () => {
      cancelled = true;
      for (const [event, handler] of registered) realtime.off(event, handler);
    };
  }, [loadConversations, router, user?.id]);

  // keep a ref of the active conversation for socket callbacks
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // load messages for the active conversation
  const loadMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const data = await api.get<{ messages: MessageRow[] }>(`/api/conversations/${conversationId}/messages?limit=80`);
      setMessages(data.messages);
      await api.post(`/api/conversations/${conversationId}/read`, {});
      await loadConversations();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  }, [loadConversations]);

  useEffect(() => {
    if (activeId) void loadMessages(activeId);
    else setMessages([]);
  }, [activeId, loadMessages]);

  // join the socket room + watch presence of conversation peers
  useEffect(() => {
    if (!activeId) return;
    realtime.joinConversation(activeId);
    const conv = conversations.find((c) => c.id === activeId);
    const peerIds = (conv?.members ?? []).map((m) => m.id).filter((id) => id !== user?.id);
    if (peerIds.length > 0) {
      realtime.watchPresence(peerIds, (online: string[]) => {
        setOnline(new Set(online));
      });
    }
  }, [activeId, conversations, user?.id]);

  // auto-scroll to bottom on new messages
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, activeId]);

  // expire typing indicators
  useEffect(() => {
    const id = setInterval(() => {
      setTypingUsers((cur) => {
        const now = Date.now();
        const entries = Object.entries(cur).filter(([, t]) => now - t < 4000);
        return entries.length === Object.keys(cur).length ? cur : Object.fromEntries(entries);
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const send = async () => {
    if (!activeId || !draft.trim()) return;
    const content = draft.trim();
    setDraft('');
    const clientKey = `ck-${Date.now()}-${clientKeyRef.current++}`;
    // optimistic
    const optimistic: MessageRow = {
      id: clientKey,
      conversationId: activeId,
      senderId: user!.id,
      sender: { id: user!.id, displayName: user!.displayName, name: user!.name, avatarUrl: user!.avatarUrl },
      type: 'TEXT',
      content,
      createdAt: new Date().toISOString(),
      editedAt: null,
      reactions: [],
    };
    setMessages((cur) => [...cur, optimistic]);
    try {
      const res = await api.post<{ message: MessageRow }>(`/api/conversations/${activeId}/messages`, { content, clientKey });
      setMessages((cur) => cur.map((m) => (m.id === clientKey ? res.message : m)));
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Message failed to send');
      setMessages((cur) => cur.filter((m) => m.id !== clientKey));
    }
  };

  const onTyping = () => {
    if (!activeId) return;
    realtime.setTyping(activeId, true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      realtime.setTyping(activeId, false);
    }, 2500);
  };

  const sendAttachment = async (file: File) => {
    if (!activeId) return;
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('kind', 'attachment');
      const { attachment } = await api.upload<{ attachment: { id: string } }>('/api/uploads', form);
      const clientKey = `ck-${Date.now()}-${clientKeyRef.current++}`;
      await api.post(`/api/conversations/${activeId}/messages`, { type: 'ATTACHMENT', attachmentId: attachment.id, clientKey });
      await loadMessages(activeId);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Upload failed');
    }
  };

  const react = async (messageId: string, emoji: string) => {
    setMessages((cur) =>
      cur.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = m.reactions ?? [];
        const mine = reactions.some((r) => r.userId === user!.id && r.emoji === emoji);
        if (mine) return { ...m, reactions: reactions.filter((r) => !(r.userId === user!.id && r.emoji === emoji)) };
        return { ...m, reactions: [...reactions, { emoji, userId: user!.id }] };
      }),
    );
    try {
      await api.post(`/api/messages/${messageId}/reactions`, { emoji });
    } catch {
      /* revert on failure is acceptable for a demo reaction */
    }
  };

  // ── message actions: edit + delete for everyone ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const startEdit = (m: MessageRow) => {
    setConfirmDeleteId(null);
    setEditingId(m.id);
    setEditDraft(m.content ?? '');
  };

  const saveEdit = async (id: string) => {
    const content = editDraft.trim();
    if (!content) return;
    try {
      const res = await api.patch<{ message: MessageRow }>(`/api/messages/${id}`, { content });
      setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, ...res.message } : m)));
      setEditingId(null);
      toast.success('Message edited');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to edit message');
    }
  };

  const deleteForEveryone = async (id: string) => {
    try {
      await api.del(`/api/messages/${id}`);
      setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, content: null, type: 'TEXT', deletedAt: new Date().toISOString() } : m)));
      toast.success('Message deleted for everyone');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to delete message');
    }
    setConfirmDeleteId(null);
  };

  // search users to start a DM
  useEffect(() => {
    if (userQuery.trim().length < 2) {
      setUserResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const data = await api.get<{ users: (ChatUser & { isFollowing?: boolean })[] }>(`/api/users/search?q=${encodeURIComponent(userQuery)}`);
      setUserResults(data.users.filter((u) => u.id !== user?.id));
    }, 250);
    return () => clearTimeout(t);
  }, [userQuery, user?.id]);

  const startDm = async (userId: string) => {
    try {
      const { conversation } = await api.post<{ conversation: { id: string } }>('/api/conversations', { type: 'DM', userId });
      setSearchOpen(false);
      setUserQuery('');
      await loadConversations();
      router.push(`/messages/${conversation.id}`);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Could not start conversation');
    }
  };

  const createGroup = async () => {
    try {
      const { conversation } = await api.post<{ conversation: { id: string } }>('/api/conversations', { type: 'GROUP', name: groupName });
      setGroupOpen(false);
      setGroupName('');
      await loadConversations();
      router.push(`/messages/${conversation.id}`);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Could not create group');
    }
  };

  const active = conversations.find((c) => c.id === activeId);
  const peer = active?.type === 'DM' ? active.members.find((m) => m.id !== user?.id) : null;
  const typingNames = useMemo(() => {
    const conv = conversations.find((c) => c.id === activeId);
    return Object.keys(typingUsers)
      .map((id) => conv?.members.find((m) => m.id === id)?.displayName ?? 'Someone')
      .filter(Boolean);
  }, [typingUsers, conversations, activeId]);

  return (
    <div className="grid h-[calc(100vh-7.5rem)] grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
      {/* ── Conversation list ── */}
      <div className={cn('glass flex flex-col overflow-hidden rounded-2xl', activeId && 'hidden lg:flex')}>
        <div className="border-b border-arjun-line p-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Messages</h2>
            <div className="flex gap-1">
              <Button variant="icon" size="icon" onClick={() => setSearchOpen(true)} aria-label="New message"><Plus size={16} /></Button>
              <Button variant="icon" size="icon" onClick={() => setGroupOpen(true)} aria-label="New group"><Users size={16} /></Button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConversations ? (
            <div className="space-y-2 p-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : conversations.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title="No conversations"
              description="Start a DM with a trader or create a group."
              action={<Button size="sm" onClick={() => setSearchOpen(true)}>New message</Button>}
            />
          ) : (
            conversations.map((c) => {
              const title = c.type === 'DM' ? c.members.find((m) => m.id !== user?.id)?.displayName ?? 'Direct message' : c.name ?? 'Group';
              const avatar = c.type === 'DM' ? c.members.find((m) => m.id !== user?.id)?.avatarUrl : c.avatarUrl;
              const isActive = c.id === activeId;
              return (
                <button
                  key={c.id}
                  onClick={() => router.push(`/messages/${c.id}`)}
                  className={cn('flex w-full items-center gap-3 border-b border-arjun-line/40 px-3 py-3 text-left transition-colors hover:bg-white/[0.03]', isActive && 'bg-emerald-500/10')}
                >
                  <div className="relative">
                    <Avatar src={avatar} name={title} size={40} />
                    {c.type === 'DM' && online.has(c.members.find((m) => m.id !== user?.id)?.id ?? '') && (
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-arjun-panel bg-emerald-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{title}</span>
                      {c.lastMessage && <span className="shrink-0 text-[10px] text-arjun-muted">{new Date(c.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-arjun-muted">
                        {c.lastMessage?.content ?? (c.type === 'GROUP' ? `${c.members.length} members` : 'Say hello 👋')}
                      </span>
                      {c.unreadCount > 0 && <span className="shrink-0 rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">{c.unreadCount}</span>}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Chat pane ── */}
      <div className={cn('glass flex flex-col overflow-hidden rounded-2xl', !activeId && 'hidden lg:flex')}>
        {!activeId ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={MessagesSquare}
              title="Select a conversation"
              description="Choose a chat on the left, or start a new one."
              action={<Button onClick={() => setSearchOpen(true)}><Plus size={14} /> New message</Button>}
            />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-arjun-line p-3">
              <button className="text-arjun-muted hover:text-arjun-text lg:hidden" onClick={() => router.push('/messages')} aria-label="Back">
                <ArrowLeft size={18} />
              </button>
              <Avatar src={peer?.avatarUrl ?? active?.avatarUrl} name={peer?.displayName ?? active?.name ?? 'Chat'} size={36} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {peer?.displayName ?? active?.name ?? 'Chat'}
                  {active?.type === 'GROUP' && <span className="ml-2 text-xs text-arjun-muted">· {active.members.length} members</span>}
                </div>
                <div className="text-xs text-arjun-muted">
                  {active?.type === 'DM' ? (online.has(peer?.id ?? '') ? 'online' : 'offline') : `${active?.members.length ?? 0} members`}
                </div>
              </div>
            </div>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {loadingMessages ? (
                <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-emerald-400" /></div>
              ) : messages.length === 0 ? (
                <p className="py-10 text-center text-sm text-arjun-muted">No messages yet — say hello.</p>
              ) : (
                messages.map((m) => {
                  const mine = m.senderId === user?.id;
                  return (
                    <div key={m.id} className={cn('group flex gap-2', mine ? 'flex-row-reverse' : 'flex-row')}>
                      {!mine && <Avatar src={m.sender.avatarUrl} name={m.sender.displayName} size={28} />}
                      <div className={cn('max-w-[75%]', mine && 'text-right')}>
                        {!mine && <div className="mb-0.5 text-[11px] text-arjun-muted">{m.sender.displayName}</div>}
                        <div className={cn('flex items-start gap-1', mine && 'flex-row-reverse')}>
                          {mine && !m.deletedAt && (
                            <div className="hidden shrink-0 gap-0.5 pt-1 group-hover:flex">
                              <button
                                onClick={() => startEdit(m)}
                                className="rounded-md p-1 text-arjun-muted opacity-60 hover:bg-white/10 hover:opacity-100"
                                aria-label="Edit message"
                                title="Edit"
                              >
                                <Pencil size={13} />
                              </button>
                              {confirmDeleteId === m.id ? (
                                <button
                                  onClick={() => void deleteForEveryone(m.id)}
                                  className="rounded-md p-1 text-rose-300 hover:bg-rose-500/10"
                                  aria-label="Confirm delete for everyone"
                                  title="Confirm delete for everyone"
                                >
                                  <Trash2 size={13} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteId(m.id)}
                                  className="rounded-md p-1 text-arjun-muted opacity-60 hover:bg-white/10 hover:opacity-100"
                                  aria-label="Delete for everyone"
                                  title="Delete for everyone"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          )}
                        <div
                          className={cn(
                            'inline-block rounded-2xl px-4 py-2 text-sm shadow-glass',
                            m.deletedAt
                              ? 'border border-arjun-line bg-white/[0.03] italic text-arjun-muted'
                              : mine
                                ? 'bg-gradient-to-br from-emerald-600/80 to-emerald-700/80 text-white'
                                : 'border border-arjun-line bg-white/[0.05]',
                          )}
                        >
                          {editingId === m.id ? (
                            <div className="flex min-w-64 flex-col gap-2">
                              <textarea
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                rows={3}
                                className="w-full rounded-lg border border-arjun-line bg-black/40 p-2 text-sm text-arjun-text outline-none focus:border-emerald-500/50"
                              />
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                                <Button size="sm" onClick={() => void saveEdit(m.id)} disabled={!editDraft.trim()}>Save</Button>
                              </div>
                            </div>
                          ) : m.deletedAt ? (
                            'Message deleted'
                          ) : m.type === 'ATTACHMENT' && m.attachment ? (
                            m.attachment.mimeType.startsWith('image/') ? (
                              <a href={m.attachment.url} target="_blank" rel="noreferrer"><img src={m.attachment.url} alt={m.attachment.filename} className="max-h-64 rounded-lg" /></a>
                            ) : (
                              <a href={m.attachment.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline">
                                <Paperclip size={14} /> {m.attachment.filename}
                              </a>
                            )
                          ) : m.type === 'CHART_SHARE' && m.chartShare ? (
                            <a href={`/s/${m.chartShare.linkToken}`} className="block text-left">
                              <div className="text-xs uppercase tracking-wider opacity-70">Shared chart</div>
                              <div className="font-semibold">{m.chartShare.title}</div>
                              <div className="font-mono text-xs">{m.chartShare.symbol} · {m.chartShare.timeframe}{m.chartShare.bias ? ` · ${m.chartShare.bias}` : ''}</div>
                            </a>
                          ) : (
                            <span className="whitespace-pre-wrap">{m.content}</span>
                          )}
                          {m.editedAt && <span className="ml-1 text-[10px] opacity-60">(edited)</span>}
                        </div>
                        </div>
                        {/* reactions */}
                        {(m.reactions ?? []).length > 0 && (
                          <div className={cn('mt-1 flex flex-wrap gap-1', mine && 'justify-end')}>
                            {Object.entries(
                              (m.reactions ?? []).reduce<Record<string, number>>((acc, r) => {
                                acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
                                return acc;
                              }, {}),
                            ).map(([emoji, count]) => (
                              <button
                                key={emoji}
                                onClick={() => void react(m.id, emoji)}
                                className={cn('rounded-full border border-arjun-line px-1.5 py-0.5 text-[11px]', (m.reactions ?? []).some((r) => r.userId === user?.id && r.emoji === emoji) && 'border-emerald-500/50 bg-emerald-500/10')}
                              >
                                {emoji} {count}
                              </button>
                            ))}
                          </div>
                        )}
                        {/* quick react */}
                        {!m.deletedAt && (
                          <div className={cn('mt-1 hidden gap-1 group-hover:flex', mine && 'justify-end')}>
                            {EMOJIS.map((emoji) => (
                              <button key={emoji} onClick={() => void react(m.id, emoji)} className="rounded-full p-0.5 text-xs opacity-60 hover:opacity-100" aria-label={`React ${emoji}`}>
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              {typingNames.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-arjun-muted">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:240ms]" />
                  </span>
                  {typingNames.join(', ')} {typingNames.length > 1 ? 'are' : 'is'} typing…
                </div>
              )}
            </div>

            <div className="border-t border-arjun-line p-3">
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf,video/mp4,video/webm"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void sendAttachment(f);
                    e.target.value = '';
                  }}
                />
                <Button variant="icon" size="icon" onClick={() => fileInputRef.current?.click()} aria-label="Attach file">
                  <Paperclip size={17} />
                </Button>
                <Input
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    onTyping();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Type a message…"
                  className="flex-1"
                />
                <Button onClick={() => void send()} disabled={!draft.trim()} aria-label="Send">
                  <Send size={16} />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── New DM dialog ── */}
      <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title="New message" description="Search traders to start a direct conversation.">
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-arjun-muted" />
            <Input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Search traders…" className="pl-9" />
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {userResults.map((u) => (
              <button key={u.id} onClick={() => void startDm(u.id)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/5">
                <Avatar src={u.avatarUrl} name={u.displayName} size={36} />
                <div>
                  <div className="text-sm font-medium">{u.displayName}</div>
                  <div className="text-xs text-arjun-muted">{u.name}</div>
                </div>
              </button>
            ))}
            {userQuery.length >= 2 && userResults.length === 0 && (
              <p className="py-4 text-center text-sm text-arjun-muted">No traders found.</p>
            )}
          </div>
        </div>
      </Modal>

      {/* ── New group dialog ── */}
      <Modal open={groupOpen} onClose={() => setGroupOpen(false)} title="New group chat">
        <div className="space-y-4">
          <div>
            <Label>Group name</Label>
            <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. London session crew" />
          </div>
          <p className="text-xs text-arjun-muted">You can add members from inside the conversation.</p>
          <div className="flex justify-end">
            <Button onClick={createGroup} disabled={!groupName.trim()}>Create group</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
