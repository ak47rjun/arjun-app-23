'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Activity, Ban, Check, CheckCheck, Eye, FileText, Gavel, Loader2, RefreshCw, Search, Server, Shield, Users as UsersIcon, X,
} from 'lucide-react';
import { Avatar, Badge, Button, Card, CardContent, EmptyState, Input, PageHeader, Select, Tabs } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';

type Tab = 'overview' | 'users' | 'reports' | 'moderation' | 'audit' | 'health';

interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  isBanned: boolean;
  emailVerified: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  _count: { trades: number; posts: number; messages: number };
}

interface ReportRow {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  createdAt: string;
  reporter: { id: string; displayName: string | null };
}

interface AuditRow {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  createdAt: string;
  actor: { id: string; displayName: string | null; email: string } | null;
}

interface Health {
  status: string;
  services: {
    database: { ok: boolean; latencyMs: number };
    redis: { ok: boolean; mode: string };
    storage: { ok: boolean; provider: string };
  };
  integrations: {
    marketData: { provider: string; mode: string; label: string; configured: boolean };
    mt5Bridge: { configured: boolean };
    livekit: { configured: boolean };
    googleOAuth: { configured: boolean };
    smtp: { configured: boolean };
  };
  counts: Record<string, number>;
}

const ROLES = ['GUEST', 'MEMBER', 'VERIFIED_TRADER', 'MODERATOR', 'ADMIN'];

