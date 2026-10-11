import {
  LayoutDashboard,
  CandlestickChart,
  Star,
  BookOpen,
  BarChart3,
  MessagesSquare,
  Users,
  LineChart,
  Link2,
  CalendarDays,
  Bell,
  Settings,
  Shield,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: string[];
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/terminal', label: 'Terminal', icon: CandlestickChart },
  { href: '/watchlist', label: 'Watchlist', icon: Star },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/messages', label: 'Messages', icon: MessagesSquare },
  { href: '/community', label: 'Community', icon: Users },
  { href: '/charts', label: 'Shared Charts', icon: LineChart },
  { href: '/mt5', label: 'MT5 Accounts', icon: Wallet },
  { href: '/meetings', label: 'ARJUN Meet', icon: CalendarDays },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/admin', label: 'Admin', icon: Shield, roles: ['ADMIN'] },
];

export const MOBILE_NAV_ITEMS: NavItem[] = [
  { href: '/terminal', label: 'Terminal', icon: CandlestickChart },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/messages', label: 'Messages', icon: MessagesSquare },
  { href: '/community', label: 'Community', icon: Users },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
];
