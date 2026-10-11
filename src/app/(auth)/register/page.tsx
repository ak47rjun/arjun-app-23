'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Input, Label, Separator } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/api/auth/register', { email, password, displayName: displayName || undefined });
      toast.success('Account created — check your email to verify your address');
      router.push('/onboarding');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Create your account</h1>
      <p className="mt-1 text-sm text-arjun-muted">Join the Real Trader&apos;s Hub — free to start.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="displayName">Display name</Label>
          <Input id="displayName" required minLength={2} maxLength={50} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Arjun" />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <Separator className="my-5" />
      <a href="/api/auth/google" className="btn-ghost w-full">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M21.6 12.2c0-.7-.06-1.4-.18-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z" fill="#4285F4" />
          <path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" fill="#34A853" />
          <path d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9L6.4 14Z" fill="#FBBC05" />
          <path d="M12 6c1.5 0 2.8.5 3.8 1.5L18.7 4.6A10 10 0 0 0 3.1 7.5L6.4 10c.8-2.3 3-4 5.6-4Z" fill="#EA4335" />
        </svg>
        Continue with Google
      </a>
      <p className="mt-6 text-center text-sm text-arjun-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-emerald-300 hover:text-emerald-200">Sign in</Link>
      </p>
    </div>
  );
}
