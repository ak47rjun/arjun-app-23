'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Button } from '@/components/ui';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-arjun-muted">Loading…</div>}>
      <VerifyEmailPageInner />
    </Suspense>
  );
}

function VerifyEmailPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'verifying' | 'ok' | 'error' | 'idle'>(token ? 'verifying' : 'idle');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!token) return;
    api
      .post('/api/auth/verify-email', { token })
      .then(() => setStatus('ok'))
      .catch(() => setStatus('error'));
  }, [token]);

  const resend = async () => {
    if (!email) return;
    await api.post('/api/auth/resend-verification', { email });
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Verify your email</h1>
      {status === 'verifying' && <p className="mt-3 text-sm text-arjun-muted">Verifying your email address…</p>}
      {status === 'ok' && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Your email is verified. You&apos;re all set — head to your dashboard.
        </div>
      )}
      {status === 'error' && (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          This verification link is invalid or has expired.
        </div>
      )}
      {status !== 'ok' && (
        <div className="mt-6 space-y-3">
          <input className="input" type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button className="w-full" onClick={resend}>Resend verification email</Button>
        </div>
      )}
      <p className="mt-6 text-center text-sm text-arjun-muted">
        <Link href="/dashboard" className="font-medium text-emerald-300 hover:text-emerald-200">Continue to ARJUN</Link>
      </p>
    </div>
  );
}