export default function AdminPage() {
  const { user } = useSession();
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [stats, setStats] = useState<Record<string, number> | null>(null);

  const loadUsers = useCallback(async () => {
    const data = await api.get<{ users: AdminUser[] }>(`/api/admin/users${userQuery ? `?q=${encodeURIComponent(userQuery)}` : ''}`);
    setUsers(data.users);
  }, [userQuery]);

  const loadReports = useCallback(async () => {
    const data = await api.get<{ reports: ReportRow[] }>('/api/admin/reports?status=PENDING');
    setReports(data.reports);
  }, []);

  const loadAudit = useCallback(async () => {
    const data = await api.get<{ logs: AuditRow[] }>('/api/admin/audit-logs?limit=100');
    setAudits(data.logs);
  }, []);

  const loadHealth = useCallback(async () => {
    const data = await api.get<Health>('/api/admin/health');
    setHealth(data);
    setStats(data.counts);
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    setLoading(true);
    const jobs: Record<Tab, () => Promise<void>> = {
      overview: async () => { await loadHealth(); },
      users: loadUsers,
      reports: loadReports,
      moderation: loadReports,
      audit: loadAudit,
      health: loadHealth,
    };
    jobs[tab]()
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tab, user, loadUsers, loadReports, loadAudit, loadHealth]);

  useEffect(() => {
    if (tab === 'users') {
      const t = setTimeout(() => void loadUsers().catch(() => {}), 300);
      return () => clearTimeout(t);
    }
  }, [userQuery, tab, loadUsers]);

  if (!user || user.role !== 'ADMIN') {
    return (
      <EmptyState
        icon={Shield}
        title="Administrator access required"
        description="This area is restricted to platform administrators."
      />
    );
  }

  const setRole = async (id: string, role: string) => {
    try {
      await api.patch(`/api/admin/users/${id}`, { role });
      await loadUsers();
      toast.success('Role updated');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to update role');
    }
  };

  const setBanned = async (u: AdminUser) => {
    try {
      await api.patch(`/api/admin/users/${u.id}`, { isBanned: !u.isBanned });
      await loadUsers();
      toast.success(u.isBanned ? 'User unbanned' : 'User banned');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed');
    }
  };

  const setVerified = async (u: AdminUser, verified: boolean) => {
    try {
      await api.patch(`/api/admin/users/${u.id}`, { verifiedBadge: verified });
      await loadUsers();
      toast.success(verified ? 'Trader verified' : 'Verification removed');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed');
    }
  };

  const resolveReport = async (id: string, status: string, action?: string, targetUserId?: string) => {
    try {
      await api.patch(`/api/admin/reports/${id}`, { status, action, targetUserId });
      await loadReports();
      toast.success('Report updated');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Console"
        description="User management, moderation, audit trail and system health. All actions are logged."
        actions={<Button variant="secondary" size="sm" onClick={() => { setLoading(true); Promise.all([loadHealth(), loadUsers(), loadReports(), loadAudit()]).finally(() => setLoading(false)); }}><RefreshCw size={14} /> Refresh</Button>}
      />

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'users', label: 'Users' },
          { id: 'reports', label: 'Reports', count: reports.length },
          { id: 'audit', label: 'Audit log' },
          { id: 'health', label: 'System health' },
        ]}
      />

      {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-emerald-400" /></div>}

      {!loading && tab === 'overview' && stats && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={UsersIcon} label="Users" value={stats.users} />
          <StatCard icon={FileText} label="Trades journaled" value={stats.trades} />
          <StatCard icon={Activity} label="Messages" value={stats.messages} />
          <StatCard icon={Server} label="Meetings" value={stats.meetings} />
          <StatCard icon={RefreshCw} label="Pending jobs" value={stats.pendingJobs} />
          <StatCard icon={X} label="Failed jobs" value={stats.failedJobs} />
          <StatCard icon={Gavel} label="Open reports" value={stats.openReports} />
        </div>
      )}

      {!loading && tab === 'users' && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-arjun-muted" />
            <Input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Search users…" className="pl-9" />
          </div>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-arjun-line text-left text-xs uppercase tracking-wider text-arjun-muted">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Trades</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-arjun-line/40 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar src={u.avatarUrl} name={u.displayName} size={30} />
                        <div>
                          <div className="font-medium">{u.displayName ?? '—'}</div>
                          <div className="text-xs text-arjun-muted">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Select value={u.role} onChange={(e) => setRole(u.id, e.target.value)} disabled={u.id === user.id} className="w-40">
                        {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      {u.isBanned ? <Badge variant="danger">Banned</Badge> : u.emailVerified ? <Badge variant="success">Verified</Badge> : <Badge variant="warn">Unverified</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{u._count.trades}</td>
                    <td className="px-4 py-3 text-arjun-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setVerified(u, true)} aria-label="Verify trader"><Check size={13} /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setBanned(u)} disabled={u.id === user.id} aria-label="Ban/unban">
                          <Ban size={13} className={u.isBanned ? 'text-emerald-300' : 'text-rose-300'} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && tab === 'reports' && (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <EmptyState icon={CheckCheck} title="No pending reports" description="The moderation queue is clear." />
          ) : (
            reports.map((r) => (
              <div key={r.id} className="card flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="warn">{r.targetType}</Badge>
                    <span className="font-mono text-xs text-arjun-muted">{r.targetId.slice(0, 12)}…</span>
                    <span className="text-xs text-arjun-muted">by {r.reporter.displayName ?? '—'} · {new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-sm">{r.reason}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => resolveReport(r.id, 'DISMISSED')}><X size={13} /> Dismiss</Button>
                  <Button variant="secondary" size="sm" onClick={() => resolveReport(r.id, 'REVIEWED')}><Eye size={13} /> Reviewed</Button>
                  <Button variant="danger" size="sm" onClick={() => resolveReport(r.id, 'ACTIONED', 'DELETE_CONTENT')}><Ban size={13} /> Delete content</Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {!loading && tab === 'audit' && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-arjun-line text-left text-xs uppercase tracking-wider text-arjun-muted">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Entity</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a) => (
                <tr key={a.id} className="border-b border-arjun-line/40 last:border-0">
                  <td className="px-4 py-3 text-arjun-muted">{new Date(a.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3"><Badge variant="neutral">{a.action}</Badge></td>
                  <td className="px-4 py-3">{a.actor?.displayName ?? a.actor?.email ?? 'system'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-arjun-muted">{a.entity ?? '—'} {a.entityId ? a.entityId.slice(0, 8) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'health' && health && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-3 pt-5">
              <h3 className="font-semibold">Services</h3>
              <HealthRow label="PostgreSQL" ok={health.services.database.ok} detail={`latency ${health.services.database.latencyMs}ms`} />
              <HealthRow label="Redis" ok={health.services.redis.ok} detail={health.services.redis.mode} />
              <HealthRow label="Storage" ok={health.services.storage.ok} detail={health.services.storage.provider} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 pt-5">
              <h3 className="font-semibold">Integrations</h3>
              <HealthRow label="Market data" ok={health.integrations.marketData.configured ?? true} detail={`${health.integrations.marketData.provider} · ${health.integrations.marketData.mode}`} />
              <HealthRow label="MT5 bridge" ok={health.integrations.mt5Bridge.configured} detail={health.integrations.mt5Bridge.configured ? 'configured' : 'setup required'} />
              <HealthRow label="LiveKit (ARJUN Meet)" ok={health.integrations.livekit.configured} detail={health.integrations.livekit.configured ? 'configured' : 'setup required'} />
              <HealthRow label="Google OAuth" ok={health.integrations.googleOAuth.configured} detail={health.integrations.googleOAuth.configured ? 'configured' : 'disabled (email/password only)'} />
              <HealthRow label="SMTP email" ok={health.integrations.smtp.configured} detail={health.integrations.smtp.configured ? 'configured' : 'console logging'} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number | string; className?: string }>; label: string; value: number | undefined }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-arjun-muted">{label}</span>
          <Icon size={15} className="text-emerald-300" />
        </div>
        <div className="mt-1 font-mono text-2xl font-semibold">{(value ?? 0).toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}

function HealthRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-arjun-muted">{detail}</span>
        <span className={`h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      </div>
    </div>
  );
}
