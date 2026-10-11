'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { NAV_ITEMS, MOBILE_NAV_ITEMS } from './nav';
import { Avatar, Badge } from '@/components/ui';
import { useSession, type SessionUser } from '@/lib/client/session';
import { realtime } from '@/lib/client/realtime';
import { api, ApiClientError } from '@/lib/client/api';

export function AppShell({ children, initialUser }: { children: React.ReactNode; initialUser: SessionUser }) {
  const pathname = usePathname();
  const { user, setUser, refresh } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unread, setUnread] = useState(initialUser.unreadNotifications ?? 0);

  // realtime: unread badge + toasts
  useEffect(() => {
    if (!initialUser?.id) return;
    let cancelled = false;
    const registered: Array<[string, (payload: any) => void]> = [];
    const bind = (event: string, handler: (payload: any) => void) => {
      realtime.on(event, handler);
      registered.push([event, handler]);
    };
    const onNotification = (n: { title: string; body?: string }) => {
      setUnread((u) => u + 1);
      toast(n.title, { description: n.body });
    };
    const onMessage = (m: { content?: string | null; sender?: { displayName?: string | null } }) => {
      setUnread((u) => u + 1);
      toast('New message', { description: m.content ?? m.sender?.displayName ?? undefined });
    };

    void realtime.start({ userId: initialUser.id }).then(() => {
      if (cancelled) return;
      bind('notification:new', onNotification);
      bind('message:new', onMessage);
    });

    return () => {
      cancelled = true;
      for (const [event, handler] of registered) realtime.off(event, handler);
    };
  }, [initialUser?.id]);

  // Close the transport when the shell unmounts (e.g. after sign-out).
  useEffect(() => {
    return () => realtime.close();
  }, []);

  const visibleNav = useMemo(
    () => NAV_ITEMS.filter((i) => !i.roles || (user && i.roles.includes(user.role))),
    [user],
  );

  const handleLogout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* ignore */
    }
    setUser(null);
    window.location.href = '/login';
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen">
      {/* ── Desktop sidebar ── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-arjun-line bg-arjun-bg2/80 backdrop-blur-glass transition-all duration-300 lg:flex',
          sidebarOpen ? 'w-64' : 'w-[72px]',
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-arjun-line px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 font-display font-bold text-white shadow-glow">
            A
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <div className="truncate font-display text-lg font-bold tracking-tight text-gradient">ARJUN</div>
              <div className="truncate text-[11px] text-arjun-muted">The Real Trader&apos;s Hub</div>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                  active
                    ? 'bg-emerald-500/12 text-emerald-200 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.25)]'
                    : 'text-arjun-muted hover:bg-white/[0.04] hover:text-arjun-text',
                  !sidebarOpen && 'justify-center',
                )}
                title={item.label}
              >
                <Icon size={18} className={cn('shrink-0', active && 'text-emerald-300')} />
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-arjun-line p-3">
          <div className={cn('flex items-center gap-3 rounded-xl p-2', !sidebarOpen && 'justify-center')}>
            <Avatar src={user.avatarUrl} name={user.displayName ?? user.email} size={36} />
            {sidebarOpen && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{user.displayName ?? user.email}</span>
                  {user.profile?.verifiedBadge && <Badge variant="cyan">✓</Badge>}
                </div>
                <span className="text-[11px] uppercase tracking-wider text-arjun-muted">{user.role.replace('_', ' ')}</span>
              </div>
            )}
          </div>
          {sidebarOpen && (
            <button onClick={handleLogout} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-arjun-muted hover:bg-white/[0.04] hover:text-rose-300">
              <LogOut size={16} /> Sign out
            </button>
          )}
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className={cn('flex min-h-screen min-w-0 flex-1 flex-col transition-all duration-300', sidebarOpen ? 'lg:pl-64' : 'lg:pl-[72px]')}>
        {/* ── Topbar ── */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-arjun-line bg-arjun-bg/70 px-4 backdrop-blur-glass">
          <button className="hidden rounded-lg p-2 text-arjun-muted hover:bg-white/5 hover:text-arjun-text lg:block" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle sidebar">
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
          <button className="rounded-lg p-2 text-arjun-muted hover:bg-white/5 hover:text-arjun-text lg:hidden" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">
            <Menu size={18} />
          </button>

          <div className="relative hidden max-w-md flex-1 md:block">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-arjun-muted" />
            <input
              className="input h-9 pl-9 text-sm"
              placeholder="Search markets, traders, messages…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') window.location.href = `/watchlist?q=${encodeURIComponent((e.target as HTMLInputElement).value)}`;
              }}
            />
          </div>

          <div className="ml-auto flex items-center gap-1">
            <Link href="/notifications" className="relative rounded-lg p-2 text-arjun-muted hover:bg-white/5 hover:text-arjun-text" aria-label="Notifications">
              <Bell size={18} />
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
            <Link href="/terminal" className="btn-primary hidden !py-1.5 text-xs sm:inline-flex">
              Open Terminal
            </Link>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">{children}</main>

        <footer className="border-t border-arjun-line px-6 py-4 text-center text-xs text-arjun-muted">
          ARJUN — The Real Trader&apos;s Hub · Not financial advice · Past performance does not guarantee future results
        </footer>
      </div>

      {/* ── Mobile nav ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-arjun-line bg-arjun-bg2/90 pb-safe backdrop-blur-glass lg:hidden">
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]', active ? 'text-emerald-300' : 'text-arjun-muted')}
            >
              <Icon size={19} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="h-14 lg:hidden" />

      {/* ── Mobile menu drawer ── */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="absolute inset-y-0 left-0 w-72 border-r border-arjun-line bg-arjun-bg2 p-4"
            >
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 font-display font-bold text-white">A</div>
                <span className="font-display text-lg font-bold text-gradient">ARJUN</span>
              </div>
              <nav className="space-y-1">
                {visibleNav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-arjun-muted hover:bg-white/[0.04] hover:text-arjun-text"
                    >
                      <Icon size={18} /> {item.label}
                    </Link>
                  );
                })}
              </nav>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
