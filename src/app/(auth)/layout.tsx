import type { ReactNode } from 'react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="pointer-events-none fixed inset-0 bg-aurora" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 font-display font-bold text-white shadow-glow">
              A
            </div>
            <span className="font-display text-2xl font-bold tracking-tight text-gradient">ARJUN</span>
          </Link>
        </div>
        <div className="card animate-fade-up">{children}</div>
        <p className="mt-6 text-center text-xs text-arjun-muted">
          Trading involves substantial risk of loss. ARJUN is not a broker and nothing on the platform is financial advice.
        </p>
      </div>
    </main>
  );
}
