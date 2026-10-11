import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireServerSession } from '@/lib/auth/server-session';
import { SessionProvider } from '@/lib/client/session';
import { AppShell } from '@/components/layout/app-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireServerSession();
  if (!user.profile?.onboardingDone && !user.emailVerified) {
    // onboarding doubles as the email-verification nudge for new users
  }
  if (!user.profile?.onboardingDone) {
    redirect('/onboarding');
  }
  return (
    <SessionProvider initialUser={user as never}>
      <AppShell initialUser={user as never}>{children}</AppShell>
    </SessionProvider>
  );
}
