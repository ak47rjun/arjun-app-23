'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Input, Label, Separator } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-arjun-muted">Loading…</div>}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState<boolean | null>(null);
  const error = searchParams.get('error');

  useEffect(() => {
    api
      .get<{ configured: boolean }>('/api/auth/google/status')
      .then((s) => setGoogleConfigured(s.configured))
      .catch(() => setGoogleConfigured(false));
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post<{ requires2fa?: boolean }>('/api/auth/login', { email, password });
      if (res.requires2fa) {
        router.push('/login/verify');
        return;
      }
      toast.success('Welcome back');
      router.push(searchParams.get('next') || '/dashboard');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-arjun-muted">Welcome back to the hub.</p>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error === 'google_not_configured' && 'Google sign-in is not configured on this server yet — use email/password.'}
          {error === 'oauth_failed' && 'Google sign-in failed. Please try again.'}
          {error === 'oauth_state_mismatch' && 'Sign-in session expired. Please try again.'}
          {error === 'account_suspended' && 'This account has been suspended.'}
          {error === 'admin_required' && 'That area requires administrator access.'}
          {!['google_not_configured', 'oauth_failed', 'oauth_state_mismatch', 'account_suspended', 'admin_required'].includes(error) && 'Sign-in failed. Please try again.'}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs text-emerald-300 hover:text-emerald-200">Forgot password?</Link>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-arjun-muted">or</span>
        <Separator className="flex-1" />
      </div>
      {googleConfigured === false ? (
        <div className="space-y-1.5">
          <button type="button" disabled className="btn-ghost w-full cursor-not-allowed opacity-60">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M21.6 12.2c0-.7-.06-1.4-.18-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z" fill="#4285F4" />
              <path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" fill="#34A853" />
              <path d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9L6.4 14Z" fill="#FBBC05" />
              <path d="M12 6c1.5 0 2.8.5 3.8 1.5L18.7 4.6A10 10 0 0 0 3.1 7.5L6.4 10c.8-2.3 3-4 5.6-4Z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>
          <p className="text-center text-[11px] text-arjun-muted">Google sign-in is not configured on this server yet.</p>
        </div>
      ) : (
        <a href="/api/auth/google" className="btn-ghost w-full">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M21.6 12.2c0-.7-.06-1.4-.18-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z" fill="#4285F4" />
            <path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" fill="#34A853" />
            <path d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9L6.4 14Z" fill="#FBBC05" />
            <path d="M12 6c1.5 0 2.8.5 3.8 1.5L18.7 4.6A10 10 0 0 0 3.1 7.5L6.4 10c.8-2.3 3-4 5.6-4Z" fill="#EA4335" />
          </svg>
          Continue with Google
        </a>
      )}

      <p className="mt-6 text-center text-sm text-arjun-muted">
        New to ARJUN?{' '}
        <Link href="/register" className="font-medium text-emerald-300 hover:text-emerald-200">Create an account</Link>
      </p>
      <p className="mt-2 text-center text-xs text-arjun-muted">
        <Link href="/login?next=%2Fadmin" className="hover:text-arjun-text">Administrator sign in →</Link>
      </p>
    </div>
  );
}
