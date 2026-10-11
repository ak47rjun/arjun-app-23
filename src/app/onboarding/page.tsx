'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Input, Label, Select } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

const MARKETS = ['Forex', 'Indices', 'Commodities', 'Crypto', 'Stocks'];
const TIMEZONES = ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/Berlin'];

export default function OnboardingPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [experienceYears, setExperienceYears] = useState('1');
  const [markets, setMarkets] = useState<string[]>(['Forex']);
  const [timezone, setTimezone] = useState('UTC');
  const [loading, setLoading] = useState(false);

  const toggleMarket = (m: string) =>
    setMarkets((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.patch('/api/users/me', {
        displayName,
        timezone,
        profile: {
          experienceYears: Number(experienceYears),
          preferredMarkets: markets,
          onboardingDone: true,
        },
      });
      toast.success('Profile set up — welcome to ARJUN');
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Could not save profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="pointer-events-none fixed inset-0 bg-aurora" />
      <div className="relative w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 font-display font-bold text-white shadow-glow">A</div>
          <h1 className="mt-4 font-display text-3xl font-bold">Set up your trader profile</h1>
          <p className="mt-2 text-sm text-arjun-muted">This powers your dashboard, journal analytics and community presence.</p>
        </div>
        <form onSubmit={onSubmit} className="card space-y-5 animate-fade-up">
          <div>
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" required minLength={2} maxLength={50} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="How traders will see you" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="experience">Experience (years)</Label>
              <Select id="experience" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)}>
                {['0', '1', '2', '3', '5', '8', '10', '15', '20+'].map((y) => (
                  <option key={y} value={y === '20+' ? '20' : y}>{y}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="timezone">Time zone</Label>
              <Select id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {TIMEZONES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>Preferred markets</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {MARKETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMarket(m)}
                  className={`rounded-xl border px-3 py-1.5 text-sm transition-all ${
                    markets.includes(m)
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                      : 'border-arjun-line text-arjun-muted hover:text-arjun-text'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Saving…' : 'Enter the platform'}
          </Button>
        </form>
      </div>
    </main>
  );
}
