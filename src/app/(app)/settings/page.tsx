'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, KeyRound, Loader2, LogOut, ShieldCheck, Trash2, User as UserIcon } from 'lucide-react';
import { Avatar, Badge, Button, Input, Label, Modal, PageHeader, Select, Separator, Switch } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';

const TIMEZONES = ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'America/Chicago', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/Berlin'];

export default function SettingsPage() {
  const router = useRouter();
  const { user, refresh } = useSession();
  const [tab, setTab] = useState<'profile' | 'security' | 'privacy' | 'data'>('profile');

  // profile form
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [isPublic, setIsPublic] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // 2FA
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpBusy, setTotpBusy] = useState(false);

  // sessions
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const avatarInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName ?? '');
      setBio(user.bio ?? '');
      setTimezone(user.timezone || 'UTC');
      setIsPublic(user.profile?.isPublic ?? true);
      setShowStats(user.profile?.showStats ?? false);
    }
  }, [user]);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.patch('/api/users/me', {
        displayName,
        bio,
        timezone,
        profile: { isPublic, showStats },
      });
      await refresh();
      toast.success('Profile updated');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to save');
    } finally {
      setSavingProfile(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('kind', 'avatar');
      await api.upload('/api/uploads', form);
      await refresh();
      toast.success('Avatar updated');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Upload failed');
    }
  };

  const startTotp = async () => {
    setTotpBusy(true);
    try {
      const data = await api.get<{ secret: string; qrDataUrl: string }>('/api/auth/2fa/setup');
      setTotpSetup(data);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to start 2FA setup');
    } finally {
      setTotpBusy(false);
    }
  };

  const enableTotp = async () => {
    setTotpBusy(true);
    try {
      await api.post('/api/auth/2fa/setup', { code: totpCode });
      setTotpSetup(null);
      setTotpCode('');
      await refresh();
      toast.success('Two-factor authentication enabled');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Invalid code');
    } finally {
      setTotpBusy(false);
    }
  };

  const disableTotp = async () => {
    setTotpBusy(true);
    try {
      await api.post('/api/auth/2fa/disable', { code: totpCode });
      setTotpCode('');
      await refresh();
      toast.success('Two-factor authentication disabled');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Invalid code');
    } finally {
      setTotpBusy(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await api.post('/api/account/delete', { password: deletePassword, confirmation: 'DELETE MY ACCOUNT' });
      window.location.href = '/';
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to delete account');
      setDeleting(false);
    }
  };

  const logoutEverywhere = async () => {
    await api.post('/api/auth/logout');
    window.location.href = '/login';
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Profile, security, privacy and your data." />

      <div className="flex gap-1 rounded-xl border border-arjun-line bg-white/[0.03] p-1 w-fit">
        {([
          ['profile', 'Profile'],
          ['security', 'Security'],
          ['privacy', 'Privacy'],
          ['data', 'Data'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${tab === id ? 'bg-emerald-500/15 text-emerald-200' : 'text-arjun-muted hover:text-arjun-text'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="card max-w-2xl space-y-5">
          <div className="flex items-center gap-4">
            <Avatar src={user.avatarUrl} name={user.displayName} size={72} />
            <div>
              <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadAvatar(f);
              }} />
              <Button variant="secondary" size="sm" onClick={() => avatarInput.current?.click()}>Change avatar</Button>
              <p className="mt-1 text-xs text-arjun-muted">PNG, JPEG or WebP · max 5 MB</p>
            </div>
          </div>
          <div>
            <Label>Display name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <Label>Bio</Label>
            <textarea className="input" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A line about your trading" />
          </div>
          <div>
            <Label>Time zone</Label>
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={savingProfile}>
              {savingProfile ? <Loader2 size={14} className="animate-spin" /> : null} Save profile
            </Button>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="max-w-2xl space-y-4">
          <div className="card">
            <div className="flex items-center gap-3">
              <KeyRound size={18} className="text-emerald-300" />
              <div className="flex-1">
                <h3 className="font-semibold">Password</h3>
                <p className="text-sm text-arjun-muted">Email/password sign-in is {user.emailVerified ? 'active' : 'active (email not verified)'}</p>
              </div>
              <a href="/forgot-password" className="btn-ghost !py-1.5 text-xs">Reset password</a>
            </div>
          </div>

          <div className="card">
            <div className="flex items-start gap-3">
              <ShieldCheck size={18} className="mt-0.5 text-emerald-300" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">Two-factor authentication (TOTP)</h3>
                  {user.totpEnabled && <Badge variant="success">Enabled</Badge>}
                </div>
                <p className="mt-1 text-sm text-arjun-muted">
                  Add a second factor with any authenticator app (Google Authenticator, 1Password, Authy…).
                </p>

                {!user.totpEnabled && !totpSetup && (
                  <Button variant="secondary" size="sm" className="mt-3" onClick={startTotp} disabled={totpBusy}>
                    {totpBusy ? <Loader2 size={13} className="animate-spin" /> : null} Set up 2FA
                  </Button>
                )}

                {totpSetup && !user.totpEnabled && (
                  <div className="mt-4 space-y-3">
                    <img src={totpSetup.qrDataUrl} alt="2FA QR code" className="h-44 w-44 rounded-xl border border-arjun-line bg-white p-2" />
                    <p className="text-xs text-arjun-muted">Or enter this secret manually: <code className="kbd">{totpSetup.secret}</code></p>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label>Verification code</Label>
                        <Input value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))} maxLength={6} placeholder="123456" />
                      </div>
                      <Button onClick={enableTotp} disabled={totpBusy || totpCode.length !== 6}>Enable 2FA</Button>
                    </div>
                  </div>
                )}

                {user.totpEnabled && (
                  <div className="mt-4 flex items-end gap-2">
                    <div className="flex-1">
                      <Label>Authenticator code</Label>
                      <Input value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))} maxLength={6} placeholder="123456" />
                    </div>
                    <Button variant="danger" onClick={disableTotp} disabled={totpBusy || totpCode.length !== 6}>Disable 2FA</Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-3">
              <LogOut size={18} className="text-arjun-muted" />
              <div className="flex-1">
                <h3 className="font-semibold">Sessions</h3>
                <p className="text-sm text-arjun-muted">Sign out everywhere by ending all sessions.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={logoutEverywhere}>Sign out all sessions</Button>
            </div>
          </div>
        </div>
      )}

      {tab === 'privacy' && (
        <div className="card max-w-2xl space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold">Public profile</h3>
              <p className="text-sm text-arjun-muted">When on, other traders can view your profile and public posts.</p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold">Show performance stats</h3>
              <p className="text-sm text-arjun-muted">Display your win rate and net P&L on your public profile. Self-reported — never a guarantee of future results.</p>
            </div>
            <Switch checked={showStats} onCheckedChange={setShowStats} />
          </div>
          <Separator />
          <p className="text-xs leading-relaxed text-arjun-muted">
            Your journal, messages, MT5 connections and account credentials are always private. Private chart shares are only
            accessible with their unguessable link. You control visibility per chart share (private / group / public).
          </p>
          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={savingProfile}>Save privacy settings</Button>
          </div>
        </div>
      )}

      {tab === 'data' && (
        <div className="max-w-2xl space-y-4">
          <div className="card flex items-center gap-3">
            <Download size={18} className="text-emerald-300" />
            <div className="flex-1">
              <h3 className="font-semibold">Export your data</h3>
              <p className="text-sm text-arjun-muted">Download everything ARJUN stores about you (journal, messages, posts, settings) as JSON.</p>
            </div>
            <a href="/api/account/export" className="btn-ghost !py-1.5 text-xs"><Download size={13} /> Export JSON</a>
          </div>
          <div className="card border-rose-500/30">
            <div className="flex items-start gap-3">
              <Trash2 size={18} className="mt-0.5 text-rose-300" />
              <div className="flex-1">
                <h3 className="font-semibold text-rose-200">Delete account</h3>
                <p className="mt-1 text-sm text-arjun-muted">
                  Permanently deletes your account, journal, messages, posts and connections. This cannot be undone.
                </p>
                <Button variant="danger" size="sm" className="mt-3" onClick={() => setDeleteOpen(true)}>Delete my account</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account?" description="This permanently deletes all of your data. Enter your password to confirm.">
        <div className="space-y-4">
          <div>
            <Label>Password</Label>
            <Input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder="Your current password" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={deleteAccount} disabled={deleting || !deletePassword}>
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete permanently
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
