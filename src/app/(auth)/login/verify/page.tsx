'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Input, Label } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

export default function TwoFactorPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/api/auth/login/2fa', { code });
      toast.success('Welcome back');
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Two-factor authentication</h1>
      <p className="mt-1 text-sm text-arjun-muted">Enter the 6-digit code from your authenticator app.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="code">Authenticator code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            className="text-center font-mono text-2xl tracking-[0.5em]"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
          {loading ? 'Verifying…' : 'Verify & sign in'}
        </Button>
      </form>
    </div>
  );
}
