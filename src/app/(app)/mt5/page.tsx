'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Download, Link2, Loader2, PlugZap, Plus, RefreshCw, ShieldCheck, Trash2, Wallet } from 'lucide-react';
import { Badge, Button, EmptyState, Input, Label, Modal, PageHeader } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

interface ConnectionRow {
  id: string;
  login: string;
  server: string;
  mode: 'BRIDGE' | 'EA';
  status: 'ACTIVE' | 'DISCONNECTED' | 'ERROR';
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  account: { id: string; name: string; balance: number; equity: number; currency: string; status: string; lastSyncAt: string | null } | null;
  syncJobCount: number;
}

interface SyncJobRow {
  id: string;
  type: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  finishedAt: string | null;
}

interface Mt5Status {
  bridgeConfigured: boolean;
  eaAvailable: boolean;
  message: string;
}

interface EaSetup {
  connectionId: string;
  login: string;
  server: string;
  syncToken: string;
  eaDownloadUrl: string;
  ingestUrl: string;
}

export default function Mt5Page() {
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [status, setStatus] = useState<Mt5Status | null>(null);
  const [jobs, setJobs] = useState<Record<string, SyncJobRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [connectOpen, setConnectOpen] = useState(false);
  const [mode, setMode] = useState<'EA' | 'BRIDGE'>('EA');
  const [form, setForm] = useState({ login: '', server: '', investorPassword: '' });
  const [connecting, setConnecting] = useState(false);
  const [eaSetup, setEaSetup] = useState<EaSetup | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([
        api.get<{ connections: ConnectionRow[] }>('/api/mt5/connections'),
        api.get<Mt5Status>('/api/mt5/status'),
      ]);
      setConnections(c.connections);
      setStatus(s);
      // load recent jobs per connection
      const jobMap: Record<string, SyncJobRow[]> = {};
      await Promise.all(
        c.connections.map(async (conn) => {
          try {
            const j = await api.get<{ jobs: SyncJobRow[] }>(`/api/mt5/connections/${conn.id}/sync`);
            jobMap[conn.id] = j.jobs;
          } catch {
            jobMap[conn.id] = [];
          }
        }),
      );
      setJobs(jobMap);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to load MT5 connections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 15000); // reflect background sync progress
    return () => clearInterval(id);
  }, [load]);

  const connect = async () => {
    setConnecting(true);
    try {
      if (mode === 'EA') {
        const res = await api.post<{ connection: { id: string; login: string; server: string }; syncToken: string; eaDownloadUrl: string; ingestUrl: string }>(
          '/api/mt5/connections',
          { login: form.login, server: form.server, mode: 'EA' },
        );
        setEaSetup({
          connectionId: res.connection.id,
          login: res.connection.login,
          server: res.connection.server,
          syncToken: res.syncToken,
          eaDownloadUrl: res.eaDownloadUrl,
          ingestUrl: res.ingestUrl,
        });
        setCopied(false);
        toast.success('EA connection created — finish the setup below');
      } else {
        await api.post('/api/mt5/connections', { ...form, mode: 'BRIDGE' });
        toast.success('MT5 account connected — first synchronization queued');
      }
      setConnectOpen(false);
      setForm({ login: '', server: '', investorPassword: '' });
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(eaSetup?.syncToken ?? '');
      setCopied(true);
      toast.success('Sync token copied');
    } catch {
      toast.error('Copy failed — select the token manually');
    }
  };

  const disconnect = async (id: string) => {
    try {
      await api.del(`/api/mt5/connections/${id}`);
      toast.success('Connection revoked and credentials deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to disconnect');
    }
  };

  const triggerSync = async (id: string) => {
    try {
      await api.post(`/api/mt5/connections/${id}/sync`, { type: 'MT5_SYNC' });
      toast.success('Synchronization queued');
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to queue sync');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="MT5 Accounts"
        description="Connect MetaTrader 5 accounts read-only. Expert Advisor mode needs no password and no bridge — your terminal pushes the data."
        actions={<Button onClick={() => setConnectOpen(true)}><Plus size={15} /> Connect account</Button>}
      />

      {status && !status.bridgeConfigured && (
        <div className="card flex items-start gap-3 text-sm text-arjun-muted">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-300" />
          <p>
            The server-side MT5 bridge is not configured, but <strong>Expert Advisor mode works without it</strong> (recommended):
            connect below, download the EA, and attach it in your terminal. Bridge mode additionally needs <code>MT5_BRIDGE_URL</code> (see docs/MT5.md).
          </p>
        </div>
      )}

      {loading ? (
        <div className="card flex items-center justify-center py-16"><Loader2 className="animate-spin text-emerald-400" /></div>
      ) : connections.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No MT5 accounts connected"
          description="Connect an account to synchronize balance, equity and full trade history into your journal. Imported trades are deduplicated automatically."
          action={<Button onClick={() => setConnectOpen(true)}><Link2 size={15} /> Connect MT5 account</Button>}
        />
      ) : (
        <div className="space-y-4">
          {connections.map((c) => (
            <div key={c.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">#{c.login}</span>
                    <Badge variant={c.status === 'ACTIVE' ? 'success' : c.status === 'ERROR' ? 'danger' : 'neutral'}>{c.status}</Badge>
                    <Badge variant="cyan">{c.mode === 'EA' ? 'Expert Advisor' : 'Bridge'}</Badge>
                  </div>
                  <div className="mt-1 text-sm text-arjun-muted">{c.server}</div>
                  {c.mode === 'EA' && c.status === 'DISCONNECTED' && (
                    <div className="mt-2 text-xs text-amber-200">Waiting for the first push from your terminal — attach the EA (setup instructions above).</div>
                  )}
                  {c.account && (
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div><div className="text-xs uppercase text-arjun-muted">Balance</div><div className="font-mono">{c.account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {c.account.currency}</div></div>
                      <div><div className="text-xs uppercase text-arjun-muted">Equity</div><div className="font-mono">{c.account.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })} {c.account.currency}</div></div>
                      <div><div className="text-xs uppercase text-arjun-muted">{c.mode === 'EA' ? 'Last push' : 'Last sync'}</div><div>{c.account.lastSyncAt ? new Date(c.account.lastSyncAt).toLocaleString() : '—'}</div></div>
                      <div><div className="text-xs uppercase text-arjun-muted">Status</div><div>{c.account.status}</div></div>
                    </div>
                  )}
                  {c.lastError && (
                    <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
                      Last sync error: {c.lastError}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {c.mode === 'BRIDGE' && (
                    <Button variant="secondary" size="sm" onClick={() => triggerSync(c.id)}>
                      <RefreshCw size={13} /> Sync now
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => disconnect(c.id)}>
                    <Trash2 size={13} /> Disconnect
                  </Button>
                </div>
              </div>
              {jobs[c.id] && jobs[c.id].length > 0 && (
                <div className="mt-4 border-t border-arjun-line pt-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-arjun-muted">Recent sync jobs</div>
                  <div className="space-y-1">
                    {jobs[c.id].slice(0, 5).map((j) => (
                      <div key={j.id} className="flex items-center justify-between text-xs">
                        <span className="text-arjun-muted">{j.type} · {new Date(j.createdAt).toLocaleString()}</span>
                        <Badge variant={j.status === 'SUCCESS' ? 'success' : j.status === 'FAILED' ? 'danger' : j.status === 'RUNNING' ? 'cyan' : 'neutral'}>
                          {j.status} {j.attempts > 1 ? `(attempt ${j.attempts})` : ''}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card flex items-start gap-3 text-sm text-arjun-muted">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-300" />
        <p>
          Security: <strong>Expert Advisor mode never asks for any password</strong> — the EA runs inside your terminal, which is
          already logged in. Bridge mode requests the <strong>investor (read-only) password</strong> only, encrypts it at rest
          (AES-256-GCM), and sends it exclusively to your configured MT5 bridge over TLS. The master trading password is rejected
          by the API in both modes. Disconnecting deletes the connection (and any stored credential) immediately. Trade execution is not supported.
        </p>
      </div>

      {/* ── Connect modal ── */}
      <Modal open={connectOpen} onClose={() => setConnectOpen(false)} title="Connect MT5 account" description="Read-only synchronization of balance, equity and trade history.">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('EA')}
              className={`rounded-lg border p-3 text-left text-sm transition ${mode === 'EA' ? 'border-emerald-500/60 bg-emerald-500/10 text-arjun-text' : 'border-arjun-line text-arjun-muted hover:border-arjun-line/70'}`}
            >
              <div className="font-semibold">Expert Advisor <span className="text-xs text-emerald-300">recommended</span></div>
              <div className="mt-0.5 text-xs">Runs in your terminal — no password, no bridge.</div>
            </button>
            <button
              type="button"
              onClick={() => setMode('BRIDGE')}
              className={`rounded-lg border p-3 text-left text-sm transition ${mode === 'BRIDGE' ? 'border-emerald-500/60 bg-emerald-500/10 text-arjun-text' : 'border-arjun-line text-arjun-muted hover:border-arjun-line/70'}`}
            >
              <div className="font-semibold">Bridge</div>
              <div className="mt-0.5 text-xs">ARJUN polls your bridge with the investor password.</div>
            </button>
          </div>
          <div>
            <Label>Account login</Label>
            <Input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} placeholder="e.g. 108518884" />
          </div>
          <div>
            <Label>Server</Label>
            <Input value={form.server} onChange={(e) => setForm({ ...form, server: e.target.value })} placeholder="e.g. XMGlobal-MT5 5" />
          </div>
          {mode === 'BRIDGE' && (
            <div>
              <Label>Investor password (read-only)</Label>
              <Input type="password" value={form.investorPassword} onChange={(e) => setForm({ ...form, investorPassword: e.target.value })} placeholder="Not your master password" />
              <p className="mt-1.5 text-xs text-arjun-muted">
                The investor password allows viewing only. Never enter your master trading password here — the API rejects it.
              </p>
            </div>
          )}
          {mode === 'EA' && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
              No password needed. After connecting you&apos;ll get a one-time sync token and the Expert Advisor to attach in your terminal.
            </div>
          )}
          {mode === 'BRIDGE' && status && !status.bridgeConfigured && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              The MT5 bridge is not configured on this server, so the first sync will fail with a setup-required error until MT5_BRIDGE_URL is set. Prefer Expert Advisor mode — it needs no bridge.
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConnectOpen(false)}>Cancel</Button>
            <Button
              onClick={connect}
              disabled={connecting || !form.login || !form.server || (mode === 'BRIDGE' && !form.investorPassword)}
            >
              {connecting ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />} Connect
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── EA setup modal (token shown exactly once) ── */}
      <Modal open={!!eaSetup} onClose={() => setEaSetup(null)} title="Finish EA setup" description={`Account #${eaSetup?.login ?? ''} on ${eaSetup?.server ?? ''} — 3 steps`}>
        {eaSetup && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              This sync token is shown <strong>only once</strong>. Copy it now — you cannot retrieve it later (you can always disconnect and reconnect to get a new one).
            </div>
            <div>
              <Label>1 · Your sync token</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={eaSetup.syncToken} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="secondary" size="sm" onClick={copyToken}>
                  {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
            <div>
              <Label>2 · Download the Expert Advisor</Label>
              <div>
                <a href={eaSetup.eaDownloadUrl} download>
                  <Button variant="secondary" size="sm"><Download size={13} /> ARJUN_EA.mq5</Button>
                </a>
              </div>
              <p className="mt-1.5 text-xs text-arjun-muted">
                In your MT5 terminal: Tools → Options → Expert Advisors → enable &quot;Allow WebRequest for listed URL&quot; and add{' '}
                <code className="font-mono">https://arjun-production-04c9.up.railway.app</code>. Then attach the EA to any chart, paste the sync token into <code className="font-mono">InpSyncToken</code>, and click OK.
              </p>
            </div>
            <div>
              <Label>3 · Keep the terminal online</Label>
              <p className="text-xs text-arjun-muted">
                The EA pushes your balance, equity and closed deals to ARJUN every {60}s while the terminal runs. The connection becomes ACTIVE on the first push; trades appear in your journal automatically (deduplicated).
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setEaSetup(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
