'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface SessionUser {
  id: string;
  email: string;
  emailVerified: Date | string | null;
  role: 'GUEST' | 'MEMBER' | 'VERIFIED_TRADER' | 'MODERATOR' | 'ADMIN';
  displayName: string | null;
  name: string | null;
  avatarUrl: string | null;
  bio?: string | null;
  timezone: string;
  totpEnabled: boolean;
  isBanned: boolean;
  profile: {
    onboardingDone: boolean;
    verifiedBadge: boolean;
    isPublic: boolean;
    experienceYears?: number | null;
    preferredMarkets?: string[];
    country?: string | null;
    showStats?: boolean;
  } | null;
  settings: { theme: string; dashboardLayout: unknown } | null;
  stats?: { trades: number; posts: number; followers: number; following: number };
  unreadNotifications?: number;
}

interface SessionContextValue {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (u: SessionUser | null) => void;
}

const SessionContext = createContext<SessionContextValue>({ user: null, loading: true, refresh: async () => {}, setUser: () => {} });

export function SessionProvider({ children, initialUser }: { children: ReactNode; initialUser: SessionUser | null }) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const [loading, setLoading] = useState(initialUser === null);

  const refresh = async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      /* keep current */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialUser === null) void refresh();
  }, [initialUser]);

  return (
    <SessionContext.Provider value={{ user, loading, refresh, setUser }}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
