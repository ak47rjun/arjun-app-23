'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import Link from 'next/link';
import { Avatar, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

interface NoteRow {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; displayName: string | null; avatarUrl: string | null };
}

/** Viewers add their OWN analysis to a shared chart — the original never changes. */
export function SharedChartNotes({ shareId, isLoggedIn }: { shareId: string; isLoggedIn: boolean }) {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ notes: NoteRow[] }>(`/api/charts/shares/${shareId}/notes`);
      setNotes(data.notes);
    } catch {
      /* private link without session — notes hidden */
    }
  }, [shareId]);

  useEffect(() => {
    if (isLoggedIn) void load();
  }, [isLoggedIn, load]);

  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      const { note } = await api.post<{ note: NoteRow }>(`/api/charts/shares/${shareId}/notes`, { content: draft });
      setNotes((cur) => [...cur, note]);
      setDraft('');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to add note');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Community analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {notes.length === 0 && <p className="text-sm text-arjun-muted">No analysis yet.</p>}
        {notes.map((n) => (
          <div key={n.id} className="rounded-xl border border-arjun-line p-3">
            <div className="mb-1 flex items-center gap-2">
              <Avatar src={n.user.avatarUrl} name={n.user.displayName} size={22} />
              <span className="text-xs font-medium">{n.user.displayName ?? 'Trader'}</span>
              <span className="ml-auto text-[10px] text-arjun-muted">{new Date(n.createdAt).toLocaleString()}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{n.content}</p>
          </div>
        ))}
        {isLoggedIn ? (
          <div className="flex gap-2">
            <textarea
              className="input min-h-[60px] flex-1"
              placeholder="Add your own analysis…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button size="sm" onClick={send} disabled={sending || !draft.trim()}>
              {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-arjun-muted">
            <Link href="/login" className="text-emerald-300 hover:text-emerald-200">Sign in</Link> to add your own analysis to this chart.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
