'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CalendarDays, Clock, Copy, Loader2, Plus, Video, X } from 'lucide-react';
import { Badge, Button, EmptyState, Input, Label, Modal, PageHeader } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

interface MeetingRow {
  id: string;
  title: string;
  description: string | null;
  roomName: string;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
  scheduledAt: string | null;
  createdAt: string;
  externalUrl: string | null;
  host: { id: string; displayName: string | null };
  _count: { participants: number };
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', scheduledAt: '', externalUrl: '' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ meetings: MeetingRow[] }>('/api/meetings');
      setMeetings(data.meetings);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to load meetings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (instant: boolean) => {
    setCreating(true);
    try {
      const { meeting } = await api.post<{ meeting: MeetingRow }>('/api/meetings', {
        title: form.title || (instant ? 'Instant meeting' : 'Scheduled meeting'),
        description: form.description || undefined,
        scheduledAt: instant || !form.scheduledAt ? undefined : new Date(form.scheduledAt).toISOString(),
        externalUrl: form.externalUrl || undefined,
      });
      toast.success('Meeting created');
      setOpen(false);
      setForm({ title: '', description: '', scheduledAt: '', externalUrl: '' });
      router_push(`/meetings/${meeting.id}`);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to create meeting');
    } finally {
      setCreating(false);
    }
  };

  const router_push = (href: string) => {
    window.location.href = href;
  };

  const copyLink = async (id: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/meetings/${id}`);
    toast.success('Meeting link copied');
  };

  const cancel = async (id: string) => {
    try {
      await api.del(`/api/meetings/${id}`);
      await load();
      toast.success('Meeting cancelled');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to cancel');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="ARJUN Meet"
        description="Video meetings for mentors, teams and communities — audio, video and screen sharing, built into ARJUN."
        actions={
          <>
            <Button variant="secondary" onClick={() => { setForm({ title: '', description: '', scheduledAt: '', externalUrl: '' }); setOpen(true); }}>
              <CalendarDays size={15} /> Schedule
            </Button>
            <Button onClick={() => { setForm({ title: 'Instant meeting', description: '', scheduledAt: '', externalUrl: '' }); setOpen(true); }}>
              <Video size={15} /> Start instant meeting
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="card flex items-center justify-center py-16"><Loader2 className="animate-spin text-emerald-400" /></div>
      ) : meetings.length === 0 ? (
        <EmptyState
          icon={Video}
          title="No meetings yet"
          description="Start an instant meeting or schedule one for later. Invite traders from ARJUN Messenger."
          action={<Button onClick={() => setOpen(true)}><Plus size={15} /> Create a meeting</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {meetings.map((m) => (
            <div key={m.id} className="card flex flex-col">
              <div className="mb-2 flex items-center justify-between">
                <Badge variant={m.status === 'LIVE' ? 'success' : m.status === 'SCHEDULED' ? 'cyan' : 'neutral'}>{m.status}</Badge>
                <span className="text-xs text-arjun-muted">{m._count.participants} participant{m._count.participants === 1 ? '' : 's'}</span>
              </div>
              <h3 className="font-display text-lg font-semibold">{m.title}</h3>
              <p className="mt-1 line-clamp-2 flex-1 text-sm text-arjun-muted">{m.description ?? 'No description'}</p>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-arjun-muted">
                <Clock size={12} />
                {m.scheduledAt ? new Date(m.scheduledAt).toLocaleString() : 'Instant meeting'} · host {m.host.displayName ?? '—'}
              </div>
              <div className="mt-4 flex gap-2">
                <Link href={`/meetings/${m.id}`} className="btn-primary flex-1 !py-1.5 text-xs">
                  <Video size={13} /> Join
                </Link>
                <Button variant="secondary" size="sm" onClick={() => copyLink(m.id)} aria-label="Copy link"><Copy size={13} /></Button>
                {m.status === 'SCHEDULED' && (
                  <Button variant="ghost" size="sm" onClick={() => cancel(m.id)} aria-label="Cancel meeting"><X size={13} /></Button>
                )}
              </div>
              {m.externalUrl && (
                <a href={m.externalUrl} target="_blank" rel="noreferrer" className="mt-2 text-xs text-cyan-300 hover:text-cyan-200">
                  External fallback link ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New meeting" description="Instant meetings start immediately. Scheduled meetings can be shared and joined later.">
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Weekly strategy review" />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <Label>Schedule (optional — leave empty for instant)</Label>
            <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
          </div>
          <div>
            <Label>External fallback URL (optional)</Label>
            <Input value={form.externalUrl} onChange={(e) => setForm({ ...form, externalUrl: e.target.value })} placeholder="https://meet.google.com/…" />
            <p className="mt-1 text-xs text-arjun-muted">ARJUN Meet is the primary experience; this is only an external fallback for participants.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create(Boolean(!form.scheduledAt))} disabled={creating}>
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} />}
              {form.scheduledAt ? 'Schedule meeting' : 'Start now'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
