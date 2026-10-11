'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Bell, Check, CheckCheck, Loader2 } from 'lucide-react';
import { Badge, Button, EmptyState, PageHeader, Switch } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
  data?: Record<string, unknown>;
}

const TYPE_LABELS: Record<string, string> = {
  MESSAGE: 'Messages',
  MENTION: 'Mentions',
  REACTION: 'Reactions',
  CHART_SHARE: 'Chart shares',
  MEETING_INVITE: 'Meetings',
  FOLLOW: 'Follows',
  ALERT: 'Price alerts',
  SYNC_FAILURE: 'MT5 sync',
  REPORT: 'Moderation',
  SYSTEM: 'System',
};

const ALL_TYPES = Object.keys(TYPE_LABELS);

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [prefs, setPrefs] = useState<{ inApp: Record<string, boolean>; email: Record<string, boolean> } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [n, p] = await Promise.all([
        api.get<{ notifications: NotificationRow[] }>('/api/notifications?limit=60'),
        api.get<{ prefs: { inApp: Record<string, boolean>; email: Record<string, boolean> } }>('/api/notifications/prefs'),
      ]);
      setNotifications(n.notifications);
      setPrefs(p.prefs);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markAll = async () => {
    await api.patch('/api/notifications', { all: true });
    setNotifications((cur) => cur.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    toast.success('All marked as read');
  };

  const togglePref = async (channel: 'inApp' | 'email', type: string, value: boolean) => {
    if (!prefs) return;
    const next = { ...prefs, [channel]: { ...prefs[channel], [type]: value } };
    setPrefs(next);
    await api.patch('/api/notifications/prefs', { [channel]: next[channel] });
  };

  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="In-app alerts for messages, mentions, meetings, price alerts and sync events."
        actions={
          unread > 0 ? (
            <Button variant="secondary" size="sm" onClick={markAll}><CheckCheck size={14} /> Mark all read</Button>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-2">
          {loading ? (
            <div className="card flex items-center justify-center py-16"><Loader2 className="animate-spin text-emerald-400" /></div>
          ) : notifications.length === 0 ? (
            <EmptyState icon={Bell} title="No notifications" description="You're all caught up. New messages, mentions and alerts will appear here." />
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${
                  n.readAt ? 'border-arjun-line bg-white/[0.02]' : 'border-emerald-500/30 bg-emerald-500/[0.06]'
                }`}
              >
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${n.readAt ? 'bg-white/5' : 'bg-emerald-500/15'}`}>
                  <Bell size={14} className={n.readAt ? 'text-arjun-muted' : 'text-emerald-300'} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{n.title}</span>
                    <Badge variant="neutral">{TYPE_LABELS[n.type] ?? n.type}</Badge>
                  </div>
                  {n.body && <p className="mt-0.5 text-sm text-arjun-muted">{n.body}</p>}
                  <div className="mt-1 text-xs text-arjun-muted">{new Date(n.createdAt).toLocaleString()}</div>
                </div>
                {!n.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />}
              </div>
            ))
          )}
        </div>

        <div className="card h-fit space-y-4">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-arjun-muted">Notification preferences</h3>
          {prefs &&
            ALL_TYPES.map((type) => (
              <div key={type} className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{TYPE_LABELS[type]}</div>
                  <div className="text-xs text-arjun-muted">in-app {prefs.inApp[type] === false ? 'off' : 'on'} · email {prefs.email[type] === false ? 'off' : 'off (SMTP not configured)'}</div>
                </div>
                <Switch checked={prefs.inApp[type] !== false} onCheckedChange={(v) => togglePref('inApp', type, v)} />
              </div>
            ))}
          <p className="text-xs text-arjun-muted">
            Email notifications require SMTP to be configured on the server. Browser push is available on supported devices with your consent.
          </p>
        </div>
      </div>
    </div>
  );
}
