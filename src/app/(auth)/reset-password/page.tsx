'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Input, Label } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-arjun-muted">Loading…</div>}>
      <ResetPasswordPageInner />
    </Suspense>
  );
}

function ResetPasswordPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/api/auth/reset-password', { token, password });
      toast.success('Password updated — sign in with your new password');
      router.push('/login');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div>
        <h1 className="font-display text-2xl font-bold">Invalid link</h1>
        <p className="mt-2 text-sm text-arjun-muted">This reset link is missing its token. Request a new one.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Choose a new password</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </div>
  );
}
